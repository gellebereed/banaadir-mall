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
import { DEFAULT_MIXED_GROUPINGS, rootForGender } from "./categories.ts";
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
    rootSlug: "mens-fashion",
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
  existingCategorySlugs: string[],
): AnalysisResult {
  const tables = readTables(bytes, filename);
  const table = tables[settings.sheetIndex] ?? tables[0];
  if (!table) throw new Error("That file has no readable sheet.");

  const missing = mappingProblems(settings.mapping);
  if (missing.length > 0) {
    throw new Error(`Map these columns before continuing: ${missing.join(", ")}.`);
  }

  const aggregated = aggregate(
    table.rows,
    settings.mapping,
    {
      category: {
        rootSlug: settings.rootSlug,
        mergeBasicLines: settings.mergeBasicLines,
        mixedGroupings: DEFAULT_MIXED_GROUPINGS,
      },
      pricing: settings.pricing,
    },
    table.headerRow + 1,
  );

  const plan = buildPlan(aggregated.products, catalogue, {
    storeSlug: settings.storeSlug,
    stockMode: settings.stockMode,
    existingCategorySlugs,
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
