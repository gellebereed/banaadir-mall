import { unstable_cache } from "next/cache";
import { categoryIcon } from "../category-icons";
import { CACHE_TAGS, getPublicClient } from "./public-client";
import type {
  Category,
  Employee,
  MarketingSettings,
  Order,
  Product,
  ProductReview,
  ProductStory,
  Promotion,
  RecoSettings,
  Store,
} from "../types";
import { isSupabaseConfigured } from "./storage";

export { isSupabaseConfigured };

const DEFAULT_ART = { from: "#e0f2fe", to: "#bae6fd" };

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
    const { data, error } = await supabase.from("stores").select("*");
    /*
     * An EMPTY table is an answer, not a failure.
     *
     * This used to collapse zero rows to null, which the data layer reads
     * as "Supabase is unavailable, use the bundled seed catalogue". The
     * result: a marketplace that deliberately cleared its demo data
     * watched every demo product and store reappear, with no way to reach
     * zero. Only a real error or a missing response falls back now.
     */
    if (error || !data) return null;
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
    const { data, error } = await supabase.from("categories").select("*");
    if (error || !data || data.length === 0) return null;
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
    const { data, error } = await supabase.from("products").select("*");
    /*
     * An EMPTY table is an answer, not a failure.
     *
     * This used to collapse zero rows to null, which the data layer reads
     * as "Supabase is unavailable, use the bundled seed catalogue". The
     * result: a marketplace that deliberately cleared its demo data
     * watched every demo product and store reappear, with no way to reach
     * zero. Only a real error or a missing response falls back now.
     */
    if (error || !data) return null;
    return data.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
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
    const { data, error } = await supabase.from("orders").select("*");
    // `null` means "no answer" (unconfigured or failed) — only then should
    // the caller fall back to demo data. An EMPTY table is a real answer:
    // this shop has no orders yet. Treating the two the same made a
    // freshly-cleared database repopulate the dashboard with fake orders.
    if (error || !data) return null;
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
    }));
  } catch {
    return null;
  }
}

async function fetchPromotionsFromSupabaseRaw(): Promise<Promotion[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase.from("promotions").select("*");
    if (error || !data) return null;
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
    const { data, error } = await supabase.from("employees").select("*");
    if (error || !data) return null;
    return data.map((e) => ({
      id: e.id,
      store: e.store,
      name: e.name,
      email: e.email,
      role: e.role as Employee["role"],
      addedAt: e.added_at || new Date().toISOString(),
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

export const fetchProductsFromSupabase = cached(
  fetchProductsFromSupabaseRaw, "products", CACHE_TAGS.products);

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

export const fetchRecoSettingsFromSupabase = cached(
  fetchRecoSettingsFromSupabaseRaw, "reco", CACHE_TAGS.reco);

export const fetchStoriesFromSupabase = cached(
  fetchStoriesFromSupabaseRaw, "stories", CACHE_TAGS.stories);

export const fetchReviewsFromSupabase = cached(
  fetchReviewsFromSupabaseRaw, "reviews", CACHE_TAGS.reviews);
