/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ACTIVITY LOG — who changed what, and when.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only.
 *
 * With staff on a store's team there was no way to answer "who changed
 * this price?" or "who removed Hodan from the team?". Every action that
 * changes a store's catalogue, orders, team, settings, ownership or money
 * now writes one line here: the person, the store, and a sentence.
 *
 * Logging must never break the action it describes — a failed write is a
 * console warning, not an error. Without the table (migration not run yet)
 * or without Supabase, entries go to the local JSON file instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ActivityEntry } from "./ledger-types";
import { getDB, mutateDB } from "./db";
import { getSession } from "./session";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";

/** Local log size cap — the file is a dev fallback, not an archive. */
const LOCAL_LIMIT = 2000;

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

let warnedMissing = false;
function warnMissing() {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn("[Activity] activity_log table missing — run supabase/migration-payouts-activity.sql.");
}

/**
 * Record an action by whoever is signed in.
 *
 * @param store   the store it happened in ("platform" for admin-wide)
 * @param action  a stable key, e.g. "product.update"
 * @param summary the sentence people will read: "Changed the price of …"
 */
export async function logActivity(
  store: string,
  action: string,
  summary: string,
  target?: string,
): Promise<void> {
  try {
    const session = await getSession();
    const entry: ActivityEntry = {
      id: `act-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      store: store || "platform",
      actorEmail: session?.email,
      actorName: session?.name,
      action,
      summary: summary.slice(0, 500),
      target,
    };

    if (isSupabaseConfigured()) {
      const { error } = await getDataClient().from("activity_log").insert({
        at: entry.at,
        store: entry.store,
        actor_email: entry.actorEmail ?? null,
        actor_name: entry.actorName ?? null,
        action: entry.action,
        summary: entry.summary,
        target: entry.target ?? null,
      });
      if (!error) return;
      if (missingTable(error)) warnMissing();
      else console.warn("[Activity] could not write:", error.message);
    }

    await mutateDB((db) => {
      db.activity = [...(db.activity ?? []), entry].slice(-LOCAL_LIMIT);
    });
  } catch (err) {
    console.warn("[Activity] could not write:", err);
  }
}

/** Newest first. `store` undefined = everything (the admin's view). */
export async function getActivity(store?: string, limit = 200): Promise<ActivityEntry[]> {
  if (isSupabaseConfigured()) {
    let query = getDataClient()
      .from("activity_log")
      .select("*")
      .order("at", { ascending: false })
      .limit(limit);
    if (store) query = query.eq("store", store);
    const { data, error } = await query;
    if (!error && data) {
      return data.map((row) => ({
        id: String(row.id),
        at: row.at,
        store: row.store ?? "platform",
        actorEmail: row.actor_email ?? undefined,
        actorName: row.actor_name ?? undefined,
        action: row.action,
        summary: row.summary,
        target: row.target ?? undefined,
      }));
    }
    if (missingTable(error)) warnMissing();
  }
  const local = (await getDB()).activity ?? [];
  return local
    .filter((e) => !store || e.store === store)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
