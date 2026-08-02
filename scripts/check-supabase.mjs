/**
 * Supabase health check — run with:  npm run check:supabase
 *
 * Reports exactly which columns/tables are missing so you know whether
 * supabase/migration.sql still needs to be run, and confirms writes work.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

function loadEnv() {
  const env = { ...process.env };
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key.trim()] ??= rest.join("=").trim();
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

/** Does `table` expose every column in `columns`? */
async function checkColumns(table, columns) {
  const missing = [];
  for (const column of columns) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, { headers });
    if (!res.ok) missing.push(column);
  }
  return missing;
}

async function tableExists(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  return res.ok;
}

console.log(`\n🔍 Checking ${url}\n`);

let needsMigration = false;
/** Set when migration-odoo-catalog.sql specifically hasn't been run. */
let needsOdooMigration = false;

const productColumns = ["stock", "icon", "art", "colors", "sizes", "default_variant_id", "features"];
const storeColumns = ["icon", "followers", "joined_year", "verified", "official", "category", "art"];

for (const [table, columns] of [["products", productColumns], ["stores", storeColumns]]) {
  const missing = await checkColumns(table, columns);
  if (missing.length === 0) {
    console.log(`✅ ${table}: all columns present`);
  } else {
    needsMigration = true;
    console.log(`⚠️  ${table}: missing → ${missing.join(", ")}`);
  }
}

for (const table of ["promotions", "employees", "flash_deals", "flash_requests", "marketing_settings"]) {
  if (await tableExists(table)) {
    console.log(`✅ table ${table} exists`);
  } else {
    needsMigration = true;
    console.log(`⚠️  table ${table} is MISSING`);
  }
}

// ── Odoo catalogue structure (supabase/migration-odoo-catalog.sql) ─────
const odooProductColumns = ["internal_reference", "barcode", "uom", "odoo_id"];
const missingOdooProduct = await checkColumns("products", odooProductColumns);
const missingOdooCategory = await checkColumns("categories", ["parent_slug", "odoo_id"]);
const missingOdoo = [
  ...missingOdooProduct.map((c) => `products.${c}`),
  ...missingOdooCategory.map((c) => `categories.${c}`),
];

if (missingOdoo.length === 0) {
  console.log("✅ Odoo identity columns present (internal_reference, barcode, uom, parent_slug)");
} else {
  needsMigration = true;
  needsOdooMigration = true;
  console.log(`⚠️  Odoo catalogue columns missing → ${missingOdoo.join(", ")}`);
}

// The views are what a barcode scan and the category navigation read.
for (const view of ["product_variant_index", "category_tree"]) {
  if (await tableExists(view)) {
    console.log(`✅ view ${view} exists`);
  } else {
    needsMigration = true;
    needsOdooMigration = true;
    console.log(`⚠️  view ${view} is MISSING`);
  }
}

// How much of the catalogue is actually scannable — the number that decides
// whether an Odoo sync can match automatically or needs manual work.
if (!needsOdooMigration) {
  const unitsRes = await fetch(
    `${url}/rest/v1/product_variant_index?select=barcode,default_code`,
    { headers },
  );
  if (unitsRes.ok) {
    const units = await unitsRes.json();
    const scannable = units.filter((u) => u.barcode).length;
    const referenced = units.filter((u) => u.default_code).length;
    console.log(
      `ℹ️  ${units.length} sellable units · ${scannable} with a barcode · ${referenced} with an internal reference`,
    );
    if (units.length > 0 && scannable < units.length) {
      console.log(
        `   ${units.length - scannable} unit(s) have no barcode — these will need matching by hand when Odoo is connected.`,
      );
    }
  }
}

// Write test — a no-op update that must report an affected row.
const listRes = await fetch(`${url}/rest/v1/products?select=id,name&limit=1`, { headers });
const [sample] = listRes.ok ? await listRes.json() : [];
if (sample) {
  const res = await fetch(`${url}/rest/v1/products?id=eq.${sample.id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ name: sample.name }),
  });
  const rows = res.ok ? await res.json() : [];
  console.log(
    rows.length > 0
      ? "✅ writes work (dashboard edits will persist)"
      : `❌ writes blocked — check RLS policies (HTTP ${res.status})`,
  );
} else {
  console.log("⚠️  no products found to test writes against");
}

// Are the official brands flagged? This drives the home-page brand row.
const brandRes = await fetch(`${url}/rest/v1/stores?select=slug,official`, { headers });
if (brandRes.ok) {
  const stores = await brandRes.json();
  const flagged = stores.filter((s) => s.official).length;
  console.log(
    flagged > 0
      ? `✅ ${flagged} store(s) flagged official — brand row will render`
      : "⚠️  no stores flagged official (the app falls back to a known-brand list until migrated)",
  );
}

if (!needsMigration) {
  console.log("\n✨ Supabase schema is fully migrated.\n");
} else {
  console.log("\n📋 ACTION NEEDED — open Supabase → SQL Editor and run, in order:");
  console.log("   1. supabase/migration.sql");
  if (needsOdooMigration) {
    console.log("   2. supabase/migration-odoo-catalog.sql   (barcodes, references, category tree)");
  }
  console.log("");
}
