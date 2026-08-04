/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DRY RUN — read a supplier file and print exactly what an import would do.
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run import:dry-run -- "path/to/Somali_List.xlsx"
 *   npm run import:dry-run -- file.xlsx --store sahra-fashion --stock set
 *   npm run import:dry-run -- file.xlsx --json out.json
 *
 * Nothing is written and no database is contacted: the catalogue is treated
 * as empty, so every product reads as "create". That is the point — it lets
 * a new supplier file be checked, and the column mapping proved, before
 * anyone loads it into the wizard.
 *
 * It runs the SAME modules the wizard does (lib/import/*), via Node's
 * type stripping — so if this output is right, the import is right.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";

const { inspect, analyse, defaultSettings, unmappedColumns } = await import(
  "../lib/import/pipeline.ts"
);
const { IMPORT_FIELDS } = await import("../lib/import/schema.ts");

// ── Arguments ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const file = argv.find((arg) => !arg.startsWith("--"));
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")
    ? argv[index + 1]
    : fallback;
};

if (!file) {
  console.error("Usage: npm run import:dry-run -- <file.xlsx|file.csv> [--store slug] [--root slug] [--stock receive|set] [--json out.json]");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const bytes = fs.readFileSync(file);
const filename = path.basename(file);

// ── Stage 1 ────────────────────────────────────────────────────────────
const found = inspect(bytes, filename);
const sheet = found.sheets[found.suggestedSheet];

const bar = "─".repeat(72);
console.log(`\n${bar}\n  ${filename}\n${bar}`);
console.log(`sheet          ${sheet.name} (${found.sheets.length} in workbook)`);
console.log(`columns        ${sheet.headers.length}`);
console.log(`data rows      ${sheet.rowCount}`);

console.log("\nCOLUMN MAPPING");
for (const field of IMPORT_FIELDS) {
  const column = found.suggestedMapping[field.key];
  const mark = field.required ? "*" : " ";
  const target = column === undefined ? "— not mapped" : sheet.headers[column];
  console.log(`  ${mark} ${field.label.padEnd(22)} ← ${target}`);
}

const ignored = unmappedColumns(sheet.headers, found.suggestedMapping);
if (ignored.length > 0) console.log(`\n  ignored columns: ${ignored.join(", ")}`);
if (found.missing.length > 0) {
  console.error(`\n  MISSING REQUIRED: ${found.missing.join(", ")}`);
  process.exit(1);
}

// ── Stages 2–5 ─────────────────────────────────────────────────────────
const settings = {
  ...defaultSettings(flag("store", "sahra-fashion")),
  sheetIndex: found.suggestedSheet,
  mapping: found.suggestedMapping,
  rootSlug: flag("root", found.suggestedRoot ?? "mens-fashion"),
  stockMode: flag("stock", "receive") === "set" ? "set" : "receive",
};

const result = analyse(bytes, filename, settings, [], []);
const { stats } = result.aggregate;

console.log(`\n${bar}\n  WHAT THE IMPORT WOULD DO\n${bar}`);
console.log(`rows read            ${stats.rows}`);
console.log(`  merged into        ${stats.units} sellable units (${stats.mergedRows} duplicate lines added together)`);
console.log(`  grouped into       ${stats.products} products`);
console.log(`  skipped            ${stats.skippedRows}`);
console.log(`units of stock       ${stats.totalQty}`);
console.log(`cost value           ${stats.totalCost.toLocaleString()}`);
console.log(`retail value         ${result.plan.stats.retailValue.toLocaleString()}`);
console.log(`create / update      ${result.plan.stats.create} / ${result.plan.stats.update}`);
console.log(`blocked              ${result.plan.stats.blocked}`);

console.log(`\nCATEGORIES (${result.aggregate.categories.length}) under ${settings.rootSlug}`);
for (const category of result.aggregate.categories) {
  const count = result.aggregate.products.filter((p) => p.category?.slug === category.slug).length;
  console.log(`  ${category.name.padEnd(28)} ${String(count).padStart(3)} products  /${category.slug}`);
}

const levels = { error: [], warning: [], info: [] };
for (const issue of result.issues) levels[issue.level].push(issue);
console.log("\nISSUES");
for (const [level, list] of Object.entries(levels)) {
  if (list.length === 0) continue;
  console.log(`  ${level}: ${list.length}`);
  const byCode = new Map();
  for (const issue of list) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
  for (const [code, count] of byCode) {
    const example = list.find((i) => i.code === code);
    console.log(`    ${code} ×${count} — ${example.message}`);
  }
}
if (result.issues.length === 0) console.log("  none");

console.log(`\nPRODUCTS (first 12 of ${result.plan.products.length}, largest first)`);
for (const planned of result.plan.products.slice(0, 12)) {
  const p = planned.draft;
  console.log(
    `  ${p.name.slice(0, 42).padEnd(43)} ${String(p.variants.length).padStart(3)}v ` +
      `${String(p.totalQty).padStart(4)}u  ${String(p.cost).padStart(7)} → ${String(p.price).padStart(7)}  ${p.category?.slug ?? "—"}`,
  );
}

const sample = result.plan.products[0];
if (sample) {
  console.log(`\nSAMPLE — ${sample.draft.name}`);
  console.log(`  code       ${sample.draft.itemCode}`);
  console.log(`  slug       ${sample.draft.slug}`);
  console.log(`  category   ${sample.draft.category?.name} / ${sample.draft.subcategory}`);
  console.log(`  features   ${sample.draft.features.join(" | ")}`);
  console.log(`  variants   ${sample.variants.length}, first 8:`);
  for (const variant of sample.variants.slice(0, 8)) {
    const v = variant.draft;
    console.log(
      `    ${(v.color ?? "—").padEnd(20)} ${(v.sizeLabel ?? "—").padEnd(14)} ` +
        `${(v.barcode ?? "no barcode").padEnd(14)} ${v.sku.padEnd(22)} stock ${variant.newStock}`,
    );
  }
}

const jsonPath = flag("json");
if (jsonPath) {
  fs.writeFileSync(jsonPath, JSON.stringify(result.plan, null, 2));
  console.log(`\nplan written to ${jsonPath}`);
}

console.log("");
