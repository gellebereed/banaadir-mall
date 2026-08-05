/**
 * Applies supabase/migration-employee-permissions.sql, or tells you how to.
 *
 * Supabase does not expose DDL over the REST API, and this project has no
 * exec_sql helper function installed — so unless one exists, the honest
 * outcome is to print the SQL and the URL to paste it into rather than to
 * report a success that did not happen.
 *
 *   node scripts/migrate-employee-permissions.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const envPath = join(root, ".env.local");
if ((!url || !serviceKey) && existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    const value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    if (key === "NEXT_PUBLIC_SUPABASE_URL" && !url) url = value;
    if (key === "SUPABASE_SERVICE_ROLE_KEY" && !serviceKey) serviceKey = value;
  }
}

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sqlPath = join(root, "supabase", "migration-employee-permissions.sql");
const sql = readFileSync(sqlPath, "utf8");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

// Already done?
const probe = await fetch(
  `${url}/rest/v1/employees?select=id,permissions,status,invite_token&limit=1`,
  { headers },
);
if (probe.ok) {
  console.log("✅ The employees table already has the invitation columns. Nothing to do.");
  process.exit(0);
}

// Try the exec_sql helper, if this database happens to have one.
const attempt = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers,
  body: JSON.stringify({ sql }),
});

if (attempt.ok) {
  console.log("✅ Migration applied.");
  process.exit(0);
}

const projectRef = new URL(url).hostname.split(".")[0];
console.log(`
⚠️  This migration has to be applied by hand — Supabase does not accept
    schema changes over the REST API.

    1. Open  https://supabase.com/dashboard/project/${projectRef}/sql/new
    2. Paste everything between the lines below
    3. Run it, then re-run this script to confirm

    Until then the Team pages still work: invitations save, but without
    links or per-person permissions — everyone falls back to their role.

${"─".repeat(70)}
${sql.trim()}
${"─".repeat(70)}
`);
process.exit(1);
