/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHELF METRICS — is each recommendation shelf actually earning its place?
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Until this existed nothing was measured: nobody could tell
 * whether "Bought together" sells or "Chosen for you" is scrolled past.
 *
 * Four events, per shelf and page type, counted — never tied to a person:
 *
 *   impression  the shelf scrolled into view
 *   click       a product on it was tapped
 *   cart        a product tapped from it went into the basket (same device,
 *               within 7 days — attributed in the browser, see
 *               metrics-client.ts)
 *   order       …and was bought; `value` carries the revenue
 *
 * No shopper id, email, session or IP is stored: just "a cart from the
 * 'similar' shelf on a product page, on this day". That is enough to rank
 * shelves and tune their weights, which is all this is for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getDB, mutateDB } from "../db";
import { getDataClient } from "../supabase/service";
import { isSupabaseConfigured } from "../supabase/storage";

export const METRIC_KINDS = ["impression", "click", "cart", "order"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];
export const METRIC_SURFACES = ["home", "product", "cart", "wishlist", "confirmation"] as const;

export interface RecoMetricEvent {
  kind: MetricKind;
  surface: string;
  shelf: string;
  productId?: string;
  /** Revenue for an `order` event (USD). */
  value?: number;
  /** ISO day, "2026-10-21". */
  day: string;
}

/** Most local events kept in demo mode, oldest dropped first. */
const LOCAL_CAP = 20_000;

/** Validate whatever a browser sent; anything odd is dropped, not stored. */
export function cleanEvents(raw: unknown): RecoMetricEvent[] {
  if (!Array.isArray(raw)) return [];
  const day = new Date().toISOString().slice(0, 10);
  const out: RecoMetricEvent[] = [];
  for (const e of raw.slice(0, 60)) {
    if (!e || typeof e !== "object") continue;
    const { kind, surface, shelf, productId, value } = e as Record<string, unknown>;
    if (!METRIC_KINDS.includes(kind as MetricKind)) continue;
    if (!METRIC_SURFACES.includes(surface as (typeof METRIC_SURFACES)[number])) continue;
    if (typeof shelf !== "string" || !/^[a-z0-9-]{1,40}$/.test(shelf)) continue;
    out.push({
      kind: kind as MetricKind,
      surface: surface as string,
      shelf,
      productId: typeof productId === "string" && productId.length <= 80 ? productId : undefined,
      value: kind === "order" && typeof value === "number" && value >= 0 && value < 100_000 ? value : undefined,
      day,
    });
  }
  return out;
}

export async function recordEvents(events: RecoMetricEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient()
      .from("reco_events")
      .insert(
        events.map((e) => ({
          day: e.day,
          kind: e.kind,
          surface: e.surface,
          shelf: e.shelf,
          product_id: e.productId ?? null,
          value: e.value ?? null,
        })),
      );
    // Before migration-reco-metrics.sql, metrics are simply not kept.
    if (error) console.warn("[reco metrics] not stored:", error.message);
    return;
  }
  await mutateDB((db) => {
    db.recoEvents = [...(db.recoEvents ?? []), ...events].slice(-LOCAL_CAP);
  });
}

export interface ShelfStats {
  surface: string;
  shelf: string;
  impressions: number;
  clicks: number;
  carts: number;
  orders: number;
  revenue: number;
}

/** Totals per shelf over the last `days` days, best revenue first. */
export async function shelfStats(days = 30): Promise<{ rows: ShelfStats[]; stored: boolean }> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  let events: RecoMetricEvent[] = [];
  let stored = true;
  if (isSupabaseConfigured()) {
    // Summed in the database: the raw table grows by thousands of rows a
    // day once the site is busy, and only the totals are wanted here.
    const { data, error } = await getDataClient().rpc("reco_shelf_stats", { since: from });
    if (error) return { rows: [], stored: false };
    return {
      stored,
      rows: (data as Record<string, unknown>[]).map((r) => ({
        surface: String(r.surface),
        shelf: String(r.shelf),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        carts: Number(r.carts ?? 0),
        orders: Number(r.orders ?? 0),
        revenue: Number(r.revenue ?? 0),
      })),
    };
  }
  events = ((await getDB()).recoEvents ?? []).filter((e) => e.day >= from);
  const map = new Map<string, ShelfStats>();
  for (const e of events) {
    const key = `${e.surface}|${e.shelf}`;
    const row =
      map.get(key) ?? { surface: e.surface, shelf: e.shelf, impressions: 0, clicks: 0, carts: 0, orders: 0, revenue: 0 };
    if (e.kind === "impression") row.impressions++;
    else if (e.kind === "click") row.clicks++;
    else if (e.kind === "cart") row.carts++;
    else {
      row.orders++;
      row.revenue += e.value ?? 0;
    }
    map.set(key, row);
  }
  return { stored, rows: [...map.values()].sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks) };
}
