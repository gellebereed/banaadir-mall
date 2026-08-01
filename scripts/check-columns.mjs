import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get product columns by selecting one row with all columns
console.log("=== Products table columns ===");
const { data: pCols, error: pErr } = await supabase.from("products").select("*").limit(1);
if (pErr) {
  console.log("Error:", pErr.message);
} else if (pCols && pCols.length > 0) {
  console.log("Columns:", Object.keys(pCols[0]).join(", "));
} else {
  console.log("No rows found");
}

console.log("\n=== Stores table columns ===");
const { data: sCols, error: sErr } = await supabase.from("stores").select("*").limit(1);
if (sErr) {
  console.log("Error:", sErr.message);
} else if (sCols && sCols.length > 0) {
  console.log("Columns:", Object.keys(sCols[0]).join(", "));
} else {
  console.log("No rows found");
}

console.log("\n=== Orders table columns ===");
const { data: oCols, error: oErr } = await supabase.from("orders").select("*").limit(1);
if (oErr) {
  console.log("Error:", oErr.message);
} else if (oCols && oCols.length > 0) {
  console.log("Columns:", Object.keys(oCols[0]).join(", "));
}

console.log("\n=== Promotions table columns ===");
const { data: prCols, error: prErr } = await supabase.from("promotions").select("*").limit(1);
if (prErr) {
  console.log("Error:", prErr.message);
} else if (prCols && prCols.length > 0) {
  console.log("Columns:", Object.keys(prCols[0]).join(", "));
} else {
  console.log("No rows found (empty table)");
}

console.log("\n=== Employees table columns ===");
const { data: eCols, error: eErr } = await supabase.from("employees").select("*").limit(1);
if (eErr) {
  console.log("Error:", eErr.message);
} else if (eCols && eCols.length > 0) {
  console.log("Columns:", Object.keys(eCols[0]).join(", "));
} else {
  console.log("No rows found (empty table)");
}

console.log("\n=== Marketing Settings table columns ===");
const { data: mCols, error: mErr } = await supabase.from("marketing_settings").select("*").limit(1);
if (mErr) {
  console.log("Error:", mErr.message);
} else if (mCols && mCols.length > 0) {
  console.log("Columns:", Object.keys(mCols[0]).join(", "));
} else {
  console.log("No rows found (empty table)");
}
