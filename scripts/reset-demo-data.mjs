/**
 * ═══════════════════════════════════════════════════════════════════════
 *  RESET DEMO DATA — clear the marketplace so real stores can be added.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npm run reset:demo            show what WOULD be deleted, change nothing
 *   npm run reset:demo -- --yes   actually delete it
 *
 * A dry run by default, because this is irreversible and the whole point is
 * to be sure before you pull the trigger.
 *
 * ── What it clears ───────────────────────────────────────────────────────
 *   stores, products, promotions, employees, flash requests,
 *   product stories, product reviews, and the recommender's pushes/blocks
 *
 * ── What it KEEPS, and why ───────────────────────────────────────────────
 *   ORDERS       A customer's receipt and your financial record. Clearing
 *                the catalogue does not un-sell anything. Add --orders to
 *                delete them too, but be certain.
 *
 *   CATEGORIES   Structural. The departments a real store will be filed
 *                under are the same ones the demo used, so wiping them
 *                would just mean typing them back in. Add --categories to
 *                clear them (or use the Categories page to prune the
 *                sub-categories a supplier import created).
 *
 *   MARKETING    Your hero copy, banners, delivery fees and promo code —
 *                yours, not demo data.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--yes") || args.has("-y");
const WIPE_ORDERS = args.has("--orders");
const WIPE_CATEGORIES = args.has("--categories");

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
  console.error("❌ Supabase is not configured — nothing to reset.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

/** Tables cleared by default, in child-before-parent order. */
const TARGETS = [
  { table: "products", label: "Products" },
  { table: "promotions", label: "Promotions" },
  { table: "employees", label: "Staff logins" },
  { table: "flash_requests", label: "Flash-deal requests" },
  { table: "product_stories", label: "Product guides" },
  { table: "product_reviews", label: "Customer reviews" },
  // Stores last: if an earlier step fails, its rows are still reachable
  // from the store page instead of orphaned in the catalogue.
  { table: "stores", label: "Stores" },
];

if (WIPE_ORDERS) TARGETS.unshift({ table: "orders", label: "Orders" });
if (WIPE_CATEGORIES) TARGETS.push({ table: "categories", label: "Categories" });

async function countOf(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

console.log(`\n${APPLY ? "🔥 DELETING" : "🔍 DRY RUN — nothing will be changed"}\n`);
console.log(`   ${url}\n`);

let total = 0;
for (const target of TARGETS) {
  const count = await countOf(target.table);
  if (count === null) {
    console.log(`   ${target.label.padEnd(22)} — table not present, skipping`);
    continue;
  }
  total += count;
  console.log(`   ${target.label.padEnd(22)} ${String(count).padStart(5)} row${count === 1 ? "" : "s"}`);
}

if (!WIPE_ORDERS) {
  const orders = await countOf("orders");
  console.log(`\n   Keeping ${orders ?? 0} order${orders === 1 ? "" : "s"} (your sales record). Use --orders to clear them.`);
}
if (!WIPE_CATEGORIES) {
  const categories = await countOf("categories");
  console.log(`   Keeping ${categories ?? 0} categories. Use --categories to clear them.`);
}

if (!APPLY) {
  console.log(`\n   ${total} rows would be deleted.`);
  console.log("   Re-run with --yes to apply:  npm run reset:demo -- --yes\n");
  process.exit(0);
}

console.log("");
for (const target of TARGETS) {
  // `.neq("id", …)` matches every row — Supabase refuses an unfiltered
  // delete, which is a good default and an obstacle exactly once.
  const { error } = await db.from(target.table).delete().neq("id", "__none__");
  if (error) {
    // stores/categories key on slug rather than id in some schemas.
    const retry = await db.from(target.table).delete().neq("slug", "__none__");
    if (retry.error) {
      console.log(`   ✕ ${target.label}: ${error.message}`);
      continue;
    }
  }
  console.log(`   ✓ ${target.label} cleared`);
}

// Clear the recommender's pushes and blocks — every product they referred
// to is gone, so leaving them would show the admin panel a list of pushes
// pointing at nothing.
const { error: recoError } = await db
  .from("reco_settings")
  .update({ pins: [], blocked: [] })
  .eq("id", 1);
console.log(recoError ? `   ✕ Recommender pushes: ${recoError.message}` : "   ✓ Recommender pushes and blocks cleared");

// Empty the flash campaign's product list for the same reason.
await db.from("flash_deals").update({ product_ids: [] }).neq("id", "__none__");

/*
 * The local JSON overlay holds the same shapes and is what the app falls
 * back to when Supabase is unreachable. Leaving it populated means the demo
 * data reappears the first time the network hiccups.
 */
const dbPath = join(process.cwd(), "data", "db.json");
if (existsSync(dbPath)) {
  try {
    const local = JSON.parse(readFileSync(dbPath, "utf8"));
    local.newProducts = [];
    local.deletedProducts = [];
    local.productOverrides = {};
    local.promotions = [];
    local.employees = [];
    local.flashRequests = [];
    local.stores = [];
    local.storeOverrides = {};
    local.storeStatus = {};
    local.stories = [];
    local.reviews = [];
    if (local.reco) {
      local.reco.pins = [];
      local.reco.blocked = [];
    }
    if (local.flash) local.flash.productIds = [];
    if (WIPE_ORDERS) {
      local.orderStatus = {};
      local.orderDelivery = {};
      local.ordersSeen = {};
    }
    writeFileSync(dbPath, JSON.stringify(local, null, 2));
    console.log("   ✓ Local overlay (data/db.json) cleared");
  } catch (error) {
    console.log(`   ✕ data/db.json: ${error.message}`);
  }
}

console.log("\n✅ Done. The marketplace is empty and ready for real stores.\n");
console.log("   Next: /admin/stores to add your first store, then /vendor to list products.\n");
