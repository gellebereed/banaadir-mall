/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHOP THE LOOK — storage and reads. Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 * The model and the pure helpers are in lib/look-utils.ts (the browser
 * needs them too). Supabase table: supabase/migration-looks.sql. Without
 * Supabase, looks live in data/db.json like every other runtime record.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getListedStores, getMarketplaceProducts, getPublicOffers } from "./api";
import { getDB, mutateDB } from "./db";
import {
  isOccasion,
  lookCard,
  lookView,
  sortLooks,
  type Look,
  type LookCardData,
  type LookItem,
  type LookView,
} from "./look-utils";
import type { Product } from "./types";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";

export const LOOKS_MIGRATION =
  "Looks need one database update first — run supabase/migration-looks.sql in Supabase.";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

function items(raw: unknown): LookItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => ({
      productId: String((i as LookItem)?.productId ?? ""),
      x: Number((i as LookItem)?.x),
      y: Number((i as LookItem)?.y),
    }))
    .filter((i) => i.productId && Number.isFinite(i.x) && Number.isFinite(i.y));
}

function fromRow(r: Record<string, unknown>): Look {
  return {
    id: String(r.id),
    store: (r.store as string) || undefined,
    title: String(r.title ?? ""),
    description: (r.description as string) || undefined,
    image: String(r.image ?? ""),
    occasions: (Array.isArray(r.occasions) ? r.occasions : []).filter(isOccasion),
    items: items(r.items),
    discountPct: r.discount_pct == null ? undefined : Number(r.discount_pct),
    offerId: (r.offer_id as string) || undefined,
    active: r.active !== false,
    position: Number(r.position ?? 0),
    createdAt: String(r.created_at ?? new Date(0).toISOString()),
    updatedAt: (r.updated_at as string) || undefined,
  };
}

/**
 * Every look, in feed order. `store` narrows to one shop's; inactive ones
 * are included — callers that face shoppers go through lookView(), which
 * drops them.
 */
export async function getLooks(store?: string): Promise<Look[]> {
  let list: Look[];
  if (isSupabaseConfigured()) {
    let query = getDataClient().from("looks").select("*");
    if (store) query = query.eq("store", store);
    const { data, error } = await query;
    if (error || !data) {
      // Not migrated yet: no looks anywhere rather than an error page.
      if (!missingTable(error)) console.warn("[Looks] read failed:", error?.message);
      return [];
    }
    list = data.map(fromRow);
  } else {
    list = ((await getDB()).looks ?? []).filter((l) => !store || l.store === store);
  }
  return sortLooks(list);
}

export async function getLook(id: string): Promise<Look | undefined> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient().from("looks").select("*").eq("id", id).maybeSingle();
    if (error || !data) return undefined;
    return fromRow(data);
  }
  return ((await getDB()).looks ?? []).find((l) => l.id === id);
}

export async function saveLook(look: Look): Promise<void> {
  const row = { ...look, updatedAt: new Date().toISOString() };
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient()
      .from("looks")
      .upsert(
        {
          id: row.id,
          store: row.store ?? null,
          title: row.title,
          description: row.description ?? null,
          image: row.image,
          occasions: row.occasions,
          items: row.items,
          discount_pct: row.discountPct ?? null,
          offer_id: row.offerId ?? null,
          active: row.active,
          position: row.position,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        },
        { onConflict: "id" },
      );
    if (!error) return;
    // With Supabase as the source of truth a local write would look saved
    // and then vanish — say what is missing instead.
    throw new Error(missingTable(error) ? LOOKS_MIGRATION : error.message);
  }
  await mutateDB((db) => {
    const list = db.looks ?? [];
    const index = list.findIndex((l) => l.id === row.id);
    if (index >= 0) list[index] = row;
    else list.push(row);
    db.looks = list;
  });
}

export async function deleteLook(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("looks").delete().eq("id", id);
    if (error) throw new Error(missingTable(error) ? LOOKS_MIGRATION : error.message);
    return;
  }
  await mutateDB((db) => {
    db.looks = (db.looks ?? []).filter((l) => l.id !== id);
  });
}

/**
 * The looks shoppers may see, resolved against today's catalogue — for the
 * home page's row and /looks. Pass the catalogue when the page already has
 * it (the home page does) to avoid reading it twice.
 */
export async function getLookFeed(catalogue?: Product[]): Promise<{ views: LookView[]; cards: LookCardData[] }> {
  const [looks, products, offers, stores] = await Promise.all([
    getLooks(),
    catalogue ?? getMarketplaceProducts(),
    getPublicOffers(),
    getListedStores(),
  ]);
  if (looks.length === 0) return { views: [], cards: [] };
  const byId = new Map(products.map((p) => [p.id, p]));
  const names = new Map(stores.map((s) => [s.slug, s.name]));
  const views = looks.map((look) => lookView(look, byId, offers)).filter((v): v is LookView => v !== null);
  return { views, cards: views.map((v) => lookCard(v, names)) };
}
