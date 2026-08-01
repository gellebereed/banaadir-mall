import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for PUBLIC catalog reads (products, stores,
 * categories, marketing…).
 *
 * The client in ./server.ts reads cookies, which makes any function using it
 * dynamic — Next.js refuses to cache it. Catalog data is the same for every
 * visitor, so it doesn't need a per-user session at all. Using this client
 * lets those reads sit behind `unstable_cache` (see db-api.ts), which is what
 * takes a page from ~6 Supabase round-trips down to zero on a cache hit.
 *
 * Never use this for anything user-specific or permission-sensitive.
 */
let client: SupabaseClient | null = null;

export function getPublicClient(): SupabaseClient {
  if (client) return client;
  client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}

/** Cache tags — mutations revalidate these so edits appear immediately. */
export const CACHE_TAGS = {
  products: "bm:products",
  stores: "bm:stores",
  categories: "bm:categories",
  orders: "bm:orders",
  promotions: "bm:promotions",
  employees: "bm:employees",
  marketing: "bm:marketing",
  flash: "bm:flash",
} as const;

/** Every tag, for the blanket invalidation a dashboard save performs. */
export const ALL_CACHE_TAGS = Object.values(CACHE_TAGS);
