import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicClient, isSupabaseConfigured } from "./public-client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SERVER'S DATABASE CLIENT — every read and write the app performs.
 * ─────────────────────────────────────────────────────────────────────────
 * SERVER-ONLY. Never import this from a "use client" file.
 *
 * ── Why the public key stopped being enough ──────────────────────────────
 * The app used to read and write every table with the PUBLIC (anon) key —
 * the same key that ships inside every visitor's browser. For that to
 * work, the database had to let the public key do anything: the policies
 * were `FOR ALL USING (true)` on orders, employees, stores and products.
 * So anyone could skip the app entirely and, with the key from the page
 * source, read every customer's phone and address, copy every staff
 * invite link, or rewrite any store.
 *
 * Now the server uses the SERVICE ROLE key, which only the server holds,
 * and supabase/migration-lockdown.sql removes the public key's access to
 * every table. Permission checks live where they always did — in the
 * server actions — and the database no longer has to trust the internet.
 *
 * ── Rollout without an outage ────────────────────────────────────────────
 * Without SUPABASE_SERVICE_ROLE_KEY this falls back to the public client,
 * which keeps working only while the old open policies are in place. So:
 * set the key, deploy, THEN run the lockdown migration. /api/health says
 * which state an environment is in.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The service role key, if this environment has a real one. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return key && !key.includes("your-service-role-key") ? key : "";
}

/** Is the server able to act with full rights (and so the DB can be locked)? */
export function hasServiceRole(): boolean {
  return isSupabaseConfigured() && Boolean(serviceRoleKey());
}

let service: SupabaseClient | null = null;

/** Full-rights client. Throws when there is no service key — callers check first. */
export function getServiceClient(): SupabaseClient {
  if (!hasServiceRole()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  if (service) return service;
  service = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

let warned = false;

/**
 * The client for app data: the service client when there is one, else the
 * public client (legacy, open-policy databases only — warns once).
 */
export function getDataClient(): SupabaseClient {
  if (hasServiceRole()) return getServiceClient();
  if (!warned && isSupabaseConfigured()) {
    warned = true;
    console.warn(
      "[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set — reading and writing with the public key. " +
        "This only works while the database is wide open. Set the key, then run supabase/migration-lockdown.sql.",
    );
  }
  return getPublicClient();
}
