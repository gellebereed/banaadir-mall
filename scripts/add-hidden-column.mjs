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

// Try executing alter table SQL via RPC if enabled, or check response
try {
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: "ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;"
  });
  console.log("RPC exec_sql result:", data, error);
} catch (err) {
  console.log("RPC exec_sql error:", err);
}
