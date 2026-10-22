/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STOCK SYNC — a shop's own till says how many it has; this makes the
 *  website agree.
 * ─────────────────────────────────────────────────────────────────────────
 * Every shop already counts its stock in its own POS (or a spreadsheet).
 * Rather than ask anyone to type those numbers in twice, the shop uploads
 * the stock report its POS already produces; each row is matched to a
 * product (or a size/colour of one) by BARCODE or INTERNAL REFERENCE — the
 * codes the POS knows the item by — and the count is set.
 *
 * Nothing is written until the shop has seen the preview: what changes,
 * what sells out, which codes didn't match anything.
 *
 * Pure: no I/O. The vendor stock actions read and write.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product, Variant } from "./types";

export type StockMode = "set" | "add";

export interface StockRow {
  code: string;
  qty: number;
  /** Row number in the file, for "row 14 didn't match". */
  line?: number;
}

export interface StockChange {
  productId: string;
  variantId?: string;
  name: string;
  /** "Navy · M" for a variant. */
  label?: string;
  from: number;
  to: number;
}

export interface StockPlan {
  changes: StockChange[];
  /** Matched, but the count is already right. */
  unchanged: number;
  /** Codes in the file that match nothing in this shop. */
  notFound: { code: string; line?: number }[];
  /** Rows with no usable number. */
  invalid: { code: string; line?: number }[];
  /** How many changes take something to zero. */
  soldOut: number;
}

/** Codes compare without spaces/dashes/leading zeros' accidents of Excel. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]+/g, "").replace(/\.0+$/, "");
}

interface Target {
  product: Product;
  variant?: Variant;
}

/** Every code this shop's products answer to → the product (or variant). */
export function codeIndex(products: Product[]): Map<string, Target> {
  const index = new Map<string, Target>();
  const add = (code: string | undefined, target: Target) => {
    if (!code) return;
    const key = normaliseCode(code);
    if (key && !index.has(key)) index.set(key, target);
  };
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      add(variant.barcode, { product, variant });
      add(variant.sku, { product, variant });
    }
    // A product without variants is its own stock line.
    if (!product.variants?.length) {
      add(product.barcode, { product });
      add(product.internalReference, { product });
    }
  }
  return index;
}

/** "12", "12.0", "1,200", "-3" → a whole number ≥ 0, or null. */
export function parseQty(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * What the file would change. Several rows for the same item (a POS that
 * lists one row per warehouse shelf) are added together first.
 */
export function planStock(products: Product[], rows: StockRow[], mode: StockMode): StockPlan {
  const index = codeIndex(products);
  const totals = new Map<string, { target: Target; qty: number }>();
  const notFound: StockPlan["notFound"] = [];
  const invalid: StockPlan["invalid"] = [];

  for (const row of rows) {
    const code = normaliseCode(row.code);
    if (!code) continue;
    if (!Number.isFinite(row.qty)) {
      invalid.push({ code: row.code, line: row.line });
      continue;
    }
    const target = index.get(code);
    if (!target) {
      notFound.push({ code: row.code, line: row.line });
      continue;
    }
    const key = `${target.product.id}|${target.variant?.id ?? ""}`;
    const entry = totals.get(key) ?? { target, qty: 0 };
    entry.qty += row.qty;
    totals.set(key, entry);
  }

  const changes: StockChange[] = [];
  let unchanged = 0;
  for (const { target, qty } of totals.values()) {
    const from = target.variant ? target.variant.stock : target.product.stock;
    const to = mode === "add" ? from + qty : qty;
    if (to === from) {
      unchanged += 1;
      continue;
    }
    changes.push({
      productId: target.product.id,
      variantId: target.variant?.id,
      name: target.product.name,
      label: target.variant ? [target.variant.color, target.variant.size].filter(Boolean).join(" · ") : undefined,
      from,
      to,
    });
  }

  changes.sort((a, b) => Number(b.to === 0) - Number(a.to === 0) || a.name.localeCompare(b.name));
  return { changes, unchanged, notFound, invalid, soldOut: changes.filter((c) => c.to === 0).length };
}

/**
 * The stock fields to save for one product after `changes` — the product
 * count, or its variants plus their total (the product count is kept as
 * the sum so listings and "in stock" filters stay right).
 */
export function applyToProduct(
  product: Product,
  changes: { variantId?: string; to: number }[],
): Pick<Product, "stock"> & Partial<Pick<Product, "variants">> {
  if (!product.variants?.length) {
    const last = changes.filter((c) => !c.variantId).pop();
    return { stock: last ? Math.max(0, last.to) : product.stock };
  }
  const byVariant = new Map(changes.filter((c) => c.variantId).map((c) => [c.variantId!, Math.max(0, c.to)]));
  const variants = product.variants.map((v) => (byVariant.has(v.id) ? { ...v, stock: byVariant.get(v.id)! } : v));
  return { variants, stock: variants.reduce((t, v) => t + (v.stock ?? 0), 0) };
}

/**
 * Guess which columns hold the code and the count, from their headers —
 * "Barcode", "SKU", "Internal Reference", "Qty On Hand", "Stock"… Used the
 * first time; after that the shop's own choice is remembered.
 */
export function guessColumns(headers: string[]): { codeColumn?: string; qtyColumn?: string } {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
  const find = (patterns: RegExp[]) =>
    patterns.map((re) => headers.find((h) => re.test(norm(h)))).find(Boolean);
  return {
    codeColumn: find([/^barcode/, /ean|upc|gtin/, /^sku/, /internalref|reference|itemcode|productcode|^code/]),
    qtyColumn: find([/qtyonhand|quantityonhand|onhand/, /available|instock|^stock/, /^qty|quantity/, /count|balance/]),
  };
}

/** A small, honest picture of the plan for the activity log. */
export function planSummary(plan: StockPlan): string {
  const parts = [`${plan.changes.length} updated`];
  if (plan.soldOut) parts.push(`${plan.soldOut} sold out`);
  if (plan.notFound.length) parts.push(`${plan.notFound.length} codes not found`);
  return parts.join(" · ");
}
