/**
 * ALERTS — storage. Server-only; the rules are in lib/alert-utils.ts.
 *
 * One table, `product_alerts` (supabase/migration-rewards.sql), read and
 * written only by the server: it holds customers' phone numbers, so row
 * level security is on with no policies and the browser never touches it.
 */

import type { ProductAlert } from "./alert-utils";
import { getDB, mutateDB } from "./db";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";

export const ALERTS_MIGRATION =
  "Alerts need their table — run supabase/migration-rewards.sql in Supabase.";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

type Row = Record<string, unknown>;

const fromRow = (r: Row): ProductAlert => ({
  id: String(r.id),
  productId: String(r.product_id),
  store: String(r.store),
  kind: r.kind as ProductAlert["kind"],
  phone: String(r.phone),
  name: (r.name as string) || undefined,
  email: (r.email as string) || undefined,
  lang: (r.lang as string) || undefined,
  priceThen: r.price_then === null || r.price_then === undefined ? undefined : Number(r.price_then),
  createdAt: String(r.created_at),
  sentAt: (r.sent_at as string) || undefined,
  sentVia: (r.sent_via as ProductAlert["sentVia"]) || undefined,
});

/** Alerts still waiting to be sent — one shop's, or everyone's. */
export async function getOpenAlerts(store?: string): Promise<ProductAlert[]> {
  if (isSupabaseConfigured()) {
    let query = getDataClient().from("product_alerts").select("*").is("sent_at", null);
    if (store) query = query.eq("store", store);
    const { data, error } = await query.order("created_at", { ascending: true }).limit(2000);
    if (error) {
      // Not migrated yet: there are simply no alerts.
      if (!missingTable(error)) console.warn("[Alerts] read failed:", error.message);
      return [];
    }
    return (data ?? []).map(fromRow);
  }
  return ((await getDB()).alerts ?? []).filter((a) => !a.sentAt && (!store || a.store === store));
}

/**
 * Record a sign-up. Asking twice for the same thing is one alert, not two —
 * the second tap just reassures them it is set.
 */
export async function addAlert(alert: ProductAlert): Promise<{ ok: boolean; error?: string }> {
  const open = await getOpenAlerts(alert.store);
  if (open.some((a) => a.productId === alert.productId && a.kind === alert.kind && a.phone === alert.phone)) {
    return { ok: true };
  }
  // One number cannot be used to flood a shop's list.
  if (open.filter((a) => a.phone === alert.phone).length >= 25) {
    return { ok: false, error: "limit" };
  }

  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("product_alerts").insert({
      id: alert.id,
      product_id: alert.productId,
      store: alert.store,
      kind: alert.kind,
      phone: alert.phone,
      name: alert.name ?? null,
      email: alert.email ?? null,
      lang: alert.lang ?? null,
      price_then: alert.priceThen ?? null,
      created_at: alert.createdAt,
    });
    if (!error) return { ok: true };
    if (!missingTable(error)) console.error("[Alerts] insert failed:", error.message);
    return { ok: false, error: missingTable(error) ? "migration" : "save" };
  }
  await mutateDB((db) => {
    db.alerts = [...(db.alerts ?? []), alert];
  });
  return { ok: true };
}

/** Close alerts once their message has gone. `store` scopes a seller to their own. */
export async function markAlertsSent(ids: string[], via: "manual" | "auto", store?: string): Promise<boolean> {
  if (ids.length === 0) return true;
  const sentAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    let query = getDataClient().from("product_alerts").update({ sent_at: sentAt, sent_via: via }).in("id", ids);
    if (store) query = query.eq("store", store);
    const { error } = await query;
    if (error) console.error("[Alerts] mark sent failed:", error.message);
    return !error;
  }
  await mutateDB((db) => {
    db.alerts = (db.alerts ?? []).map((a) =>
      ids.includes(a.id) && (!store || a.store === store) ? { ...a, sentAt, sentVia: via } : a,
    );
  });
  return true;
}
