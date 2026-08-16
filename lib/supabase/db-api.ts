import { unstable_cache } from "next/cache";
import { cache as perRequest } from "react";
import { DEFAULT_COMMISSION } from "../commission";
import { DEFAULT_POS } from "../pos";
import { categoryIcon } from "../category-icons";
import { CACHE_TAGS, getPublicClient } from "./public-client";
import type {
  Category,
  Employee,
  MarketingSettings,
  Order,
  Product,
  ProductReview,
  ProductionRun,
  ProductStory,
  Promotion,
  Recipe,
  RecoSettings,
  Store,
  Supply,
  SupplyPurchase,
} from "../types";
import { isSupabaseConfigured } from "./storage";

export { isSupabaseConfigured };

const DEFAULT_ART = { from: "#e0f2fe", to: "#bae6fd" };

/**
 * PostgREST returns at most 1,000 rows per request, whatever you ask for.
 * Pages are this big; the last short page ends the loop.
 */
const PAGE_SIZE = 1000;

/**
 * Read an ENTIRE table, not the first thousand rows of it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * `.select("*")` looks like it returns everything and does not: PostgREST
 * caps every response at its `max-rows` setting, which is 1,000 by default,
 * and reports no error when it truncates. That is invisible on a demo
 * catalogue and catastrophic the moment a real one arrives — a supplier
 * import took this marketplace to 1,793 products, and 793 of them silently
 * ceased to exist. Not hidden, not out of stock: absent from the storefront,
 * absent from search, and absent from the seller's own dashboard, with
 * every count on every page quietly wrong.
 *
 * Anything that reads a whole table has to page. A truncated read is worse
 * than a failed one, because nothing about it looks like a failure.
 */
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;

    // A table that never returns a short page would loop forever. Far more
    // rows than this marketplace will hold, and still a bounded loop.
    if (page > 200) {
      console.warn("[Supabase] stopped paging after 200 pages — is a table unbounded?");
      return rows;
    }
  }
}

/** Stands in for "seen long ago" — see the seenAt mapping in orders. */
const EPOCH = new Date(0).toISOString();

const ICON_MAP: Record<string, string> = {
  Tv: "📱",
  Shirt: "👗",
  Home: "🛋️",
  Sparkles: "✨",
  ShoppingBag: "🛒",
  Dumbbell: "⚽",
  BookOpen: "📚",
  Baby: "🧸",
  electronics: "📱",
  fashion: "👗",
  beauty: "✨",
  groceries: "🛒",
};

/**
 * Franchised international brands. Used as a fallback so the home page's
 * "Official Brand Stores" row still works on databases where the
 * `stores.official` column hasn't been added yet (see supabase/migration.sql).
 */
const OFFICIAL_BRAND_SLUGS = new Set([
  "karaca-home",
  "us-polo-assn",
  "altinyildiz-classics",
  "ozdilek-home",
]);

/** Per-store fallback icons, again only used pre-migration. */
const STORE_ICON_FALLBACK: Record<string, string> = {
  "karaca-home": "🍳",
  "us-polo-assn": "🐎",
  "altinyildiz-classics": "🎩",
  "ozdilek-home": "🛁",
  "somali-electronics": "🔌",
  "banaadir-perfumes": "🧴",
};

const STORE_LOGO_FALLBACK: Record<string, string> = {
  "altinyildiz-classics": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Alt%C4%B1ny%C1%B1ld%C1%B1z_Classics_logo.png/320px-Alt%C4%B1ny%C1%B1ld%C1%B1z_Classics_logo.png",
  "karaca-home": "https://upload.wikimedia.org/wikipedia/commons/4/4e/Karaca_logo.png",
  "ozdilek-home": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Ozdilek_logo.png/320px-Ozdilek_logo.png",
  "us-polo-assn": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/U.S._Polo_Assn._logo.svg/320px-U.S._Polo_Assn._logo.svg.png",
};

async function fetchStoresFromSupabaseRaw(): Promise<Store[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("stores").select("*").range(from, to),
    );
    /*
     * An EMPTY table is an answer, not a failure.
     *
     * This used to collapse zero rows to null, which the data layer reads
     * as "Supabase is unavailable, use the bundled seed catalogue". The
     * result: a marketplace that deliberately cleared its demo data
     * watched every demo product and store reappear, with no way to reach
     * zero. Only a real error or a missing response falls back now.
     */
    if (!data) return null;
    return data.map((s) => ({
      slug: s.slug,
      name: s.name,
      // Keep the emoji even when a logo exists — StoreAvatar falls back to
      // it whenever the logo image fails to load.
      icon: s.icon || STORE_ICON_FALLBACK[s.slug] || "🛍️",
      tagline: s.tagline || "",
      city: s.location || "Mogadishu",
      category: s.category || "general",
      rating: Number(s.rating || 0),
      reviewCount: s.reviews_count || 0,
      followers: s.followers ?? 100,
      joinedYear: s.joined_year ?? 2026,
      verified: s.verified ?? true,
      // `?? fallback` (not `|| false`) so an explicit false from the DB wins
      // once the column exists, while a missing column still resolves.
      official: s.official ?? OFFICIAL_BRAND_SLUGS.has(s.slug),
      status: (s.status || "active") as Store["status"],
      art: s.art || DEFAULT_ART,
      logo: s.logo || STORE_LOGO_FALLBACK[s.slug] || undefined,
      banner: s.banner || undefined,
      // `phone` is the older column and was never read until now — falling
      // back to it means any number already entered there starts receiving
      // order notifications without the seller re-typing it.
      whatsapp: s.whatsapp || s.phone || undefined,
      couriers: Array.isArray(s.couriers) ? s.couriers : [],
      // Absent until supabase/migration-pos.sql is applied, and absent
      // means OFF — a marketplace does not switch a till on for every
      // shop in it because a column is missing.
      pos: { ...DEFAULT_POS, ...(s.pos ?? {}) },
    }));
  } catch {
    return null;
  }
}

const CANONICAL_SLUGS = [
  "electronics",
  "womens-fashion",
  "mens-fashion",
  "beauty",
  "home-living",
  "kids-baby",
  "sports-outdoor",
  "groceries",
];

async function fetchCategoriesFromSupabaseRaw(): Promise<Category[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("categories").select("*").range(from, to),
    );
    if (!data || data.length === 0) return null;
    const mapped = data.map((c) => {
      const taglineRaw = c.description || "";
      const isHidden = Boolean(c.hidden) || taglineRaw.startsWith("[HIDDEN]");
      const taglineClean = taglineRaw.replace(/^\[HIDDEN\]\s*/, "");
      const name = (c.name || "").replace(/^\[HIDDEN\]\s*/, "");
      return {
        slug: c.slug,
        name,
        // A stored glyph wins; a missing or placeholder one is derived from
        // the name. Without this, every category an import or an admin
        // created rendered as the same brown parcel.
        icon: categoryIcon(name, ICON_MAP[c.icon] || c.icon),
        image: c.image || undefined,
        tagline: taglineClean,
        art: c.art || DEFAULT_ART,
        hidden: isHidden,
        // Odoo product.category.parent_id — see supabase/migration-odoo-catalog.sql.
        parentSlug: c.parent_slug || undefined,
        odooId: c.odoo_id ?? undefined,
      };
    });
    // Filter to canonical categories in navbar order, appending any extra custom ones
    const canonicalMap = new Map(mapped.map((c) => [c.slug, c]));
    const result: Category[] = [];
    for (const slug of CANONICAL_SLUGS) {
      if (canonicalMap.has(slug)) {
        result.push(canonicalMap.get(slug)!);
        canonicalMap.delete(slug);
      }
    }
    // Append remaining custom categories (excluding legacy migration aliases)
    const LEGACY_ALIASES = new Set(["fashion-apparel", "beauty-perfume", "groceries-food", "sports-fitness", "baby-kids"]);
    for (const [slug, cat] of canonicalMap) {
      if (!LEGACY_ALIASES.has(slug)) {
        result.push(cat);
      }
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Feature bullets are plain sentences ("Ships within 24 hours").
 * They used to be squeezed into the `specs` {name,value} shape, which
 * appended a stray ": " on every save. Prefer the `features` column and
 * only reconstruct from `specs` for rows the migration hasn't touched.
 */
function mapFeatures(p: { features?: unknown; specs?: unknown }): string[] {
  if (Array.isArray(p.features) && p.features.length > 0) {
    return p.features.map(String);
  }
  if (Array.isArray(p.specs)) {
    return (p.specs as { name?: string; value?: string }[]).map((s) =>
      s.value ? `${s.name}: ${s.value}` : String(s.name ?? ""),
    );
  }
  return [];
}

/**
 * Categories that were renamed. Products still stored under the old slug
 * would otherwise appear in NO category page — the slug isn't in the
 * navigation, so they're unreachable. Remapping on read makes them visible
 * immediately, without needing a data migration first.
 * Keep in sync with LEGACY_CATEGORY_MAP in app/actions.ts.
 */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "fashion-apparel": "mens-fashion",
  "beauty-perfume": "beauty",
  "groceries-food": "groceries",
  "sports-fitness": "sports-outdoor",
  "baby-kids": "kids-baby",
};

async function fetchProductsFromSupabaseRaw(): Promise<Product[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("products").select("*").range(from, to),
    );
    /*
     * An EMPTY table is an answer, not a failure.
     *
     * This used to collapse zero rows to null, which the data layer reads
     * as "Supabase is unavailable, use the bundled seed catalogue". The
     * result: a marketplace that deliberately cleared its demo data
     * watched every demo product and store reappear, with no way to reach
     * zero. Only a real error or a missing response falls back now.
     */
    if (!data) return null;
    return data.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      // Undefined until migration-product-updated-at.sql is applied; the
      // sort falls back to created_at, then to the catalogue's own order.
      updatedAt: p.updated_at || p.created_at || undefined,
      store: p.store,
      category: LEGACY_CATEGORY_MAP[p.category] ?? p.category,
      subcategory: p.subcategory || undefined,
      // Odoo identity fields (supabase/migration-odoo-catalog.sql). `||
      // undefined` collapses both NULL and the empty string, so a product
      // with a blank code never looks like it has one.
      internalReference: p.internal_reference || undefined,
      barcode: p.barcode || undefined,
      uom: p.uom || "Units",
      odooId: p.odoo_id ?? undefined,
      price: Number(p.price),
      compareAt: p.compare_at ? Number(p.compare_at) : undefined,
      // Supplier provenance (supabase/migration-supplier-import.sql). Both
      // are absent on hand-entered products and on databases where that
      // migration hasn't been run.
      cost: p.cost !== undefined && p.cost !== null ? Number(p.cost) : undefined,
      supplier: p.supplier_meta || undefined,
      icon: p.icon || "🛍️",
      art: p.art || DEFAULT_ART,
      rating: Number(p.rating || 0),
      reviewCount: p.reviews_count || 0,
      sold: p.sold || 0,
      // Real stock number when the column exists. The old `in_stock ? 50 : 0`
      // is only a pre-migration fallback — it is why edited stock values
      // always snapped back to 50.
      stock:
        p.stock !== undefined && p.stock !== null ? Number(p.stock) : p.in_stock ? 50 : 0,
      badge: p.badge || undefined,
      colors: p.colors?.length ? p.colors : undefined,
      sizes: p.sizes?.length ? p.sizes : undefined,
      description: p.description || "",
      features: mapFeatures(p),
      hidden: p.hidden ?? false,
      featured: p.featured ?? false,
      images: p.images || [],
      variants: p.variants?.length ? p.variants : undefined,
      defaultVariantId: p.default_variant_id || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchOrdersFromSupabaseRaw(): Promise<Order[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("orders").select("*").range(from, to),
    );
    // `null` means "no answer" (unconfigured or failed) — only then should
    // the caller fall back to demo data. An EMPTY table is a real answer:
    // this shop has no orders yet. Treating the two the same made a
    // freshly-cleared database repopulate the dashboard with fake orders.
    if (!data) return null;
    return data.map((o) => ({
      id: o.id,
      date: o.date,
      customer: o.customer,
      email: o.email || "",
      phone: o.phone || "",
      address: o.address || "",
      city: o.city || "",
      store: o.store,
      total: Number(o.total),
      items: o.items || [],
      status: o.status as Order["status"],
      // Added by supabase/migration-order-delivery.sql.
      delivery: o.delivery || undefined,
      timeline: Array.isArray(o.timeline) ? o.timeline : [],
      // Added by supabase/migration-order-notifications.sql.
      //   column present, NULL   → new, badge it
      //   column present, a date → seen
      //   column absent entirely → treat every parcel as seen, so a
      //     database without the migration shows no badge rather than
      //     claiming every order is new.
      seenAt: "seen_at" in o ? (o.seen_at ?? undefined) : EPOCH,
      // Added by supabase/migration-pos.sql. Absent means the website,
      // which is what every order placed before the till existed was.
      channel: (o.channel as Order["channel"]) || undefined,
      payment: (o.payment as Order["payment"]) || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchPromotionsFromSupabaseRaw(): Promise<Promotion[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("promotions").select("*").range(from, to),
    );
    if (!data) return null;
    return data.map((p) => ({
      id: p.id,
      store: p.store,
      name: p.name,
      pct: p.pct,
      code: p.code || undefined,
      active: p.active ?? true,
      productIds: p.product_ids || undefined,
      startsAt: p.starts_at || undefined,
      endsAt: p.ends_at || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchEmployeesFromSupabaseRaw(): Promise<Employee[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("employees").select("*").range(from, to),
    );
    if (!data) return null;
    return data.map((e) => ({
      id: e.id,
      store: e.store,
      name: e.name,
      email: e.email,
      role: e.role as Employee["role"],
      addedAt: e.added_at || new Date().toISOString(),
      // Everything below arrives as undefined until
      // supabase/migration-employee-permissions.sql has been applied, and
      // every reader treats undefined as "fall back to the role" — so the
      // app works either side of that migration.
      permissions: Array.isArray(e.permissions)
        ? (e.permissions as Employee["permissions"])
        : undefined,
      status: (e.status as Employee["status"]) || "pending",
      inviteToken: e.invite_token || undefined,
      invitedAt: e.invited_at || e.added_at || undefined,
      acceptedAt: e.accepted_at || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchMarketingFromSupabaseRaw(): Promise<MarketingSettings | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase.from("marketing_settings").select("*").eq("id", 1).single();
    if (error || !data) return null;
    return {
      announcement: data.announcement,
      announcementBgColor: data.announcement_bg_color || data.announcementBgColor || "#0c2b34",
      announcementTextColor: data.announcement_text_color || data.announcementTextColor || "#ffffff",
      announcementScroll: data.announcement_scroll ?? data.announcementScroll ?? true,
      announcementSpeed: data.announcement_speed || data.announcementSpeed || 25,
      heroBadge: data.hero_badge,
      heroTitleTop: data.hero_title_top,
      heroTitleHighlight: data.hero_title_highlight,
      heroSubtitle: data.hero_subtitle,
      sections: data.sections || [],
      banners: data.banners || [],
      promoTiles: data.promo_tiles || [],
      campaign: data.campaign || { active: false, name: "Eid Mega Sale", pct: 10 },
      // Columns added later — defaults keep older databases working.
      delivery: data.delivery || {
        fee: 3,
        freeThreshold: 25,
        estimate: "Same-day in Mogadishu · 2–4 days nationwide",
      },
      promo: data.promo || { code: "BANAADIR10", pct: 10 },
      /*
       * Absent until supabase/migration-commission.sql has been run, and
       * absent must mean "charging nothing" rather than "charging the
       * default 10%". A marketplace does not start taking a cut because a
       * column is missing.
       */
      commission: { ...DEFAULT_COMMISSION, ...(data.commission ?? {}) },
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CACHED READS
// ═══════════════════════════════════════════════════════════════════════
// Every page previously re-queried Supabase for the same rows several times
// per render (the home page alone fetched the product table ~5 times, once
// for flash deals, bestsellers, new arrivals and so on). Wrapping the raw
// fetchers in `unstable_cache` collapses that to a single query, then serves
// later requests from the cache entirely.
//
// Each entry carries a tag; dashboard saves call revalidateTag() (see
// app/actions.ts) so an edit is visible immediately rather than after the
// revalidate window. The time-based `revalidate` is only a safety net for
// changes made directly in the Supabase dashboard.

/** Safety-net refresh interval, in seconds. */
const REVALIDATE_SECONDS = 60;

function cached<T>(fn: () => Promise<T>, key: string, tag: string) {
  return unstable_cache(fn, [key], { tags: [tag], revalidate: REVALIDATE_SECONDS });
}

export const fetchStoresFromSupabase = cached(
  fetchStoresFromSupabaseRaw, "stores", CACHE_TAGS.stores);

export const fetchCategoriesFromSupabase = cached(
  fetchCategoriesFromSupabaseRaw, "categories", CACHE_TAGS.categories);

/**
 * Products are memoised PER REQUEST, not in the data cache.
 *
 * ── Why this one is different ────────────────────────────────────────────
 * Next's data cache refuses any entry over 2 MB. This catalogue passed that
 * the day the supplier files landed — 1,700 products with their variants
 * serialise to about 2.2 MB — and what happens then is not a quiet miss:
 * `unstable_cache` REJECTS while trying to store the result, which arrives
 * as an unhandled rejection on every single product page render.
 *
 *   Failed to set Next.js data cache … items over 2MB can not be cached
 *
 * So the cache was doing neither of its jobs. Nothing was ever stored, so
 * every request re-read the whole table exactly as it had before the cache
 * was added — and each one now also threw. It could not be tuned back into
 * range either: the table only grows.
 *
 * React's `cache()` is the right tool for what this actually needed. The
 * problem it was introduced to solve was the home page reading the product
 * table five times in ONE render, and a per-request memo solves that
 * completely, with no size limit and nothing to serialise. What is given up
 * is cross-request reuse, which had never once worked here.
 *
 * The smaller tables below keep the data cache; they are nowhere near the
 * limit. `revalidateTag(CACHE_TAGS.products)` stays harmless — it is a
 * no-op against a tag nothing stores under, and it keeps the refresh path
 * uniform for whenever this table is read a page at a time instead.
 */
export const fetchProductsFromSupabase = perRequest(fetchProductsFromSupabaseRaw);

export const fetchOrdersFromSupabase = cached(
  fetchOrdersFromSupabaseRaw, "orders", CACHE_TAGS.orders);

export const fetchPromotionsFromSupabase = cached(
  fetchPromotionsFromSupabaseRaw, "promotions", CACHE_TAGS.promotions);

export const fetchEmployeesFromSupabase = cached(
  fetchEmployeesFromSupabaseRaw, "employees", CACHE_TAGS.employees);

export const fetchMarketingFromSupabase = cached(
  fetchMarketingFromSupabaseRaw, "marketing", CACHE_TAGS.marketing);

// ═══════════════════════════════════════════════════════════════════════
//  DISCOVERY — reco settings, product stories, customer reviews
// ═══════════════════════════════════════════════════════════════════════
// Every one of these returns null when the table is missing, so an install
// that hasn't run supabase/migration-discovery.sql keeps working off
// data/db.json instead of erroring.

async function fetchRecoSettingsFromSupabaseRaw(): Promise<RecoSettings | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase
      .from("reco_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (error || !data) return null;
    return {
      enabled: data.enabled ?? true,
      pinStrength: data.pin_strength ?? 55,
      shelves: data.shelves ?? [],
      pins: data.pins ?? [],
      blocked: data.blocked ?? [],
      prompts: {
        enabled: data.prompts?.enabled ?? true,
        askDepartments: data.prompts?.askDepartments ?? true,
        askBudget: data.prompts?.askBudget ?? true,
        askReview: data.prompts?.askReview ?? true,
        delaySeconds: data.prompts?.delaySeconds ?? 45,
        cooldownDays: data.prompts?.cooldownDays ?? 14,
      },
    };
  } catch {
    return null;
  }
}

async function fetchStoriesFromSupabaseRaw(): Promise<ProductStory[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase
      .from("product_stories")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error || !data) return null;
    return data.map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle || undefined,
      kind: (row.kind || "how-to") as ProductStory["kind"],
      productIds: row.product_ids ?? [],
      categorySlugs: row.category_slugs ?? [],
      store: row.store || undefined,
      videoUrl: row.video_url || undefined,
      poster: row.poster || undefined,
      heroImage: row.hero_image || undefined,
      chapters: row.chapters ?? [],
      gallery: row.gallery ?? [],
      duration: row.duration || undefined,
      published: row.published ?? false,
      updatedAt: row.updated_at || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

async function fetchReviewsFromSupabaseRaw(): Promise<ProductReview[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase
      .from("product_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error || !data) return null;
    return data.map((row) => ({
      id: row.id,
      productId: row.product_id,
      author: row.author,
      rating: row.rating,
      text: row.text || undefined,
      date: (row.created_at || new Date().toISOString()).slice(0, 10),
      verified: row.verified ?? false,
      orderId: row.order_id || undefined,
    }));
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  POINT OF SALE — the pantry, the recipes and the batches made
// ═══════════════════════════════════════════════════════════════════════
// Every one of these returns null when the table is missing, so an install
// that has not run supabase/migration-pos.sql keeps working exactly as it
// did — the till simply never appears.

async function fetchSuppliesFromSupabaseRaw(): Promise<Supply[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("supplies").select("*").range(from, to),
    );
    if (!data) return null;
    return data.map((row) => ({
      id: row.id,
      store: row.store,
      name: row.name,
      unit: row.unit as Supply["unit"],
      stock: Number(row.stock ?? 0),
      unitCost: Number(row.unit_cost ?? 0),
      lowAt: row.low_at !== null && row.low_at !== undefined ? Number(row.low_at) : undefined,
      icon: row.icon || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchSupplyPurchasesFromSupabaseRaw(): Promise<SupplyPurchase[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("supply_purchases").select("*").range(from, to),
    );
    if (!data) return null;
    return data.map((row) => ({
      id: row.id,
      store: row.store,
      supplyId: row.supply_id,
      qty: Number(row.qty ?? 0),
      totalCost: Number(row.total_cost ?? 0),
      date: (row.date ?? "").slice(0, 10),
      note: row.note || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchRecipesFromSupabaseRaw(): Promise<Recipe[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("recipes").select("*").range(from, to),
    );
    if (!data) return null;
    return data.map((row) => ({
      id: row.id,
      store: row.store,
      productId: row.product_id,
      name: row.name,
      items: Array.isArray(row.items) ? row.items : [],
      // `yield` is spelled out in the column name because it reads as a
      // keyword everywhere else it appears.
      yield: Number(row.yield_qty ?? 0),
      overhead: Number(row.overhead ?? 0),
      updatedAt: row.updated_at || undefined,
    }));
  } catch {
    return null;
  }
}

async function fetchProductionRunsFromSupabaseRaw(): Promise<ProductionRun[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("production_runs")
        .select("*")
        .order("date", { ascending: false })
        .range(from, to),
    );
    if (!data) return null;
    return data.map((row) => ({
      id: row.id,
      store: row.store,
      recipeId: row.recipe_id,
      batches: Number(row.batches ?? 0),
      madeQty: Number(row.made_qty ?? 0),
      unitCost: Number(row.unit_cost ?? 0),
      date: (row.date ?? "").slice(0, 10),
    }));
  } catch {
    return null;
  }
}

export const fetchSuppliesFromSupabase = cached(
  fetchSuppliesFromSupabaseRaw, "supplies", CACHE_TAGS.pos);

export const fetchSupplyPurchasesFromSupabase = cached(
  fetchSupplyPurchasesFromSupabaseRaw, "supply-purchases", CACHE_TAGS.pos);

export const fetchRecipesFromSupabase = cached(
  fetchRecipesFromSupabaseRaw, "recipes", CACHE_TAGS.pos);

export const fetchProductionRunsFromSupabase = cached(
  fetchProductionRunsFromSupabaseRaw, "production-runs", CACHE_TAGS.pos);

export const fetchRecoSettingsFromSupabase = cached(
  fetchRecoSettingsFromSupabaseRaw, "reco", CACHE_TAGS.reco);

export const fetchStoriesFromSupabase = cached(
  fetchStoriesFromSupabaseRaw, "stories", CACHE_TAGS.stories);

export const fetchReviewsFromSupabase = cached(
  fetchReviewsFromSupabaseRaw, "reviews", CACHE_TAGS.reviews);
