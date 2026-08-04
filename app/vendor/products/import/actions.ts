"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SUPPLIER IMPORT — the three server actions the wizard calls.
 * ─────────────────────────────────────────────────────────────────────────
 *   inspectUpload   stage 1     read the file, suggest a column mapping
 *   previewImport   stages 2–5  say exactly what would happen
 *   runImport       stage 6     do it, one batch at a time
 *
 * ── Why the file is re-sent with every call ──────────────────────────────
 * There is no server-side upload state, and deliberately so. Serverless
 * invocations do not share memory, so anything cached between steps has to
 * be written somewhere and cleaned up afterwards — and a half-finished
 * import that leaves a temp file behind is a worse bug than re-sending
 * 240 KB. Every call re-reads the file and re-derives the plan from the
 * settings, which also means the commit can never write a plan that
 * differs from the one the seller approved: it recomputes it rather than
 * trusting a payload the browser could have edited.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { getBaseProducts, getCategories } from "@/lib/api";
import { can } from "@/lib/auth";
import { categoryIcon } from "@/lib/category-icons";
import { mutateDB } from "@/lib/db";
import { buildProduct } from "@/lib/import/build";
import { analyse, defaultSettings, inspect, type ImportSettings } from "@/lib/import/pipeline";
import { isSupportedFile } from "@/lib/import/workbook";
import { validateProductCodes } from "@/lib/odoo/mapping";
import { getSession } from "@/lib/session";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  upsertCategoryInSupabase,
  upsertProductWithError,
  useSupabaseMutations,
} from "@/lib/supabase/mutations";
import type { Product } from "@/lib/types";
import type { ImportIssue } from "@/lib/import/aggregate";
import type { InspectResult } from "@/lib/import/pipeline";

/** Big enough for a season's order, small enough to reject a mistake early. */
const MAX_BYTES = 15 * 1024 * 1024;

/** Rows written per runImport call, so no single request runs long. */
const BATCH_SIZE = 20;

async function requireProductAccess(): Promise<{ storeSlug: string; isAdmin: boolean }> {
  const session = await getSession();
  if (!session || session.role === "customer") throw new Error("Please sign in.");
  if (!can(session, "products")) {
    throw new Error('Your account does not have "products" access.');
  }
  const storeSlug = session.role === "seller" && session.store ? session.store : "sahra-fashion";
  return { storeSlug, isAdmin: session.role === "admin" };
}

async function readUpload(formData: FormData): Promise<{ bytes: Buffer; filename: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a spreadsheet to import.");
  }
  if (!isSupportedFile(file.name)) {
    throw new Error(`${file.name} is not a spreadsheet. Upload an .xlsx or .csv file.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 15 MB. ` +
        `Split it, or save it as CSV.`,
    );
  }
  return { bytes: Buffer.from(await file.arrayBuffer()), filename: file.name };
}

/** Settings arrive as JSON from the client; merge over the defaults. */
function readSettings(formData: FormData, storeSlug: string): ImportSettings {
  const base = defaultSettings(storeSlug);
  const raw = String(formData.get("settings") ?? "");
  if (!raw) return base;

  try {
    const parsed = JSON.parse(raw) as Partial<ImportSettings>;
    return {
      ...base,
      ...parsed,
      // The store is taken from the SESSION, never from the payload — a
      // seller must not be able to write into another shop's catalogue by
      // editing a form field.
      storeSlug,
      pricing: { ...base.pricing, ...parsed.pricing },
    };
  } catch {
    return base;
  }
}

// ── Stage 1 ────────────────────────────────────────────────────────────

export type InspectResponse =
  | { ok: true; filename: string; result: InspectResult }
  | { ok: false; error: string };

export async function inspectUpload(formData: FormData): Promise<InspectResponse> {
  try {
    await requireProductAccess();
    const { bytes, filename } = await readUpload(formData);
    return { ok: true, filename, result: inspect(bytes, filename) };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Stages 2–5 ─────────────────────────────────────────────────────────

/** One row of the preview table. Deliberately small — 909 variants do not
 *  need to cross the wire for a seller to decide whether to commit. */
export interface PreviewProduct {
  itemCode: string;
  name: string;
  action: "create" | "update" | "blocked";
  matchedName?: string;
  category?: string;
  subcategory?: string;
  variantCount: number;
  qty: number;
  previousStock?: number;
  newStock: number;
  cost: number;
  price: number;
  margin: number;
  colors: string[];
  sizes: string[];
  sampleBarcode?: string;
  issues: string[];
}

export interface PreviewPayload {
  stats: {
    rows: number;
    skippedRows: number;
    mergedRows: number;
    units: number;
    products: number;
    create: number;
    update: number;
    blocked: number;
    totalQty: number;
    totalCost: number;
    retailValue: number;
  };
  products: PreviewProduct[];
  newCategories: { slug: string; name: string; count: number }[];
  existingCategories: { slug: string; name: string; count: number }[];
  issues: ImportIssue[];
  issueCounts: { error: number; warning: number; info: number };
  batchSize: number;
}

export type PreviewResponse =
  | { ok: true; payload: PreviewPayload }
  | { ok: false; error: string };

export async function previewImport(formData: FormData): Promise<PreviewResponse> {
  try {
    const { storeSlug } = await requireProductAccess();
    const { bytes, filename } = await readUpload(formData);
    const settings = readSettings(formData, storeSlug);

    const [catalogue, categories] = await Promise.all([getBaseProducts(), getCategories(true)]);
    const existingSlugs = categories.map((c) => c.slug);

    const analysis = analyse(bytes, filename, settings, catalogue, existingSlugs);
    const known = new Set(existingSlugs);

    const products: PreviewProduct[] = analysis.plan.products.map((planned) => {
      const draft = planned.draft;
      const colors = [...new Set(draft.variants.map((v) => v.color).filter(Boolean))] as string[];
      const sizes = [
        ...new Map(
          draft.variants
            .filter((v) => v.sizeLabel)
            .map((v) => [v.sizeLabel!, v.sizeOrder] as const),
        ),
      ]
        .sort((a, b) => a[1] - b[1])
        .map(([label]) => label);

      return {
        itemCode: draft.itemCode,
        name: draft.name,
        action: planned.action,
        matchedName: planned.existingName,
        category: draft.category?.name,
        subcategory: draft.subcategory,
        variantCount: draft.variants.length,
        qty: draft.totalQty,
        previousStock: planned.previousStock,
        newStock: planned.newStock,
        cost: draft.cost,
        price: draft.price,
        margin: draft.price > 0 ? Math.round(((draft.price - draft.cost) / draft.price) * 100) : 0,
        colors,
        sizes,
        sampleBarcode: draft.variants.find((v) => v.barcode)?.barcode,
        issues: planned.issues.map((issue) => issue.message),
      };
    });

    const countFor = (slug: string) =>
      analysis.aggregate.products.filter((p) => p.category?.slug === slug).length;

    const issueCounts = { error: 0, warning: 0, info: 0 };
    for (const issue of analysis.issues) issueCounts[issue.level]++;

    return {
      ok: true,
      payload: {
        stats: {
          rows: analysis.aggregate.stats.rows,
          skippedRows: analysis.aggregate.stats.skippedRows,
          mergedRows: analysis.aggregate.stats.mergedRows,
          units: analysis.aggregate.stats.units,
          products: analysis.aggregate.stats.products,
          create: analysis.plan.stats.create,
          update: analysis.plan.stats.update,
          blocked: analysis.plan.stats.blocked,
          totalQty: analysis.aggregate.stats.totalQty,
          totalCost: analysis.aggregate.stats.totalCost,
          retailValue: analysis.plan.stats.retailValue,
        },
        products,
        newCategories: analysis.plan.categoriesToCreate.map((c) => ({
          slug: c.slug,
          name: c.name,
          count: countFor(c.slug),
        })),
        existingCategories: analysis.aggregate.categories
          .filter((c) => known.has(c.slug))
          .map((c) => ({ slug: c.slug, name: c.name, count: countFor(c.slug) })),
        // Capped: a file with a thousand identical warnings would otherwise
        // ship a thousand copies of the same sentence to the browser.
        issues: analysis.issues.slice(0, 300),
        issueCounts,
        batchSize: BATCH_SIZE,
      },
    };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Stage 6 ────────────────────────────────────────────────────────────

export interface RunResult {
  ok: true;
  /** Products handled so far, including this batch. */
  processed: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: { name: string; reason: string }[];
  categoriesCreated: string[];
  done: boolean;
}

export type RunResponse = RunResult | { ok: false; error: string };

export async function runImport(formData: FormData): Promise<RunResponse> {
  try {
    const { storeSlug } = await requireProductAccess();
    const { bytes, filename } = await readUpload(formData);
    const settings = readSettings(formData, storeSlug);
    const offset = Math.max(0, Number(formData.get("offset") ?? 0));

    const [catalogue, categories] = await Promise.all([getBaseProducts(), getCategories(true)]);
    const analysis = analyse(
      bytes,
      filename,
      settings,
      catalogue,
      categories.map((c) => c.slug),
    );

    const importedAt = new Date().toISOString();
    const categoriesCreated: string[] = [];

    // Categories first, and only on the opening batch: `products.category`
    // is a foreign key onto `categories.slug`, so a product filed into a
    // category that does not exist yet is not merely invisible — the write
    // is rejected outright.
    if (offset === 0) {
      for (const category of analysis.plan.categoriesToCreate) {
        await createCategory(category.slug, category.name, category.parentSlug);
        categoriesCreated.push(category.name);
      }

      // Verify rather than assume. Every product in this run depends on
      // these rows existing, so one check here replaces one identical
      // failure per product — which is what a silent category failure
      // produced before: 104 rejections all saying the same thing.
      const missing = await missingCategorySlugs(
        analysis.plan.products
          .filter((planned) => planned.action !== "blocked")
          .map((planned) => planned.draft.category?.slug),
      );

      if (missing.length > 0) {
        return {
          ok: false,
          error:
            `Could not create ${missing.length === 1 ? "the category" : "these categories"}: ` +
            `${missing.join(", ")}. Every product in this file needs ${missing.length === 1 ? "it" : "them"}, ` +
            `so nothing was imported. Check the server log for the reason, then try again.`,
        };
      }
    }

    const byId = new Map(catalogue.map((product) => [product.id, product]));
    const batch = analysis.plan.products.slice(offset, offset + BATCH_SIZE);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { name: string; reason: string }[] = [];

    for (const planned of batch) {
      if (planned.action === "blocked") {
        skipped++;
        continue;
      }

      const existing = planned.existingId ? byId.get(planned.existingId) : undefined;
      const product = buildProduct(planned, existing, {
        storeSlug,
        overwriteDetails: settings.overwriteDetails,
        overwritePrices: settings.overwritePrices,
        publishImmediately: settings.publishImmediately,
        importedAt,
      });

      // The same validation a hand-typed product goes through. One bad row
      // must fail alone — 103 good products should not be lost to it.
      const problems = validateProductCodes(product);
      if (problems.length > 0) {
        failed.push({ name: product.name, reason: problems.join(" ") });
        continue;
      }

      try {
        await writeProduct(product);
        if (planned.action === "create") created++;
        else updated++;
      } catch (error) {
        failed.push({ name: product.name, reason: message(error) });
      }
    }

    const processed = Math.min(offset + batch.length, analysis.plan.products.length);
    const done = processed >= analysis.plan.products.length;

    if (done || categoriesCreated.length > 0) refresh();

    return {
      ok: true,
      processed,
      total: analysis.plan.products.length,
      created,
      updated,
      skipped,
      failed,
      categoriesCreated,
      done,
    };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Writes ─────────────────────────────────────────────────────────────

async function writeProduct(product: Product): Promise<void> {
  const result = await upsertProductWithError(product);
  if (result.ok) return;

  if (useSupabaseMutations()) {
    // Supabase is the source of truth when configured, and the read layer
    // ignores the JSON overlay whenever it returns rows. Writing there
    // would make the import LOOK successful and then silently revert.
    //
    // The database's own reason is reported verbatim. Guessing at a cause
    // here — as this used to, by suggesting a migration — sends someone to
    // fix a table that was never the problem.
    throw new Error(result.error ?? "The database rejected the write.");
  }

  await mutateDB((db) => {
    const index = db.newProducts.findIndex((p) => p.id === product.id);
    if (index >= 0) db.newProducts[index] = product;
    else db.newProducts.push(product);
  });
}

async function createCategory(slug: string, name: string, parentSlug: string): Promise<void> {
  const category = {
    slug,
    name,
    // Derived from the name rather than left as a parcel — an import that
    // creates thirteen categories should not create thirteen identical
    // icons for someone to fix by hand afterwards.
    icon: categoryIcon(name),
    tagline: "",
    art: { from: "#e0f2fe", to: "#bae6fd" },
    hidden: false,
    parentSlug,
  };

  if (useSupabaseMutations()) {
    // The return value is checked because it was not, once: a failed
    // category insert was reported to the seller as "Categories created"
    // and the import then walked into 104 foreign-key rejections.
    const ok = await upsertCategoryInSupabase(category);
    if (!ok) console.error(`[Import] could not create category "${slug}"`);
    return;
  }

  await mutateDB((db) => {
    db.categories = db.categories || [];
    const index = db.categories.findIndex((c) => c.slug === slug);
    if (index >= 0) db.categories[index] = category;
    else db.categories.push(category);
  });
}

/**
 * Which of these category slugs are still absent after we tried to create
 * them. Read fresh — `getCategories` is tag-cached, and the rows we just
 * wrote are exactly what that cache does not know about yet.
 */
async function missingCategorySlugs(
  wanted: (string | undefined)[],
): Promise<string[]> {
  const needed = [...new Set(wanted.filter((slug): slug is string => !!slug))];
  if (needed.length === 0) return [];

  const present = new Set(await readCategorySlugs());
  return needed.filter((slug) => !present.has(slug));
}

async function readCategorySlugs(): Promise<string[]> {
  if (!useSupabaseMutations()) {
    const { getCategories } = await import("@/lib/api");
    return (await getCategories(true)).map((category) => category.slug);
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("categories").select("slug");
  if (error) {
    console.error("[Import] could not re-read categories:", error.message);
    return [];
  }
  return (data ?? []).map((row: { slug: string }) => row.slug);
}

function refresh() {
  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/", "page");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
