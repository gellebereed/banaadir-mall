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

console.log(
  needsMigration
    ? "\n📋 ACTION NEEDED: open Supabase → SQL Editor → paste supabase/migration.sql → Run\n"
    : "\n✨ Supabase schema is fully migrated.\n",
);
