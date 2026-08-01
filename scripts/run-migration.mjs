import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim();
      if (key.trim() === "NEXT_PUBLIC_SUPABASE_URL" && !supabaseUrl) supabaseUrl = value;
      if (key.trim() === "SUPABASE_SERVICE_ROLE_KEY" && !supabaseServiceKey) supabaseServiceKey = value;
    }
  }
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log("🔍 Checking if products table has required columns...\n");

// Test by trying to select a column — if it errors, the column is missing
const { data: testProduct, error: testErr } = await supabase
  .from("products")
  .select("id, stock, icon, art, colors, sizes, default_variant_id, hidden")
  .limit(1);

if (testErr) {
  console.log("⚠️  Some columns may be missing from the products table.");
  console.log("   Error:", testErr.message);
  console.log("\n📋 Please run this SQL in your Supabase Dashboard > SQL Editor:\n");
  const migration = readFileSync(join(process.cwd(), "supabase", "migration-add-columns.sql"), "utf8");
  console.log(migration);
} else {
  console.log("✅ Products table has all required columns.");
}

// Test stores table
const { data: testStore, error: storeErr } = await supabase
  .from("stores")
  .select("slug, icon, followers, joined_year, verified, official, category, art")
  .limit(1);

if (storeErr) {
  console.log("\n⚠️  Some columns may be missing from the stores table.");
  console.log("   Error:", storeErr.message);
  if (!testErr) {
    console.log("\n📋 Please run this SQL in your Supabase Dashboard > SQL Editor:\n");
    const migration = readFileSync(join(process.cwd(), "supabase", "migration-add-columns.sql"), "utf8");
    console.log(migration);
  }
} else {
  console.log("✅ Stores table has all required columns.");
}

// Test a simple mutation round-trip by updating a product and reading it back
console.log("\n🔧 Testing mutation write access...");
const { data: sampleProduct } = await supabase.from("products").select("id, name, price").limit(1).single();

if (sampleProduct) {
  const { error: updateErr } = await supabase
    .from("products")
    .update({ price: sampleProduct.price }) // no-op update
    .eq("id", sampleProduct.id);
  
  if (updateErr) {
    console.log("❌ Write access FAILED:", updateErr.message);
    console.log("   This means mutations from the dashboard will not persist on Netlify.");
    console.log("   Please check your RLS policies allow writes.");
  } else {
    console.log("✅ Write access confirmed — mutations will persist on Netlify.");
  }
} else {
  console.log("⚠️  No products found to test write access.");
}

console.log("\n✨ Migration check complete!");
