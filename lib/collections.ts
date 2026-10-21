/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STORE COLLECTIONS — a seller's own groupings of their products.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only.
 *
 * The category tree is the marketplace's: one shared, standard answer to
 * "what kind of thing is this", locked to the admin. But a store also wants
 * to say "Ramadan picks", "Kitchen essentials", "Under $20" — groupings
 * that mean something to its own customers and nothing to anyone else's.
 * Before this, the only place for that was a new category (cluttering
 * every shopper's menu) or the free-text subcategory (one per product).
 *
 * A collection is a named, ordered list of the store's products, shown as
 * a tab on the store page. A product can sit in any number of them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getDB, mutateDB } from "./db";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";

export interface StoreCollection {
  id: string;
  store: string;
  /** URL part: /store/<store>?c=<slug>. Unique within the store. */
  slug: string;
  name: string;
  description?: string;
  /** In the order the seller arranged them. */
  productIds: string[];
  /** Tab order on the store page, lowest first. */
  position: number;
  hidden?: boolean;
  updatedAt?: string;
}

export const COLLECTIONS_MIGRATION =
  "Collections need their table — run supabase/migration-store-collections.sql in Supabase.";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

export function collectionSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection"
  );
}

/** A store's collections in tab order. Hidden ones only when asked for. */
export async function getCollections(store: string, includeHidden = false): Promise<StoreCollection[]> {
  let list: StoreCollection[] | undefined;
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient()
      .from("store_collections")
      .select("*")
      .eq("store", store)
      .order("position", { ascending: true });
    if (!error && data) {
      list = data.map((r) => ({
        id: r.id,
        store: r.store,
        slug: r.slug,
        name: r.name,
        description: r.description ?? undefined,
        productIds: Array.isArray(r.product_ids) ? (r.product_ids as string[]) : [],
        position: r.position ?? 0,
        hidden: r.hidden ?? false,
        updatedAt: r.updated_at ?? undefined,
      }));
    } else {
      // Not migrated yet (or a failed read): the store page simply shows
      // no collection tabs rather than an error.
      if (!missingTable(error)) console.warn("[Collections] read failed:", error?.message);
      return [];
    }
  }
  list ??= ((await getDB()).collections ?? []).filter((c) => c.store === store);
  return list
    .filter((c) => includeHidden || !c.hidden)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export async function saveCollection(collection: StoreCollection): Promise<void> {
  const row = { ...collection, updatedAt: new Date().toISOString() };
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient()
      .from("store_collections")
      .upsert(
        {
          id: row.id,
          store: row.store,
          slug: row.slug,
          name: row.name,
          description: row.description ?? null,
          product_ids: row.productIds,
          position: row.position,
          hidden: row.hidden ?? false,
          updated_at: row.updatedAt,
        },
        { onConflict: "id" },
      );
    if (!error) return;
    // With Supabase as the source of truth, a local write would look saved
    // and then vanish. Say what is missing instead.
    throw new Error(missingTable(error) ? COLLECTIONS_MIGRATION : error.message);
  }
  await mutateDB((db) => {
    const list = db.collections ?? [];
    const index = list.findIndex((c) => c.id === row.id);
    if (index >= 0) list[index] = row;
    else list.push(row);
    db.collections = list;
  });
}

export async function deleteCollection(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("store_collections").delete().eq("id", id);
    if (error) throw new Error(missingTable(error) ? COLLECTIONS_MIGRATION : error.message);
    return;
  }
  await mutateDB((db) => {
    db.collections = (db.collections ?? []).filter((c) => c.id !== id);
  });
}
