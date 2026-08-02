import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env.local manually
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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase URL or key.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  console.log("Checking marketing_settings table columns...");

  const { data, error } = await supabase.from("marketing_settings").select("*").eq("id", 1).single();

  if (error) {
    console.error("Error reading marketing_settings:", error);
    return;
  }

  console.log("Current marketing_settings keys:", Object.keys(data || {}));

  // Test updating with announcement columns
  const testPayload = {
    ...data,
    announcement_bg_color: data.announcement_bg_color || "#0c2b34",
    announcement_text_color: data.announcement_text_color || "#ffffff",
    announcement_scroll: data.announcement_scroll ?? true,
    announcement_speed: data.announcement_speed || 25,
  };

  const { error: updateErr } = await supabase.from("marketing_settings").upsert(testPayload);

  if (updateErr) {
    console.error("Update with announcement columns failed:", updateErr.message);
  } else {
    console.log("Successfully updated marketing_settings table with announcement columns!");
  }
}

run();
