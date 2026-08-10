/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE PIPELINE — one entry point for the wizard and the dry-run script.
 * ─────────────────────────────────────────────────────────────────────────
 *   1  read      the file becomes labelled columns and rows      workbook.ts
 *   2  normalise codes, colours, sizes and Turkish text          text/colors/sizes
 *   3  aggregate lines become sellable units, quantities summed  aggregate.ts
 *   4  group     units become products, priced and categorised   aggregate.ts
 *   5  resolve   drafts are matched against the catalogue        plan.ts
 *   6  commit    the plan is written                             (server action)
 *
 * Stages 1–5 are pure and live here. Only stage 6 touches the database,
 * which is what lets the wizard show a preview that is exactly what will
 * happen, and lets `npm run import:dry-run` prove it without one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Product } from "../types.ts";
import { aggregate, type AggregateResult, type ImportIssue } from "./aggregate.ts";
import {
  DEFAULT_MIXED_GROUPINGS,
  resolveCategory,
  rootForGender,
  type CategoryRules,
  type ExistingCategory,
} from "./categories.ts";
import { DEFAULT_PRICING, type PricingRules } from "./pricing.ts";
import { buildPlan, type ImportPlan, type StockMode } from "./plan.ts";
import {
  detectMapping,
  mappingProblems,
  normalizeHeader,
  type ColumnMapping,
} from "./schema.ts";
import { readTables, type SheetTable } from "./workbook.ts";

export interface ImportSettings {
  sheetIndex: number;
  mapping: ColumnMapping;
  storeSlug: string;
  /** Parent category everything is filed under. */
  rootSlug: string;
  mergeBasicLines: boolean;
  pricing: PricingRules;
  stockMode: StockMode;
  overwriteDetails: boolean;
  overwritePrices: boolean;
  publishImmediately: boolean;
}

export function defaultSettings(storeSlug: string): ImportSettings {
  return {
    sheetIndex: 0,
    mapping: {},
    storeSlug,
    // No department by default — the wizard makes the seller choose, and
    // the dry-run script takes one on the command line. Guessing menswear
    // here is what filed a kitchenware catalogue under Men's Fashion.
    rootSlug: "",
    mergeBasicLines: true,
    pricing: { ...DEFAULT_PRICING, markupByCategory: { ...DEFAULT_PRICING.markupByCategory } },
    // A supplier file is a receipt: the default has to ADD to the shelf.
    // Defaulting to "set" would silently overwrite the stock of every
    // product a second shipment happens to repeat.
    stockMode: "receive",
    overwriteDetails: false,
    overwritePrices: true,
    // No import can supply photos, so new products wait for one.
    publishImmediately: false,
  };
}

// ── Stage 1 — what the wizard shows on the mapping screen ────────────────

export interface SheetSummary {
  index: number;
  name: string;
  headers: string[];
  rowCount: number;
  /** First few values per column, so a seller can recognise the column. */
  samples: string[][];
}

export interface InspectResult {
  sheets: SheetSummary[];
  /** Auto-detected mapping for the sheet that looks most like a product list. */
  suggestedSheet: number;
  suggestedMapping: ColumnMapping;
  /** Required fields the suggestion could not fill. */
  missing: string[];
  /** Root category implied by the file's gender column, when there is one. */
  suggestedRoot?: string;
}

const SAMPLE_ROWS = 3;

export function inspect(bytes: Buffer, filename: string): InspectResult {
  const tables = readTables(bytes, filename);

  const sheets: SheetSummary[] = tables.map((table, index) => ({
    index,
    name: table.name,
    headers: table.headers,
    rowCount: table.rows.length,
    samples: table.headers.map((_, column) =>
      table.rows.slice(0, SAMPLE_ROWS).map((row) => row[column] ?? ""),
    ),
  }));

  // A workbook often carries a summary tab alongside the data. Pick the
  // sheet whose headers fill the most required fields, breaking ties on
  // row count — a one-line summary never wins that.
  let suggestedSheet = 0;
  let bestScore = -1;
  tables.forEach((table, index) => {
    const mapping = detectMapping(table.headers);
    const score = Object.keys(mapping).length * 1000 + Math.min(table.rows.length, 999);
    if (score > bestScore) {
      bestScore = score;
      suggestedSheet = index;
    }
  });

  const chosen = tables[suggestedSheet];
  const suggestedMapping = detectMapping(chosen.headers);

  return {
    sheets,
    suggestedSheet,
    suggestedMapping,
    missing: mappingProblems(suggestedMapping),
    suggestedRoot: suggestRoot(chosen, suggestedMapping),
  };
}

/** The root category the file's own gender column points at. */
function suggestRoot(table: SheetTable, mapping: ColumnMapping): string | undefined {
  const column = mapping.gender;
  if (column === undefined) return undefined;
  for (const row of table.rows.slice(0, 50)) {
    const root = rootForGender(row[column]);
    if (root) return root;
  }
  return undefined;
}

// ── Between the mapping and the settings screen ─────────────────────────

export interface CategoryScan {
  slug: string;
  name: string;
  /** Rows filed here — so the biggest categories can be priced first. */
  rows: number;
}

/**
 * The categories THIS file will create, resolved with the mapping the
 * seller just confirmed.
 *
 * Exists so the markup panel can list them.
 *
 * ── Why that panel could not just use a constant ─────────────────────────
 * It used to be seeded from DEFAULT_MARKUPS, a list of menswear slugs —
 * shirts, suits, socks, bow-ties — written for the file this importer was
 * built against. A kitchenware seller opening the wizard was therefore
 * asked to set the markup on sixteen categories that had nothing to do
 * with their file and did not exist in their store, while the categories
 * their file actually creates — Vacuum Flasks, Candles, Lunch Boxes —
 * were nowhere to be seen and silently took the global default.
 *
 * The panel's own caption already promised "these apply to the categories
 * your file creates". This makes that true.
 */
export function scanCategories(
  bytes: Buffer,
  filename: string,
  settings: Pick<ImportSettings, "sheetIndex" | "mapping" | "rootSlug" | "mergeBasicLines">,
  /** The catalogue's categories, so this lists what will really be used. */
  existing: ExistingCategory[] = [],
): CategoryScan[] {
  const tables = readTables(bytes, filename);
  const table = tables[settings.sheetIndex] ?? tables[0];
  if (!table) return [];

  const rules: CategoryRules = {
    rootSlug: settings.rootSlug,
    mergeBasicLines: settings.mergeBasicLines,
    mixedGroupings: DEFAULT_MIXED_GROUPINGS,
    existing,
  };

  const categoryColumn = settings.mapping.category;
  const familyColumn = settings.mapping.family;
  if (categoryColumn === undefined && familyColumn === undefined) return [];

  const found = new Map<string, CategoryScan>();
  for (const row of table.rows) {
    const resolved = resolveCategory(
      categoryColumn === undefined ? undefined : row[categoryColumn],
      familyColumn === undefined ? undefined : row[familyColumn],
      rules,
    );
    if (!resolved) continue;

    const existing = found.get(resolved.slug);
    if (existing) existing.rows++;
    else found.set(resolved.slug, { slug: resolved.slug, name: resolved.name, rows: 1 });
  }

  return [...found.values()].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

// ── Stages 2–5 — the full analysis ──────────────────────────────────────

export interface AnalysisResult {
  table: SheetTable;
  aggregate: AggregateResult;
  plan: ImportPlan;
  issues: ImportIssue[];
}

export function analyse(
  bytes: Buffer,
  filename: string,
  settings: ImportSettings,
  catalogue: Product[],
  /**
   * The categories the catalogue already has. Passed whole rather than as
   * slugs alone, because recognising "Towels" as the shop's existing "Towel
   * Sets" needs the NAME and its place in the tree — see CategoryRules.
   */
  existingCategories: ExistingCategory[],
): AnalysisResult {
  const tables = readTables(bytes, filename);
  const table = tables[settings.sheetIndex] ?? tables[0];
  if (!table) throw new Error("That file has no readable sheet.");

  const missing = mappingProblems(settings.mapping);
  if (missing.length > 0) {
    throw new Error(`Map these columns before continuing: ${missing.join(", ")}.`);
  }

  // Belt and braces behind the wizard's own check. Every category this
  // import creates hangs off this slug, and an empty one would either be
  // rejected by the foreign key or strand the whole branch at the root.
  if (!settings.rootSlug) {
    throw new Error("Choose the department this file should be filed under.");
  }

  const aggregated = aggregate(
    table.rows,
    settings.mapping,
    {
      category: {
        rootSlug: settings.rootSlug,
        mergeBasicLines: settings.mergeBasicLines,
        mixedGroupings: DEFAULT_MIXED_GROUPINGS,
        existing: existingCategories,
      },
      pricing: settings.pricing,
      // Derived from the catalogue rather than stored anywhere — a
      // subcategory only exists because a product carries it.
      existingSubcategories: [
        ...new Set(
          catalogue
            .map((p) => p.subcategory?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      ],
    },
    table.headerRow + 1,
  );

  const plan = buildPlan(aggregated.products, catalogue, {
    storeSlug: settings.storeSlug,
    stockMode: settings.stockMode,
    existingCategorySlugs: existingCategories.map((c) => c.slug),
  });

  return {
    table,
    aggregate: aggregated,
    plan,
    issues: [...aggregated.issues, ...plan.issues],
  };
}

/**
 * Columns in the file that no field claims. Shown in the wizard so a seller
 * can see at a glance that nothing important was quietly ignored.
 */
export function unmappedColumns(headers: string[], mapping: ColumnMapping): string[] {
  const used = new Set(Object.values(mapping));
  return headers.filter((_, index) => !used.has(index));
}

/** Re-export so callers need one import. */
export { normalizeHeader, type ColumnMapping, type PricingRules, type StockMode };
