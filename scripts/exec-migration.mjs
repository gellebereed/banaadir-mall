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

// Use the pg-meta REST API to execute SQL
// Supabase exposes a SQL execution endpoint via PostgREST's pg_net or via the management API
// The most reliable way is through the /rest/v1/rpc endpoint with a custom function,
// or through the /pg endpoint. Let's try the SQL API directly.

const statements = [
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0`,
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️'`,
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb`,
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_variant_id TEXT`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️'`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS followers INT DEFAULT 100`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS joined_year INT DEFAULT 2026`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT TRUE`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS official BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`,
  `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb`,
];

// First, try to create an exec_sql function we can use
const createFuncSql = `
CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

console.log("🔧 Creating helper function for SQL execution...");
const createRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: supabaseServiceKey,
    Authorization: `Bearer ${supabaseServiceKey}`,
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ sql: createFuncSql }),
});

// If exec_sql doesn't exist yet, we need to create it via the SQL API
if (!createRes.ok) {
  console.log("   Helper function not available, trying SQL API...");
  
  // Try Supabase SQL API (available at /pg/query)
  const allSql = statements.join(";\n") + ";";
  
  // Method: Use the Supabase pg-meta endpoint 
  const pgRes = await fetch(`${supabaseUrl}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ query: allSql }),
  });
  
  if (pgRes.ok) {
    console.log("✅ All migration statements executed successfully via SQL API!");
  } else {
    // Last resort: try each statement as a PostgREST RPC
    console.log("   SQL API not available either.");
    console.log("\n⚠️  Cannot execute SQL remotely. Please run the migration manually:");
    console.log("   1. Go to your Supabase Dashboard > SQL Editor");
    console.log("   2. Paste the contents of supabase/migration-add-columns.sql");
    console.log("   3. Click 'Run'\n");
    
    // Print the SQL for easy copy-paste
    console.log("─".repeat(70));
    for (const stmt of statements) {
      console.log(stmt + ";");
    }
    console.log("─".repeat(70));
    process.exit(0);
  }
} else {
  console.log("✅ Helper function ready.\n");

  // Now run each migration statement
  let success = 0;
  for (const stmt of statements) {
    const shortDesc = stmt.trim().slice(0, 80);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ sql: stmt }),
      });
      if (res.ok) {
        console.log(`✅ ${shortDesc}`);
        success++;
      } else {
        const text = await res.text();
        console.log(`⚠️  ${shortDesc} — ${text}`);
      }
    } catch (err) {
      console.log(`⚠️  ${shortDesc} — ${err.message}`);
    }
  }
  console.log(`\n✨ Migration complete: ${success}/${statements.length} applied.`);
}
