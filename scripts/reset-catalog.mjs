/**
 * One-off catalog reset.
 *
 * Removes every store and its products EXCEPT the one named below, so the
 * catalog can be rebuilt by hand. Categories and marketing settings are
 * left untouched. A full backup is written first.
 *
 *   node scripts/reset-catalog.mjs            # dry run, shows what would go
 *   node scripts/reset-catalog.mjs --confirm  # actually delete
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";

const KEEP_STORE = "karaca-home";
const CONFIRM = process.argv.includes("--confirm");

const lines = readFileSync(".env.local", "utf8").split("\n");
const val = (k) => {
  const line = lines.find((l) => l.startsWith(`${k}=`));
  return line ? line.slice(k.length + 1).trim() : "";
};

const url = val("NEXT_PUBLIC_SUPABASE_URL");
const key = val("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const read = { apikey: key, Authorization: `Bearer ${key}` };
const write = { ...read, Prefer: "return=representation" };

async function rows(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: read });
  return res.ok ? res.json() : [];
}

// ── Backup ───────────────────────────────────────────────────────────
const TABLES = [
  "stores", "products", "categories", "orders",
  "promotions", "employees", "flash_deals", "flash_requests", "marketing_settings",
];
const backup = {};
for (const table of TABLES) backup[table] = await rows(table);

mkdirSync("data", { recursive: true });
writeFileSync("data/supabase-backup.json", JSON.stringify(backup, null, 2));
console.log(`💾 Backup → data/supabase-backup.json\n`);

// ── What will go ─────────────────────────────────────────────────────
const doomedStores = backup.stores.filter((s) => s.slug !== KEEP_STORE);
const doomedProducts = backup.products.filter((p) => p.store !== KEEP_STORE);

console.log(`Keeping store: ${KEEP_STORE}`);
console.log(`Stores to delete   (${doomedStores.length}): ${doomedStores.map((s) => s.slug).join(", ") || "none"}`);
console.log(`Products to delete (${doomedProducts.length}): ${doomedProducts.map((p) => p.id).join(", ") || "none"}`);
console.log(`Categories kept    (${backup.categories.length}) — untouched\n`);

if (!CONFIRM) {
  console.log("Dry run. Re-run with --confirm to apply.");
  process.exit(0);
}

// ── Delete ───────────────────────────────────────────────────────────
// Children first so nothing is orphaned mid-way.
async function purge(table, filter, label) {
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: write,
  });
  if (!res.ok) {
    console.log(`❌ ${label}: HTTP ${res.status} ${await res.text()}`);
    return;
  }
  const removed = await res.json();
  console.log(`✅ ${label}: removed ${removed.length}`);
}

const notKept = `neq.${KEEP_STORE}`;
await purge("products", `store=${notKept}`, "products");
await purge("orders", `store=${notKept}`, "orders");
await purge("promotions", `store=${notKept}`, "promotions");
await purge("flash_requests", `store=${notKept}`, "flash requests");
await purge("employees", `store=${notKept}`, "employees");
await purge("stores", `slug=${notKept}`, "stores");

// ── Result ───────────────────────────────────────────────────────────
console.log("\n--- REMAINING ---");
for (const table of ["stores", "products", "categories"]) {
  const remaining = await rows(table);
  console.log(`${table}: ${remaining.length}`);
  for (const r of remaining) {
    if (table === "stores") console.log(`   - ${r.slug} | ${r.name} | official=${r.official}`);
    if (table === "products") console.log(`   - ${r.id} | ${r.name}`);
  }
}
console.log("\n✨ Done. Restore from data/supabase-backup.json if needed.");
