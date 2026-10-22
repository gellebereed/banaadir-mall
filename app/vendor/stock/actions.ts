"use server";

/**
 * THE STOCK PAGE — every write it performs.
 *
 * The shop is always taken from the session; codes are only ever matched
 * against that shop's own products, so a file can't touch anyone else's.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProductsByStore, getPosSettings } from "@/lib/api";
import { may } from "@/lib/auth";
import { mutateDB } from "@/lib/db";
import { readTables, isSupportedFile, type SheetTable } from "@/lib/import/workbook";
import { requireVendor } from "@/lib/session";
import { applyToProduct, guessColumns, parseQty, planStock, planSummary, type StockMode, type StockPlan } from "@/lib/stock-sync";
import { saveStock } from "@/lib/stock-write";
import { CACHE_TAGS } from "@/lib/supabase/public-client";
import { updatePosSettingsInSupabase, useSupabaseMutations } from "@/lib/supabase/mutations";
import type { PosSettings } from "@/lib/types";

const MAX_BYTES = 15 * 1024 * 1024;

async function requireStockAccess() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) throw new Error("Your account is not allowed to change stock.");
  return { session, storeSlug };
}

function refreshStock() {
  revalidateTag(CACHE_TAGS.products);
  revalidateTag(CACHE_TAGS.stores);
  revalidatePath("/vendor/stock");
}

async function savePos(storeSlug: string, patch: Partial<PosSettings>) {
  const next = { ...(await getPosSettings(storeSlug)), ...patch };
  if (useSupabaseMutations()) {
    const result = await updatePosSettingsInSupabase(storeSlug, next);
    if (!result.ok) return false;
  } else {
    await mutateDB((db) => {
      db.storeOverrides[storeSlug] = { ...db.storeOverrides[storeSlug], pos: next };
    });
  }
  return true;
}

export interface StockPreview {
  ok: boolean;
  message?: string;
  sheets: { name: string; headers: string[]; sample: string[][]; rows: number }[];
  sheet?: string;
  codeColumn?: string;
  qtyColumn?: string;
  mode: StockMode;
  /** The columns came from this shop's last upload. */
  remembered: boolean;
  plan?: StockPlan;
}

interface Parsed {
  tables: SheetTable[];
  table?: SheetTable;
  codeColumn?: string;
  qtyColumn?: string;
  mode: StockMode;
  remembered: boolean;
}

async function parseUpload(formData: FormData, storeSlug: string): Promise<Parsed | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your stock file." };
  if (!isSupportedFile(file.name)) return { error: `${file.name} isn't a spreadsheet. Export it from your POS as .xlsx or .csv.` };
  if (file.size > MAX_BYTES) return { error: "That file is over 15 MB — export just the stock columns, or save it as CSV." };

  let tables: SheetTable[];
  try {
    tables = readTables(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that file." };
  }
  if (tables.length === 0) return { error: "That file has no rows we can read." };

  const saved = (await getPosSettings(storeSlug)).stockImport;
  const want = (key: string) => String(formData.get(key) ?? "").trim() || undefined;

  // The sheet: the one asked for, else the remembered one, else the first.
  const table =
    tables.find((t) => t.name === want("sheet")) ??
    tables.find((t) => t.name === saved?.sheet) ??
    tables[0];
  const has = (col?: string) => (col && table.headers.includes(col) ? col : undefined);
  const guess = guessColumns(table.headers);
  const codeColumn = has(want("codeColumn")) ?? has(saved?.codeColumn) ?? guess.codeColumn;
  const qtyColumn = has(want("qtyColumn")) ?? has(saved?.qtyColumn) ?? guess.qtyColumn;
  const mode = (want("mode") as StockMode) ?? saved?.mode ?? "set";
  const remembered = Boolean(saved && codeColumn === saved.codeColumn && qtyColumn === saved.qtyColumn);
  return { tables, table, codeColumn, qtyColumn, mode: mode === "add" ? "add" : "set", remembered };
}

function rowsFrom(table: SheetTable, codeColumn: string, qtyColumn: string) {
  const ci = table.headers.indexOf(codeColumn);
  const qi = table.headers.indexOf(qtyColumn);
  return table.rows
    .map((row, i) => ({ code: row[ci] ?? "", qty: parseQty(row[qi] ?? "") ?? NaN, line: table.headerRow + 1 + i }))
    .filter((r) => r.code.trim() !== "");
}

/** Read the file and show what it WOULD change — nothing is written. */
export async function previewStockFile(formData: FormData): Promise<StockPreview> {
  const { storeSlug } = await requireStockAccess();
  const parsed = await parseUpload(formData, storeSlug);
  if ("error" in parsed) return { ok: false, message: parsed.error, sheets: [], mode: "set", remembered: false };

  const sheets = parsed.tables.map((t) => ({ name: t.name, headers: t.headers, sample: t.rows.slice(0, 4), rows: t.rows.length }));
  const base = { sheets, sheet: parsed.table?.name, codeColumn: parsed.codeColumn, qtyColumn: parsed.qtyColumn, mode: parsed.mode, remembered: parsed.remembered };
  if (!parsed.table || !parsed.codeColumn || !parsed.qtyColumn) {
    return { ok: false, message: "Choose which column has the barcode or code, and which has the quantity.", ...base };
  }
  const products = await getBaseProductsByStore(storeSlug);
  const plan = planStock(products, rowsFrom(parsed.table, parsed.codeColumn, parsed.qtyColumn), parsed.mode);
  return { ok: true, ...base, plan };
}

/** Apply the file, and remember its layout for next time. */
export async function applyStockFile(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { storeSlug } = await requireStockAccess();
  const parsed = await parseUpload(formData, storeSlug);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!parsed.table || !parsed.codeColumn || !parsed.qtyColumn) {
    return { ok: false, message: "Choose the code and quantity columns first." };
  }

  const products = await getBaseProductsByStore(storeSlug);
  const plan = planStock(products, rowsFrom(parsed.table, parsed.codeColumn, parsed.qtyColumn), parsed.mode);
  const failed = await writeChanges(products, plan.changes);

  await savePos(storeSlug, {
    stockImport: { codeColumn: parsed.codeColumn, qtyColumn: parsed.qtyColumn, sheet: parsed.table.name, mode: parsed.mode },
  });
  await logActivity(storeSlug, "stock.import", `Stock file uploaded: ${planSummary(plan)}`, parsed.table.name);
  refreshStock();

  if (failed > 0) return { ok: false, message: `${plan.changes.length - failed} updated, but ${failed} could not be saved — upload again to retry them.` };
  return {
    ok: true,
    message: `Done — ${plan.changes.length} product${plan.changes.length === 1 ? "" : "s"} updated${plan.soldOut ? `, ${plan.soldOut} now sold out` : ""}. Your columns are remembered for tomorrow.`,
  };
}

/** Write changes product by product, a few at a time. Returns how many failed. */
async function writeChanges(
  products: Awaited<ReturnType<typeof getBaseProductsByStore>>,
  changes: { productId: string; variantId?: string; to: number }[],
): Promise<number> {
  const byProduct = new Map<string, typeof changes>();
  for (const c of changes) byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c]);
  const jobs = [...byProduct].map(([productId, list]) => async () => {
    const product = products.find((p) => p.id === productId);
    if (!product) return false;
    return saveStock(productId, applyToProduct(product, list));
  });

  let failed = 0;
  // Eight at a time: a first upload can touch every product in the shop,
  // and one request after another would outlast the server's time limit.
  for (let i = 0; i < jobs.length; i += 8) {
    const results = await Promise.all(jobs.slice(i, i + 8).map((job) => job().catch(() => false)));
    failed += results.filter((ok) => !ok).length;
  }
  return failed;
}

/** The quick stock screen: set counts by hand (or by scanning). */
export async function setStockLevels(
  updates: { productId: string; variantId?: string; stock: number }[],
): Promise<{ ok: boolean; message: string }> {
  const { storeSlug } = await requireStockAccess();
  const products = await getBaseProductsByStore(storeSlug);
  const own = new Set(products.map((p) => p.id));
  const changes = updates
    .filter((u) => own.has(u.productId) && Number.isFinite(u.stock))
    .map((u) => ({ productId: u.productId, variantId: u.variantId, to: Math.max(0, Math.floor(u.stock)) }));
  if (changes.length === 0) return { ok: false, message: "Nothing to save." };

  const failed = await writeChanges(products, changes);
  await logActivity(storeSlug, "stock.update", `Stock updated by hand for ${changes.length} item${changes.length === 1 ? "" : "s"}`, "");
  refreshStock();
  return failed
    ? { ok: false, message: `${failed} couldn't be saved — try again.` }
    : { ok: true, message: `Saved ${changes.length} item${changes.length === 1 ? "" : "s"}.` };
}

/** The optional safety buffer (0 = off). */
export async function saveStockBuffer(buffer: number): Promise<{ ok: boolean; message: string }> {
  const { storeSlug } = await requireStockAccess();
  const value = Math.max(0, Math.min(20, Math.floor(Number(buffer) || 0)));
  const ok = await savePos(storeSlug, { stockBuffer: value });
  refreshStock();
  return ok
    ? { ok: true, message: value ? `Saved — items show sold out online when ${value} or fewer are left.` : "Saved — every unit you have is sellable online." }
    : { ok: false, message: "Couldn't save — run supabase/migration-pos.sql if this keeps happening." };
}
