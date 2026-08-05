/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PENDING MIGRATIONS — what this database still needs, and the SQL for it.
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run migrate
 *
 * Supabase does not accept DDL over the REST API and this project has no
 * exec_sql helper installed, so this cannot apply anything itself. What it
 * CAN do is answer the question that actually matters — which migrations
 * are still outstanding — by probing for their effects, and then print
 * exactly the SQL to paste. Reporting a migration as applied when it was
 * not is the failure mode worth engineering against here.
 * ─────────────────────────────────────────────────────────────────────────
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

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const api = (path, init) => fetch(`${url}/rest/v1/${path}`, { ...init, headers });

/** A row id no real product will ever have. */
const PROBE_ID = "__banaadir_migration_probe__";

/**
 * Does the products table still reject a single-variant product whose
 * variant carries the product's own reference?
 *
 * Probed by attempting the write. A faulty trigger rejects it, so nothing
 * is stored and there is nothing to clean up; a fixed trigger accepts it,
 * and the row is deleted immediately afterwards. Any leftover is reported
 * rather than left to be discovered later — it is hidden and filed under a
 * store slug that does not exist, so it cannot reach the storefront.
 */
async function singleVariantCodesPending() {
  await api(`products?id=eq.${PROBE_ID}`, { method: "DELETE" });

  const response = await api("products", {
    method: "POST",
    body: JSON.stringify({
      id: PROBE_ID,
      slug: PROBE_ID,
      store: "__probe__",
      name: "Migration probe",
      category: "__probe__",
      price: 1,
      hidden: true,
      internal_reference: "PROBE-REF-1",
      variants: [{ id: "v1", sku: "PROBE-REF-1", stock: 0 }],
    }),
  });

  if (response.ok) {
    const cleanup = await api(`products?id=eq.${PROBE_ID}`, { method: "DELETE" });
    if (!cleanup.ok) {
      console.warn(
        `⚠️  Could not remove the probe row "${PROBE_ID}". Delete it from the ` +
          `products table by hand — it is hidden, but it does not belong there.`,
      );
    }
    return false;
  }

  const body = await response.text();
  if (/more than one variant/i.test(body)) return true;

  // Anything else means the probe could not answer — a missing column, a
  // permissions problem. Say so instead of guessing either way.
  console.warn(`⚠️  Could not test the product-codes trigger: ${body.slice(0, 200)}`);
  return false;
}

/** Have the employee invitation columns been added yet? */
async function employeePermissionsPending() {
  const probe = await api("employees?select=id,permissions,status,invite_token&limit=1");
  return !probe.ok;
}

const MIGRATIONS = [
  {
    file: "migration-single-variant-codes.sql",
    title: "Let a single-variant product share its own codes with its variant",
    consequence:
      "Imports of general goods (kitchenware, appliances — anything without " +
      "colours and sizes) fail on EVERY row with " +
      '\'Internal reference "…" is used by more than one variant\'.',
    pending: singleVariantCodesPending,
  },
  {
    file: "migration-employee-permissions.sql",
    title: "Team invitations and per-person permissions",
    consequence:
      "Team members can be added, but invitation links and custom " +
      "permissions have nowhere to be stored — everyone falls back to their role.",
    pending: employeePermissionsPending,
  },
];

const outstanding = [];
for (const migration of MIGRATIONS) {
  const isPending = await migration.pending();
  console.log(`${isPending ? "❌ PENDING " : "✅ applied "} ${migration.file}`);
  if (isPending) outstanding.push(migration);
}

if (outstanding.length === 0) {
  console.log("\n✨ This database is up to date.");
  process.exit(0);
}

const projectRef = new URL(url).hostname.split(".")[0];
console.log(`
${"═".repeat(72)}
${outstanding.length} migration${outstanding.length === 1 ? "" : "s"} still to apply.

Supabase does not accept schema changes over the API, so this part is
manual:

  1. Open  https://supabase.com/dashboard/project/${projectRef}/sql/new
  2. Paste the SQL below (all of it — the order does not matter)
  3. Run it, then re-run  npm run migrate  to confirm
${"═".repeat(72)}`);

for (const migration of outstanding) {
  console.log(`\n-- ${migration.title}`);
  console.log(`-- Until this runs: ${migration.consequence}\n`);
  console.log(readFileSync(join(root, "supabase", migration.file), "utf8").trim());
  console.log();
}

process.exit(1);
