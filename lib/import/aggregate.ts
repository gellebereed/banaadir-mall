/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGES 3 & 4 — invoice lines → sellable units → products.
 * ─────────────────────────────────────────────────────────────────────────
 * This is the step that decides whether an import is right or quietly
 * wrong, and it turns on one fact about supplier files:
 *
 *   A PURCHASE INVOICE IS LINE-GRAIN, NOT PRODUCT-GRAIN.
 *
 * The same physical item appears on several lines — in the file this was
 * built against, 475 of 909 items are split across two or three. Import the
 * rows as they come and the last line WINS: a barcode that arrived 25 + 4
 * lands with stock 4, and every barcode after the first collides with the
 * uniqueness rule and is rejected. So lines are aggregated into sellable
 * units first, summing quantity, and only then grouped into products.
 *
 *   1,524 rows  →  909 sellable units  →  104 products
 *
 * The two grouping keys are the supplier's own, which is why this works
 * without guesswork: the variant code identifies one colour+size, and the
 * item code identifies the style they all belong to. Exactly Odoo's
 * product.product / product.template split.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { gtinCheckDigit, normalizeBarcode, normalizeReference } from "../barcode.ts";
import { resolveColor } from "./colors.ts";
import {
  collectCategories,
  resolveCategory,
  resolveSubcategory,
  type CategoryRules,
  type ResolvedCategory,
} from "./categories.ts";
import { priceItem, type PricingRules } from "./pricing.ts";
import type { ColumnMapping, FieldKey } from "./schema.ts";
import { resolveSize } from "./sizes.ts";
import {
  brandName,
  cleanText,
  displayPhrase,
  formatComposition,
  parseNumber,
  slugify,
} from "./text.ts";

export type IssueLevel = "error" | "warning" | "info";

export interface ImportIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** Spreadsheet row number, when the issue belongs to one row. */
  row?: number;
  /** Product or variant the issue concerns, for grouping in the UI. */
  subject?: string;
}

export interface DraftVariant {
  /** Deterministic, so re-importing keeps carts and default choices valid. */
  id: string;
  sku: string;
  barcode?: string;
  color?: string;
  colorHex?: string;
  size?: string;
  sizeLabel?: string;
  sizeOrder: number;
  /** Units in THIS file. What happens to it depends on the stock mode. */
  qty: number;
  cost?: number;
  price?: number;
  /** Spreadsheet rows this unit was assembled from. */
  sourceRows: number[];
}

export interface DraftProduct {
  /** The grouping key. Falls back to the barcode when the file has no code. */
  itemCode: string;
  /**
   * The supplier's own product code, present only when the file actually
   * had that column. `itemCode` may be a barcode standing in for one, and
   * a barcode must never be written back as an Internal Reference.
   */
  styleCode?: string;
  name: string;
  slug: string;
  category?: ResolvedCategory;
  subcategory?: string;
  brand?: string;
  line?: string;
  season?: string;
  composition?: string;
  hsCode?: string;
  gender?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  /** Cost of the cheapest unit, in store currency. */
  cost: number;
  price: number;
  compareAt?: number;
  totalQty: number;
  description: string;
  features: string[];
  variants: DraftVariant[];
}

export interface AggregateOptions {
  category: CategoryRules;
  pricing: PricingRules;
  /**
   * Subcategory names the catalogue is already using, so a shipment lands
   * on the existing shelf rather than beside it. See resolveSubcategory.
   */
  existingSubcategories?: string[];
}

export interface AggregateResult {
  products: DraftProduct[];
  categories: ResolvedCategory[];
  issues: ImportIssue[];
  stats: {
    rows: number;
    skippedRows: number;
    units: number;
    products: number;
    mergedRows: number;
    totalQty: number;
    totalCost: number;
  };
}

/** One row, with the mapped columns pulled out and cleaned. */
interface SourceRow {
  row: number;
  values: Partial<Record<FieldKey, string>>;
}

function readRows(rows: string[][], mapping: ColumnMapping, firstRowNumber: number): SourceRow[] {
  const entries = Object.entries(mapping) as [FieldKey, number][];
  return rows.map((cells, index) => {
    const values: Partial<Record<FieldKey, string>> = {};
    for (const [key, column] of entries) {
      const value = cleanText(cells[column]);
      if (value) values[key] = value;
    }
    return { row: firstRowNumber + index, values };
  });
}

/** A sellable unit under construction. */
interface UnitDraft {
  key: string;
  sku: string;
  barcode?: string;
  itemCode: string;
  colorCode: string;
  colorName: string;
  size: string;
  drop: string;
  qty: number;
  cost?: number;
  price?: number;
  rows: number[];
  /** The first row's values — product-level fields are read from here. */
  source: Partial<Record<FieldKey, string>>;
}

/**
 * Build the variant code the way the supplier does when the file has no
 * column for it: style + colour + size + drop, which is exactly how the
 * LONG CODE in these exports is composed (verified against 1,524 rows).
 */
function composeVariantCode(unit: {
  itemCode: string;
  colorCode: string;
  size: string;
  drop: string;
}): string {
  return normalizeReference(unit.itemCode + unit.colorCode + unit.size + unit.drop);
}

export function aggregate(
  rows: string[][],
  mapping: ColumnMapping,
  options: AggregateOptions,
  firstRowNumber = 2,
): AggregateResult {
  const issues: ImportIssue[] = [];
  const source = readRows(rows, mapping, firstRowNumber);
  /** False when the item codes below are barcodes standing in for one. */
  const hasItemCodeColumn = mapping.itemCode !== undefined;

  // ── Stage 3: lines → sellable units ────────────────────────────────
  const units = new Map<string, UnitDraft>();
  let skippedRows = 0;
  let mergedRows = 0;

  for (const { row, values } of source) {
    const itemCode = normalizeReference(values.itemCode);
    const barcode = normalizeBarcode(values.barcode);
    const colorCode = normalizeReference(values.colorCode);
    const size = cleanText(values.size).toUpperCase();
    const drop = cleanText(values.drop).toUpperCase();

    /*
     * The barcode is a legitimate SKU of last resort.
     *
     * A fashion invoice always carries a style code and colour/size, so the
     * variant code composes itself. A general-goods export does not: one row
     * is one product, identified by its Internal Reference and its barcode,
     * with nothing to compose from. This used to skip every such row with
     * "no product code" — refusing an entire catalogue that was, in fact,
     * completely identified.
     */
    const sku =
      normalizeReference(values.variantCode) ||
      composeVariantCode({ itemCode, colorCode, size, drop }) ||
      barcode;

    // Nothing identifies this row, so nothing downstream could match or
    // update it. Skipping loudly beats importing an anonymous product.
    if (!sku && !barcode) {
      skippedRows++;
      issues.push({
        level: "warning",
        code: "row-unidentified",
        row,
        message: "Skipped: the row has no product code and no barcode.",
      });
      continue;
    }

    const key = sku || barcode;
    const qty = Math.max(0, Math.trunc(parseNumber(values.qty) ?? 0));
    const cost = parseNumber(values.cost);
    const price = parseNumber(values.price);

    const existing = units.get(key);
    if (existing) {
      // THE aggregation. Without it the second line overwrites the first.
      existing.qty += qty;
      existing.rows.push(row);
      mergedRows++;

      if (barcode && existing.barcode && barcode !== existing.barcode) {
        issues.push({
          level: "error",
          code: "barcode-conflict",
          row,
          subject: key,
          message:
            `Variant ${key} appears with two different barcodes ` +
            `(${existing.barcode} and ${barcode}). Fix the file — one of them is wrong.`,
        });
      }
      if (!existing.barcode && barcode) existing.barcode = barcode;
      if (existing.cost === undefined && cost !== undefined) existing.cost = cost;
      continue;
    }

    units.set(key, {
      key,
      sku,
      barcode: barcode || undefined,
      itemCode: itemCode || sku,
      colorCode,
      colorName: cleanText(values.colorName),
      size,
      drop,
      qty,
      cost,
      price,
      rows: [row],
      source: values,
    });
  }

  // A barcode must identify exactly one unit — inside this file as much as
  // in the catalogue. Two units sharing one is a supplier data error that
  // the database would otherwise reject halfway through the import.
  const barcodeOwners = new Map<string, string>();
  for (const unit of units.values()) {
    if (!unit.barcode) {
      issues.push({
        level: "warning",
        code: "unit-no-barcode",
        subject: unit.sku,
        message: `${unit.sku} has no barcode — it will import, but it cannot be scanned.`,
      });
      continue;
    }

    const owner = barcodeOwners.get(unit.barcode);
    if (owner && owner !== unit.key) {
      issues.push({
        level: "error",
        code: "barcode-duplicate",
        subject: unit.sku,
        message: `Barcode ${unit.barcode} is on both ${owner} and ${unit.sku} in this file.`,
      });
    } else {
      barcodeOwners.set(unit.barcode, unit.key);
    }

    if (/^\d{8,14}$/.test(unit.barcode)) {
      const body = unit.barcode.slice(0, -1);
      const expected = gtinCheckDigit(body);
      if (expected !== unit.barcode.slice(-1)) {
        issues.push({
          level: "warning",
          code: "barcode-checksum",
          subject: unit.sku,
          message:
            `Barcode ${unit.barcode} fails its check digit (expected …${expected}). ` +
            `It will still import, but a scanner may reject it.`,
        });
      }
    }
  }

  // ── Stage 4: units → products ──────────────────────────────────────
  const grouped = new Map<string, UnitDraft[]>();
  for (const unit of units.values()) {
    const list = grouped.get(unit.itemCode);
    if (list) list.push(unit);
    else grouped.set(unit.itemCode, [unit]);
  }

  const usedSlugs = new Set<string>();
  const products: DraftProduct[] = [];

  for (const [itemCode, list] of grouped) {
    const head = list[0].source;

    const category = resolveCategory(head.category, head.family, options.category);
    const brand = brandName(head.brand ?? "");
    const productType = displayPhrase(head.productType ?? "");
    // Filed under the spelling the shop already uses when there is one, so
    // a second shipment does not split the shelf. See resolveSubcategory.
    const subcategory = resolveSubcategory(head.productType, options.existingSubcategories);

    const name =
      cleanText(head.name) ||
      [brand, productType].filter(Boolean).join(" ") ||
      productType ||
      brand ||
      itemCode;

    // Two products genuinely share a name here — nine of them are called
    // "Ankle Sock Single" — so the style code goes into the slug. It is
    // also what makes the slug stable across re-imports, where a
    // timestamp-based one would create a duplicate product every run.
    const slug = uniqueSlug(`${name}-${itemCode}`, usedSlugs);

    const variants = list
      .map((unit) => toVariant(unit, issues))
      // Colour groups the swatches; size orders them within a colour, so a
      // shopper sees Navy S–XXL together rather than every colour at S.
      .sort(
        (a, b) => (a.color ?? "").localeCompare(b.color ?? "") || a.sizeOrder - b.sizeOrder,
      );

    const costs = variants.map((v) => v.cost).filter((c): c is number => c !== undefined);
    const suppliedPrices = variants
      .map((v) => v.price)
      .filter((p): p is number => p !== undefined && p > 0);

    const priced = priceItem(
      costs.length > 0 ? Math.min(...costs) : undefined,
      suppliedPrices.length > 0 ? Math.min(...suppliedPrices) : undefined,
      category?.slug,
      options.pricing,
    );

    if (priced.price <= 0) {
      issues.push({
        level: "error",
        code: "no-price",
        subject: itemCode,
        message: `${name} has no cost and no selling price, so it would import at $0.`,
      });
    }

    const composition = head.composition ? formatComposition(head.composition) : undefined;
    // "2026 SUMMER" shouted in a feature bullet reads as a warning label.
    const season = displayPhrase(head.season ?? "") || undefined;

    // The supplier's own copy beats anything we can assemble from fields.
    const suppliedDescription = cleanText(head.description);

    products.push({
      itemCode,
      styleCode: hasItemCodeColumn ? itemCode : undefined,
      name,
      slug,
      category,
      subcategory,
      brand: brand || undefined,
      line: cleanText(head.line) || undefined,
      season,
      composition,
      hsCode: cleanText(head.hsCode) || undefined,
      gender: cleanText(head.gender) || undefined,
      invoiceNo: cleanText(head.invoiceNo) || undefined,
      invoiceDate: cleanText(head.date) || undefined,
      cost: priced.cost,
      price: priced.price,
      compareAt: priced.compareAt,
      totalQty: variants.reduce((sum, v) => sum + v.qty, 0),
      description:
        suppliedDescription ||
        buildDescription({ name, brand, composition, season, productType }),
      features: buildFeatures({
        composition,
        season,
        brand,
        // Printing "Style code: 8680214252116" on a napkin ring is worse
        // than printing nothing — that is the barcode standing in for a
        // code the file never had.
        itemCode: hasItemCodeColumn ? itemCode : undefined,
      }),
      variants,
    });
  }

  products.sort((a, b) => b.variants.length - a.variants.length || a.name.localeCompare(b.name));

  const totalQty = products.reduce((sum, p) => sum + p.totalQty, 0);
  const totalCost = products.reduce(
    (sum, p) => sum + p.variants.reduce((s, v) => s + (v.cost ?? 0) * v.qty, 0),
    0,
  );

  return {
    products,
    categories: collectCategories(products.map((p) => p.category)),
    issues,
    stats: {
      rows: source.length,
      skippedRows,
      units: units.size,
      products: products.length,
      mergedRows,
      totalQty,
      totalCost: Math.round(totalCost * 100) / 100,
    },
  };
}

function toVariant(unit: UnitDraft, issues: ImportIssue[]): DraftVariant {
  const color = resolveColor(unit.colorName || unit.colorCode);
  const size = resolveSize(unit.size, unit.drop);

  if (color && !color.hex) {
    issues.push({
      level: "info",
      code: "colour-unknown",
      subject: unit.sku,
      message: `Colour "${color.name}" has no swatch — it will show as a plain label.`,
    });
  }
  if (color?.multi) {
    issues.push({
      level: "info",
      code: "colour-multi",
      subject: unit.sku,
      message: `"${color.name}" names more than one colour — add a photo to this variant.`,
    });
  }
  if (unit.qty <= 0) {
    issues.push({
      level: "warning",
      code: "zero-qty",
      subject: unit.sku,
      row: unit.rows[0],
      message: `${unit.sku} has no quantity — it will import out of stock.`,
    });
  }

  return {
    id: `imp-${slugify(unit.sku) || slugify(unit.barcode ?? unit.key)}`,
    sku: unit.sku,
    barcode: unit.barcode,
    color: color?.name,
    colorHex: color?.hex,
    size: size?.value,
    sizeLabel: size?.label,
    sizeOrder: size?.order ?? Number.MAX_SAFE_INTEGER,
    qty: unit.qty,
    cost: unit.cost,
    price: unit.price,
    sourceRows: unit.rows,
  };
}

function uniqueSlug(raw: string, used: Set<string>): string {
  const base = slugify(raw) || "product";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

function buildDescription(parts: {
  name: string;
  brand?: string;
  composition?: string;
  season?: string;
  productType?: string;
}): string {
  const sentences: string[] = [];
  const opener = [parts.brand, parts.productType].filter(Boolean).join(" ");
  sentences.push(opener ? `${opener}, imported new and in original packaging.` : `${parts.name}.`);
  if (parts.composition) sentences.push(`Made from ${parts.composition}.`);
  if (parts.season) sentences.push(`From the ${parts.season} collection.`);
  return sentences.join(" ");
}

function buildFeatures(parts: {
  composition?: string;
  season?: string;
  brand?: string;
  itemCode?: string;
}): string[] {
  const features: string[] = [];
  if (parts.composition) features.push(`Fabric: ${parts.composition}`);
  if (parts.brand) features.push(`Brand: ${parts.brand}`);
  if (parts.season) features.push(`Season: ${parts.season}`);
  if (parts.itemCode) features.push(`Style code: ${parts.itemCode}`);
  return features;
}
