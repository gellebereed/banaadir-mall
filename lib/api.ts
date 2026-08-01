/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DATA ACCESS LAYER — the single integration point for Supabase & local DB.
 * ─────────────────────────────────────────────────────────────────────────
 * Every page and component reads data ONLY through the functions here.
 * When Supabase is configured, data is fetched live from Supabase Database.
 * When Supabase is offline or unconfigured, data falls back seamlessly to
 * the seed catalog in lib/data/* merged with runtime edits from lib/db.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { categories as seedCategories } from "./data/categories";
import { orders as seedOrders } from "./data/orders";
import { products as seedProducts } from "./data/products";
import { stores as seedStores } from "./data/stores";
import { getDB } from "./db";
import {
  fetchCategoriesFromSupabase,
  fetchEmployeesFromSupabase,
  fetchMarketingFromSupabase,
  fetchOrdersFromSupabase,
  fetchProductsFromSupabase,
  fetchPromotionsFromSupabase,
  fetchStoresFromSupabase,
} from "./supabase/db-api";
import type {
  Category,
  Employee,
  FlashDeal,
  FlashRequest,
  MarketingSettings,
  Order,
  Product,
  Promotion,
  Review,
  Store,
} from "./types";

// ── Categories ─────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const supabaseCategories = await fetchCategoriesFromSupabase();
  if (supabaseCategories && supabaseCategories.length > 0) {
    return supabaseCategories;
  }
  return seedCategories;
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  return (await getCategories()).find((c) => c.slug === slug);
}

// ── Stores ─────────────────────────────────────────────────────────────

/**
 * All stores with runtime changes applied: profile edits from the seller's
 * Settings page and status changes from the admin (approve/reject/suspend).
 */
export async function getAllStores(): Promise<Store[]> {
  const supabaseStores = await fetchStoresFromSupabase();
  if (supabaseStores && supabaseStores.length > 0) {
    return supabaseStores;
  }

  const db = await getDB();
  return seedStores.map((s) => {
    const merged = db.storeOverrides[s.slug] ? { ...s, ...db.storeOverrides[s.slug] } : s;
    return db.storeStatus[s.slug] ? { ...merged, status: db.storeStatus[s.slug] } : merged;
  });
}

/** Storefront view: only active stores. */
export async function getStores(): Promise<Store[]> {
  return (await getAllStores()).filter((s) => s.status === "active");
}

export async function getStore(slug: string): Promise<Store | undefined> {
  return (await getAllStores()).find((s) => s.slug === slug);
}

// ── Products ───────────────────────────────────────────────────────────

/**
 * The catalog as the SELLER maintains it — seed products minus deletions,
 * plus runtime-created products, with field overrides applied. No
 * promotion or campaign discounts.
 */
export async function getBaseProducts(): Promise<Product[]> {
  const supabaseProducts = await fetchProductsFromSupabase();
  if (supabaseProducts && supabaseProducts.length > 0) {
    return supabaseProducts;
  }

  const db = await getDB();
  return [
    ...seedProducts.filter((p) => !db.deletedProducts.includes(p.id)),
    ...db.newProducts,
  ].map((p) => (db.productOverrides[p.id] ? { ...p, ...db.productOverrides[p.id] } : p));
}

/** Base (undiscounted) product for the dashboards' edit forms. */
export async function getBaseProduct(id: string): Promise<Product | undefined> {
  return (await getBaseProducts()).find((p) => p.id === id || p.slug === id);
}

/**
 * Subcategories that exist inside a category, derived from the products
 * themselves. Sellers "create" one just by typing it on a product, so
 * there is no separate table to administer or keep in sync.
 * Pass no slug to get every subcategory across the catalog.
 */
export async function getSubcategories(categorySlug?: string): Promise<string[]> {
  const products = await getBaseProducts();
  const names = products
    .filter((p) => !categorySlug || p.category === categorySlug)
    .map((p) => p.subcategory?.trim())
    .filter((s): s is string => Boolean(s));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/** Base (undiscounted) products of one store, for dashboard tables. */
export async function getBaseProductsByStore(slug: string): Promise<Product[]> {
  return (await getBaseProducts()).filter((p) => p.store === slug);
}

/**
 * Highest discount percentage that applies to a given product right now.
 * A promotion covers the whole store when it has no productIds, or only
 * the listed products when it does. The site-wide campaign always applies.
 */
function discountPctFor(product: Product, db: Awaited<ReturnType<typeof getDB>>): number {
  const promo = db.promotions
    .filter(
      (p) =>
        p.active &&
        p.store === product.store &&
        (!p.productIds?.length || p.productIds.includes(product.id)),
    )
    .reduce((max, p) => Math.max(max, p.pct), 0);
  const campaign = db.marketing.campaign.active ? db.marketing.campaign.pct : 0;
  return Math.max(promo, campaign);
}

/** Discount percentage per product id, for dashboard tables and notices. */
export async function getDiscountMap(storeSlug?: string): Promise<Record<string, number>> {
  const db = await getDB();
  const products = await getBaseProducts();
  const map: Record<string, number> = {};
  for (const p of products) {
    if (storeSlug && p.store !== storeSlug) continue;
    const pct = discountPctFor(p, db);
    if (pct > 0) map[p.id] = pct;
  }
  return map;
}

/**
 * The catalog as CUSTOMERS see it: base products with the best available
 * discount applied (store/product promotion vs. site-wide campaign —
 * larger wins). Variant prices are discounted by the same percentage.
 * Includes hidden products; use getProducts() for the storefront.
 */
export async function getAllProducts(): Promise<Product[]> {
  const db = await getDB();
  const base = await getBaseProducts();

  return base.map((p) => {
    const pct = discountPctFor(p, db);
    if (pct <= 0) return p;
    const factor = 1 - pct / 100;
    const round = (n: number) => Math.round(n * factor * 100) / 100;
    return {
      ...p,
      price: round(p.price),
      compareAt: p.compareAt ?? p.price,
      badge: "Sale" as const,
      variants: p.variants?.map((v) =>
        v.price === undefined ? v : { ...v, price: round(v.price) },
      ),
    };
  });
}

/** Storefront view: hidden products excluded. */
export async function getProducts(): Promise<Product[]> {
  return (await getAllProducts()).filter((p) => !p.hidden);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  return (await getProducts()).find((p) => p.slug === slug);
}

/** Dashboard view of one product — finds hidden products too. */
export async function getAnyProduct(id: string): Promise<Product | undefined> {
  return (await getAllProducts()).find((p) => p.id === id || p.slug === id);
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.category === slug);
}

/** Storefront listing for a store page. */
export async function getProductsByStore(slug: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.store === slug);
}

/** Dashboard listing for a store — includes hidden products. */
export async function getAllProductsByStore(slug: string): Promise<Product[]> {
  return (await getAllProducts()).filter((p) => p.store === slug);
}

export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (await getProducts()).filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.includes(q),
  );
}

/** Products currently on sale — powers the "Flash Deals" rail. */
export async function getFlashDeals(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.compareAt).slice(0, 8);
}

export async function getBestsellers(limit = 8): Promise<Product[]> {
  return (await getProducts()).sort((a, b) => b.sold - a.sold).slice(0, limit);
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.badge === "New").slice(0, limit);
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  return (await getProducts())
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, limit);
}

// ── Promotions / employees / marketing ─────────────────────────────────

export async function getPromotionsByStore(storeSlug: string): Promise<Promotion[]> {
  const supabasePromotions = await fetchPromotionsFromSupabase();
  if (supabasePromotions) {
    return supabasePromotions.filter((p) => p.store === storeSlug);
  }
  return (await getDB()).promotions.filter((p) => p.store === storeSlug);
}

/** Employees of a store, or of the platform when storeSlug === "platform". */
export async function getEmployees(storeSlug: string): Promise<Employee[]> {
  const supabaseEmployees = await fetchEmployeesFromSupabase();
  if (supabaseEmployees) {
    return supabaseEmployees.filter((e) => e.store === storeSlug);
  }
  return (await getDB()).employees.filter((e) => e.store === storeSlug);
}

export async function getMarketingSettings(): Promise<MarketingSettings> {
  const supabaseMarketing = await fetchMarketingFromSupabase();
  if (supabaseMarketing) {
    return supabaseMarketing;
  }
  return (await getDB()).marketing;
}

// ── Flash deals ────────────────────────────────────────────────────────

export async function getFlashDeal(): Promise<FlashDeal> {
  return (await getDB()).flash;
}

/**
 * Products in the flash-deal campaign. When the admin hasn't curated a
 * list yet, fall back to whatever is on sale so the rail is never empty.
 */
export async function getFlashProducts(): Promise<Product[]> {
  const [flash, products] = await Promise.all([getFlashDeal(), getProducts()]);
  if (!flash.active) return [];
  if (flash.productIds.length > 0) {
    return products.filter((p) => flash.productIds.includes(p.id));
  }
  return products.filter((p) => p.compareAt).slice(0, 8);
}

/** Flash-deal applications; pass a store slug to see just that seller's. */
export async function getFlashRequests(storeSlug?: string): Promise<FlashRequest[]> {
  const requests = (await getDB()).flashRequests;
  return storeSlug ? requests.filter((r) => r.store === storeSlug) : requests;
}

// ── Orders ─────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Order[]> {
  const supabaseOrders = await fetchOrdersFromSupabase();
  if (supabaseOrders && supabaseOrders.length > 0) {
    return supabaseOrders;
  }
  const db = await getDB();
  return seedOrders.map((o) =>
    db.orderStatus[o.id] ? { ...o, status: db.orderStatus[o.id] } : o,
  );
}

export async function getOrdersByStore(storeSlug: string): Promise<Order[]> {
  return (await getOrders()).filter((o) => o.store === storeSlug);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return (await getOrders()).find(
    (o) => o.id.toLowerCase() === id.trim().toLowerCase(),
  );
}

// ── Aggregated statistics ──────────────────────────────────────────────

export interface MarketplaceStats {
  revenue: number;
  orderCount: number;
  productCount: number;
  activeStores: number;
  pendingStores: number;
  customers: number;
  revenueSeries: { date: string; value: number }[];
  topStores: { store: Store; revenue: number; orderCount: number }[];
}

export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const [allOrders, allStores, allProducts] = await Promise.all([
    getOrders(),
    getAllStores(),
    getAllProducts(),
  ]);
  const valid = allOrders.filter((o) => o.status !== "cancelled");
  const revenue = valid.reduce((sum, o) => sum + o.total, 0);

  const byStore = new Map<string, { revenue: number; orderCount: number }>();
  for (const o of valid) {
    const entry = byStore.get(o.store) ?? { revenue: 0, orderCount: 0 };
    entry.revenue += o.total;
    entry.orderCount += 1;
    byStore.set(o.store, entry);
  }
  const topStores = [...byStore.entries()]
    .map(([slug, v]) => ({ store: allStores.find((s) => s.slug === slug)!, ...v }))
    .filter((t) => t.store)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    revenue,
    orderCount: allOrders.length,
    productCount: allProducts.length,
    activeStores: allStores.filter((s) => s.status === "active").length,
    pendingStores: allStores.filter((s) => s.status === "pending").length,
    customers: new Set(allOrders.map((o) => o.customer)).size,
    revenueSeries: buildSeries(valid),
    topStores,
  };
}

export interface VendorStats {
  revenue: number;
  orderCount: number;
  productCount: number;
  unitsSold: number;
  rating: number;
  /** Average order value. */
  aov: number;
  pendingOrders: number;
  statusBreakdown: { status: Order["status"]; count: number }[];
  topProducts: { product: Product; revenue: number; units: number }[];
  revenueSeries: { date: string; value: number }[];
}

export async function getVendorStats(storeSlug: string): Promise<VendorStats> {
  const [storeOrders, storeProducts, store] = await Promise.all([
    getOrdersByStore(storeSlug),
    getAllProductsByStore(storeSlug),
    getStore(storeSlug),
  ]);
  const valid = storeOrders.filter((o) => o.status !== "cancelled");
  const revenue = valid.reduce((sum, o) => sum + o.total, 0);

  const statuses: Order["status"][] = ["pending", "processing", "shipped", "delivered", "cancelled"];

  const perProduct = new Map<string, { revenue: number; units: number }>();
  for (const o of valid) {
    for (const item of o.items) {
      const entry = perProduct.get(item.productId) ?? { revenue: 0, units: 0 };
      entry.revenue += o.total;
      entry.units += item.qty;
      perProduct.set(item.productId, entry);
    }
  }
  const topProducts = [...perProduct.entries()]
    .map(([id, v]) => ({ product: storeProducts.find((p) => p.id === id)!, ...v }))
    .filter((t) => t.product)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    revenue,
    orderCount: valid.length,
    productCount: storeProducts.length,
    unitsSold: valid.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0),
    rating: store?.rating ?? 0,
    aov: valid.length ? revenue / valid.length : 0,
    pendingOrders: storeOrders.filter((o) => o.status === "pending" || o.status === "processing").length,
    statusBreakdown: statuses.map((status) => ({
      status,
      count: storeOrders.filter((o) => o.status === status).length,
    })),
    topProducts,
    revenueSeries: buildSeries(valid),
  };
}

/** Daily revenue for the 14 days up to the demo "today" (2026-07-31). */
function buildSeries(source: Order[]): { date: string; value: number }[] {
  const series: { date: string; value: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const date = new Date(Date.UTC(2026, 6, 31) - d * 86400000)
      .toISOString()
      .slice(0, 10);
    const value = source
      .filter((o) => o.date === date)
      .reduce((sum, o) => sum + o.total, 0);
    series.push({ date, value });
  }
  return series;
}

// ── Reviews ────────────────────────────────────────────────────────────

const REVIEWERS = ["Amina K.", "Omar S.", "Zeynab M.", "Farah A.", "Hibo D.", "Ahmed Y."];
const REVIEW_TEXTS = [
  "Exactly as described — quality is better than I expected for the price. Delivery was fast too.",
  "Second time ordering from this store. Consistent quality and the packaging was very careful.",
  "Really happy with this purchase. Photos don't do it justice, it looks even better in person.",
  "Good value for money. Took a couple of days to arrive but well worth the wait.",
  "Bought this as a gift and they loved it. Will definitely order again from Banaadir Mall.",
];

/** Deterministic sample reviews for a product (demo only). */
export async function getReviews(product: Product): Promise<Review[]> {
  const seed = product.slug.length;
  return Array.from({ length: 3 }, (_, i) => ({
    author: REVIEWERS[(seed + i * 2) % REVIEWERS.length],
    rating: i === 2 ? Math.max(3, Math.round(product.rating) - 1) : 5,
    date: `2026-07-${String(10 + ((seed + i * 5) % 20)).padStart(2, "0")}`,
    text: REVIEW_TEXTS[(seed + i) % REVIEW_TEXTS.length],
  }));
}
