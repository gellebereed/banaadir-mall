/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FIND "�" — list every product whose text was saved mis-decoded.
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run find:garbled
 *   npm run find:garbled -- --store ozdilek-home
 *
 * Read-only. A "�" (U+FFFD) in a product means an import read a
 * Windows-1254 CSV as UTF-8 and the Turkish letters were lost (fixed in
 * lib/import/csv.ts decodeCsv). The original letters cannot be recovered
 * from the database, so the repair is to re-import the same supplier file:
 * the import now reads it correctly and rewrites any product that still
 * holds "�" (lib/import/build.ts hasGarbledText). This script shows which
 * products that will touch, and confirms afterwards that none are left.
 * ─────────────────────────────────────────────────────────────────────────
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(1);
}

const argv = process.argv.slice(2);
const storeIndex = argv.indexOf("--store");
const store = storeIndex >= 0 ? argv[storeIndex + 1] : undefined;

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const BAD = "�";
const PAGE = 1000;

/** Field paths inside `value` whose text contains "�". */
function garbledFields(value, path = "") {
  if (typeof value === "string") return value.includes(BAD) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => garbledFields(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => garbledFields(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const rows = [];
for (let from = 0; ; from += PAGE) {
  const filter = store ? `&store=eq.${encodeURIComponent(store)}` : "";
  const res = await fetch(`${url}/rest/v1/products?select=*${filter}&order=id`, {
    headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
  });
  if (!res.ok) {
    console.error(`❌ Supabase answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const page = await res.json();
  rows.push(...page);
  if (page.length < PAGE) break;
}

const hits = rows
  .map((row) => ({ row, fields: garbledFields(row) }))
  .filter((hit) => hit.fields.length > 0);

console.log(`Checked ${rows.length} products${store ? ` in ${store}` : ""}.`);
if (hits.length === 0) {
  console.log("✅ No product text contains �.");
  process.exit(0);
}

console.log(`⚠️  ${hits.length} products contain �:\n`);
for (const { row, fields } of hits) {
  console.log(`  ${row.store}  ${row.id}  ${row.name}`);
  console.log(`      in: ${fields.join(", ")}`);
}
