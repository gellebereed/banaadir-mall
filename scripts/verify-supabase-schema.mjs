import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Parse .env.local
const envPath = path.join(process.cwd(), ".env.local");
let env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Required tables and their expected columns across all migrations
const EXPECTED_SCHEMA = {
  categories: ["slug", "name", "icon", "tagline", "art", "hidden", "parent_slug"],
  brands: ["slug", "name", "icon", "tagline", "official"],
  products: ["id", "slug", "name", "price", "original_price", "category", "store", "icon", "featured", "hidden", "subcategories", "rating", "reviews_count"],
  stores: ["slug", "name", "tagline", "badge", "owner", "email", "phone", "city", "rating", "reviews_count", "verified", "status"],
  promotions: ["id", "store", "name", "pct", "code", "active", "product_ids", "start_date", "end_date", "badge_text"],
  marketing_settings: [
    "id", "announcement", "hero_badge", "hero_title_top", "hero_title_highlight",
    "hero_subtitle", "sections", "banners", "promo_tiles", "campaign", "delivery", "promo",
    "announcement_bg_color", "announcement_text_color", "announcement_scroll", "announcement_speed"
  ],
  flash_deals: ["id", "name", "active", "ends_at", "product_ids"],
  flash_requests: ["id", "store", "product_id", "pct", "note", "status", "date"],
  employees: ["id", "store", "name", "email", "role", "added_at"],
};

async function audit() {
  console.log("🔍 Auditing Supabase Schema & Migrations...\n");

  const report = [];
  const missingMigrations = [];

  for (const [table, expectedCols] of Object.entries(EXPECTED_SCHEMA)) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);

      if (error) {
        report.push(`❌ Table '${table}' missing or error: ${error.message}`);
        missingMigrations.push(`Table missing: ${table}`);
        continue;
      }

      const existingCols = data && data.length > 0 ? Object.keys(data[0]) : [];
      
      // If table is empty, do a dummy select or column query
      if (existingCols.length === 0) {
        // Try selecting individual expected columns to see if they exist
        const missing = [];
        for (const col of expectedCols) {
          const { error: colErr } = await supabase.from(table).select(col).limit(1);
          if (colErr && (colErr.message.includes("Could not find") || colErr.code === "PGRST204")) {
            missing.push(col);
          }
        }
        if (missing.length > 0) {
          report.push(`⚠️ Table '${table}' is missing columns: ${missing.join(", ")}`);
          missingMigrations.push({ table, missing });
        } else {
          report.push(`✅ Table '${table}' exists and has all expected columns! (Table is empty)`);
        }
      } else {
        const missing = expectedCols.filter((col) => !existingCols.includes(col));
        if (missing.length > 0) {
          report.push(`⚠️ Table '${table}' is missing columns: ${missing.join(", ")}`);
          missingMigrations.push({ table, missing });
        } else {
          report.push(`✅ Table '${table}' has all ${expectedCols.length} expected columns!`);
        }
      }
    } catch (err) {
      report.push(`❌ Error checking '${table}': ${err.message}`);
    }
  }

  // Check Storage Bucket 'uploads'
  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      report.push(`⚠️ Storage check error: ${bErr.message}`);
    } else {
      const uploadsBucket = buckets?.find((b) => b.id === "uploads");
      if (uploadsBucket) {
        report.push(`✅ Storage Bucket 'uploads' is created and public: ${uploadsBucket.public}`);
      } else {
        report.push(`❌ Storage Bucket 'uploads' is MISSING! (Run storage-setup.sql)`);
        missingMigrations.push("Storage Bucket 'uploads'");
      }
    }
  } catch (err) {
    report.push(`⚠️ Storage check error: ${err.message}`);
  }

  console.log("=== AUDIT RESULTS ===");
  report.forEach((r) => console.log(r));

  if (missingMigrations.length > 0) {
    console.log("\n⚠️ SUMMARY OF MISSING SQL MIGRATIONS IN SUPABASE:");
    console.log(JSON.stringify(missingMigrations, null, 2));
  } else {
    console.log("\n🎉 ALL TABLES, COLUMNS AND MIGRATIONS ARE FULLY UP TO DATE IN SUPABASE!");
  }
}

audit();
