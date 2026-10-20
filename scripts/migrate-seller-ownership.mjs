#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ONE-TIME: move store ownership to where only the server can write it.
 * ─────────────────────────────────────────────────────────────────────────
 * Store ownership used to be read from `user_metadata.store` — a field the
 * signed-in user can edit from the browser, so any customer could make
 * themselves the owner of any shop. It is now read ONLY from
 * `app_metadata` (see lib/accounts.ts). Sellers whose ownership was only
 * ever recorded the old way would be signed in as customers until it is
 * copied across. That copy is what this script does — after a human has
 * looked at the list, because some of those claims may be forged.
 *
 *   npm run migrate:owners                       list claims, change nothing
 *   npm run migrate:owners -- --apply            bind every store with exactly
 *                                                ONE claimant
 *   npm run migrate:owners -- --assign slug=email   bind one store explicitly
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * the environment, or from .env.local).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SELLER_SUFFIX = "@seller.banaadirmall.com";

function loadEnv() {
  const env = { ...process.env };
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const assignments = args
  .flatMap((a, i) => (a === "--assign" ? [args[i + 1]] : []))
  .filter(Boolean)
  .map((pair) => {
    const [slug, email] = pair.split("=");
    return { slug: slug?.trim(), email: email?.trim().toLowerCase() };
  });

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function bind(user, slug) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "seller", store: slug },
  });
  if (error) throw new Error(`${user.email}: ${error.message}`);
  console.log(`  ✓ ${user.email} → owner of ${slug}`);
}

const [{ data: stores, error: storeErr }, users] = await Promise.all([
  supabase.from("stores").select("slug,name,status"),
  allUsers(),
]);
if (storeErr) throw storeErr;
const storeBySlug = new Map(stores.map((s) => [s.slug, s]));

// ── Explicit assignments ────────────────────────────────────────────────
if (assignments.length) {
  for (const { slug, email } of assignments) {
    const user = users.find((u) => u.email?.toLowerCase() === email);
    if (!storeBySlug.has(slug)) console.error(`  ✗ no store "${slug}"`);
    else if (!user) console.error(`  ✗ no account for ${email}`);
    else await bind(user, slug);
  }
  process.exit(0);
}

// ── Survey ──────────────────────────────────────────────────────────────
const claims = new Map(); // slug → [{ user, why }]
for (const user of users) {
  if (user.app_metadata?.role === "seller" && user.app_metadata?.store) continue; // already bound
  const email = user.email?.toLowerCase() ?? "";
  const meta = user.user_metadata ?? {};
  let slug;
  let why;
  if (email.endsWith(SELLER_SUFFIX)) {
    slug = email.slice(0, -SELLER_SUFFIX.length);
    why = "owner login address";
  } else if (meta.role === "seller" && typeof meta.store === "string") {
    slug = meta.store;
    why = "user_metadata (editable by the user)";
  }
  if (!slug) continue;
  if (!claims.has(slug)) claims.set(slug, []);
  claims.get(slug).push({ user, why });
}

if (claims.size === 0) {
  console.log("✓ Nothing to migrate — every seller account is already bound.");
  process.exit(0);
}

console.log("\nUnbound store-ownership claims — CHECK these are the real owners:\n");
const unambiguous = [];
for (const [slug, list] of [...claims].sort()) {
  const store = storeBySlug.get(slug);
  console.log(`${slug}  (${store ? `${store.name}, ${store.status}` : "NO SUCH STORE"})`);
  for (const { user, why } of list) {
    console.log(
      `   ${user.email}  · ${why} · created ${user.created_at?.slice(0, 10)} · last sign-in ${
        user.last_sign_in_at?.slice(0, 10) ?? "never"
      } · email ${user.email_confirmed_at ? "confirmed" : "NOT confirmed"}`,
    );
  }
  if (!store) console.log("   → skipped: the store does not exist");
  else if (list.length > 1) console.log("   → AMBIGUOUS: pick one with --assign " + slug + "=<email>");
  else unambiguous.push({ slug, user: list[0].user });
}

if (!apply) {
  console.log(
    `\nDry run. ${unambiguous.length} store(s) have exactly one claimant.` +
      "\nIf the list above looks right, run again with --apply.",
  );
  process.exit(0);
}

console.log("\nBinding…");
for (const { slug, user } of unambiguous) await bind(user, slug);
console.log("Done.");
