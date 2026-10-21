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

export const METRIC_KINDS = ["impression", "click", "cart", "order", "coview"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];
export const METRIC_SURFACES = ["home", "product", "cart", "wishlist", "confirmation"] as const;

export interface RecoMetricEvent {
  kind: MetricKind;
  surface: string;
  shelf: string;
  productId?: string;
  /** Revenue for an `order` event (USD). */
  value?: number;
  /** The strategy that put the product on the shelf (engine.ts, `via`). */
  via?: string;
  /** For an impression: how many cards each strategy filled on the shelf. */
  items?: Record<string, number>;
  /** For a `coview`: the other product viewed in the same visit. */
  otherId?: string;
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
    const { kind, surface, shelf, productId, value, via, items, otherId } = e as Record<string, unknown>;
    if (!METRIC_KINDS.includes(kind as MetricKind)) continue;
    const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : undefined);
    if (kind === "coview") {
      // Two products viewed in one visit — and nothing else, by design.
      const a = id(productId);
      const b = id(otherId);
      if (a && b && a !== b) out.push({ kind: "coview", surface: "product", shelf: "coview", productId: a, otherId: b, day });
      continue;
    }
    if (!METRIC_SURFACES.includes(surface as (typeof METRIC_SURFACES)[number])) continue;
    if (typeof shelf !== "string" || !/^[a-z0-9-]{1,40}$/.test(shelf)) continue;
    const key = (v: unknown) => (typeof v === "string" && /^[a-z0-9-]{1,30}$/.test(v) ? v : undefined);
    let counts: Record<string, number> | undefined;
    if (kind === "impression" && items && typeof items === "object") {
      counts = {};
      for (const [k, n] of Object.entries(items as Record<string, unknown>).slice(0, 20)) {
        if (key(k) && typeof n === "number" && n > 0 && n <= 50) counts[k] = Math.round(n);
      }
    }
    out.push({
      kind: kind as MetricKind,
      surface: surface as string,
      shelf,
      productId: id(productId),
      value: kind === "order" && typeof value === "number" && value >= 0 && value < 100_000 ? value : undefined,
      via: key(via),
      items: counts,
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
          via: e.via ?? null,
          items: e.items ?? null,
          other_id: e.otherId ?? null,
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
  events = ((await getDB()).recoEvents ?? []).filter((e) => e.day >= from && e.kind !== "coview");
  const map = new Map<string, ShelfStats>();
  for (const e of events) {
    const key = `${e.surface}|${e.shelf}`;
    const row =
      map.get(key) ?? { surface: e.surface, shelf: e.shelf, impressions: 0, clicks: 0, carts: 0, orders: 0, revenue: 0 };
    if (e.kind === "impression") row.impressions++;
    else if (e.kind === "click") row.clicks++;
    else if (e.kind === "cart") row.carts++;
    else if (e.kind === "order") {
      row.orders++;
      row.revenue += e.value ?? 0;
    }
    map.set(key, row);
  }
  return { stored, rows: [...map.values()].sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks) };
}

// ── Per strategy (auto-tuning) and co-views ────────────────────────────

export interface StrategyStats {
  via: string;
  /** Cards this strategy filled on shelves that were seen. */
  impressions: number;
  clicks: number;
  carts: number;
  orders: number;
}

/** How each strategy's picks performed — what lib/reco/tuning.ts learns from. */
export async function strategyStats(days = 30): Promise<StrategyStats[] | null> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient().rpc("reco_strategy_stats", { since: from });
    if (error || !data) return null;
    return (data as Record<string, unknown>[]).map((r) => ({
      via: String(r.via),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      carts: Number(r.carts ?? 0),
      orders: Number(r.orders ?? 0),
    }));
  }
  const map = new Map<string, StrategyStats>();
  const row = (via: string) => {
    const r = map.get(via) ?? { via, impressions: 0, clicks: 0, carts: 0, orders: 0 };
    map.set(via, r);
    return r;
  };
  for (const e of ((await getDB()).recoEvents ?? []).filter((e) => e.day >= from)) {
    if (e.kind === "impression") for (const [via, n] of Object.entries(e.items ?? {})) row(via).impressions += n;
    else if (e.via && e.kind === "click") row(e.via).clicks++;
    else if (e.via && e.kind === "cart") row(e.via).carts++;
    else if (e.via && e.kind === "order") row(e.via).orders++;
  }
  return [...map.values()];
}

/** Co-view pair counts — products viewed in the same visit (lib/reco/coview.ts). */
export async function coviewPairs(days = 60): Promise<{ a: string; b: string; n: number }[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient().rpc("reco_coview_pairs", { since: from });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({ a: String(r.a), b: String(r.b), n: Number(r.n ?? 0) }));
  }
  const counts = new Map<string, number>();
  for (const e of (await getDB()).recoEvents ?? []) {
    if (e.kind !== "coview" || e.day < from || !e.productId || !e.otherId) continue;
    const [a, b] = [e.productId, e.otherId].sort();
    counts.set(`${a}|${b}`, (counts.get(`${a}|${b}`) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => {
    const [a, b] = k.split("|");
    return { a, b, n };
  });
}
