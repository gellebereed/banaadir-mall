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
  fetchRecoSettingsFromSupabase,
  fetchReviewsFromSupabase,
  fetchStoriesFromSupabase,
  fetchStoresFromSupabase,
} from "./supabase/db-api";
import { DEFAULT_RECO } from "./db";
import { resolvePeriod, summariseSales } from "./analytics";
import { matchesCode, sellableUnits, type SellableUnit } from "./odoo/mapping";
import { normalizeBarcode, normalizeReference } from "./barcode";
import {
  buildCategoryTree,
  categoryPath,
  categoryWithDescendants,
  flattenCategoryTree,
  visibleCategories,
} from "./category-tree";
import type {
  Category,
  CategoryNode,
  Employee,
  FlashDeal,
  FlashRequest,
  MarketingSettings,
  Order,
  Product,
  ProductReview,
  ProductStory,
  Promotion,
  RecoSettings,
  Review,
  Store,
} from "./types";

// ── Categories ─────────────────────────────────────────────────────────

export async function getCategories(includeHidden = false): Promise<Category[]> {
  const supabaseCategories = await fetchCategoriesFromSupabase();
  const list = (supabaseCategories && supabaseCategories.length > 0) ? supabaseCategories : seedCategories;
  // visibleCategories() drops hidden categories AND everything beneath
  // them — see lib/category-tree.ts for why that matters.
  return includeHidden ? list : visibleCategories(list);
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  return (await getCategories(true)).find((c) => c.slug === slug);
}

// ── Category tree (Odoo product.category) ──────────────────────────────
// The walking itself lives in lib/category-tree.ts so client components can
// share it; these are the data-fetching wrappers.

/** The category hierarchy, storefront view (hidden branches excluded). */
export async function getCategoryTree(includeHidden = false): Promise<CategoryNode[]> {
  return buildCategoryTree(await getCategories(includeHidden));
}

/**
 * Every category flattened back into a list but in TREE order — parents
 * immediately followed by their children. This is what dropdowns and admin
 * tables render, with `depth` driving the indentation.
 */
export async function getCategoriesFlat(includeHidden = false): Promise<CategoryNode[]> {
  return flattenCategoryTree(await getCategoryTree(includeHidden));
}

/** A category and all its ancestors, root first — the breadcrumb trail. */
export async function getCategoryPath(slug: string): Promise<Category[]> {
  return categoryPath(await getCategories(true), slug);
}

/** A category's slug plus every slug beneath it. */
export async function getCategoryWithDescendants(slug: string): Promise<string[]> {
  return categoryWithDescendants(await getCategories(true), slug);
}

// ── Stores ─────────────────────────────────────────────────────────────

/**
 * All stores with runtime changes applied: profile edits from the seller's
 * Settings page and status changes from the admin (approve/reject/suspend).
 */
export async function getAllStores(): Promise<Store[]> {
  const supabaseStores = await fetchStoresFromSupabase();
  // Not `length > 0`: once Supabase answers, it is the truth — including
  // when the answer is "no stores". Falling back on empty meant a
  // marketplace that had deliberately cleared its demo data watched four
  // demo brands reappear on the storefront, with no way to remove them.
  // This mirrors the same decision already made for orders below.
  if (supabaseStores) return supabaseStores;

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
  // See getAllStores: an empty Supabase means an empty catalogue, not a cue
  // to serve the bundled demo products. A shop clearing its demo data has
  // to be able to reach zero.
  if (supabaseProducts) return supabaseProducts;

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
 * Every promotion, from whichever store actually holds them.
 *
 * ⚠ This must be the ONLY way promotions are read. Discounts used to be
 * computed from the local JSON store while the dashboards saved to
 * Supabase, so a seller's promotion appeared in the promotions list and
 * then had no effect on any price — the product kept its original price
 * and its "New" badge.
 */
export async function getPromotions(): Promise<Promotion[]> {
  const supabasePromotions = await fetchPromotionsFromSupabase();
  if (supabasePromotions) return supabasePromotions;
  return (await getDB()).promotions;
}

/**
 * Is this promotion running right now? `active` is the seller's on/off
 * switch; the optional window lets them schedule one in advance or have it
 * expire on its own.
 */
export function isPromotionLive(promo: Promotion, now = new Date()): boolean {
  if (!promo.active) return false;
  if (promo.startsAt && new Date(promo.startsAt) > now) return false;
  if (promo.endsAt && new Date(promo.endsAt) < now) return false;
  return true;
}

/**
 * Highest discount percentage applying to a product right now. A promotion
 * covers the whole store when it has no productIds, or only the listed
 * products when it does. The site-wide campaign always applies.
 */
function discountPctFor(
  product: Product,
  promotions: Promotion[],
  campaignPct: number,
): number {
  const promo = promotions
    .filter(
      (p) =>
        isPromotionLive(p) &&
        p.store === product.store &&
        (!p.productIds?.length || p.productIds.includes(product.id)),
    )
    .reduce((max, p) => Math.max(max, p.pct), 0);
  return Math.max(promo, campaignPct);
}

/** The site-wide campaign percentage, or 0 when it isn't running. */
async function campaignPct(): Promise<number> {
  const marketing = await getMarketingSettings();
  return marketing.campaign.active ? marketing.campaign.pct : 0;
}

/** Discount percentage per product id, for dashboard tables and notices. */
export async function getDiscountMap(storeSlug?: string): Promise<Record<string, number>> {
  const [promotions, campaign, products] = await Promise.all([
    getPromotions(),
    campaignPct(),
    getBaseProducts(),
  ]);
  const map: Record<string, number> = {};
  for (const p of products) {
    if (storeSlug && p.store !== storeSlug) continue;
    const pct = discountPctFor(p, promotions, campaign);
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
  const [base, promotions, campaign] = await Promise.all([
    getBaseProducts(),
    getPromotions(),
    campaignPct(),
  ]);

  return base.map((p) => {
    const pct = discountPctFor(p, promotions, campaign);
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

/**
 * Products filed under a category OR any category beneath it. Browsing a
 * parent has to include its children's products — a tree where the parent
 * page is empty is worse than no tree at all.
 */
export async function getProductsByCategory(slug: string): Promise<Product[]> {
  const [products, slugs] = await Promise.all([
    getProducts(),
    getCategoryWithDescendants(slug),
  ]);
  const inBranch = new Set(slugs);
  return products.filter((p) => inBranch.has(p.category));
}

/** Storefront listing for a store page. */
export async function getProductsByStore(slug: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.store === slug);
}

/** Dashboard listing for a store — includes hidden products. */
export async function getAllProductsByStore(slug: string): Promise<Product[]> {
  return (await getAllProducts()).filter((p) => p.store === slug);
}

/**
 * Storefront search.
 *
 * A barcode or internal reference is matched FIRST and returned on its own.
 * Scanning a code into the search box is an exact-identity lookup — burying
 * that one product among fuzzy name matches is the difference between the
 * search box being usable at a counter and not.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const products = await getProducts();

  const exact = products.filter((p) => matchesCode(p, query));
  if (exact.length > 0) return exact;

  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.includes(q) ||
      p.subcategory?.toLowerCase().includes(q) ||
      p.internalReference?.toLowerCase().includes(q),
  );
}

// ── Barcode / internal-reference lookup (Odoo product.product) ─────────

/** A scan result: the product, plus which of its units the code belongs to. */
export interface CodeMatch {
  product: Product;
  unit: SellableUnit;
}

/**
 * Resolve a scanned barcode or typed internal reference to a single
 * sellable unit. Searches the catalogue as the SELLER maintains it
 * (getBaseProducts) so hidden and out-of-stock goods are still findable —
 * a warehouse still has to be able to scan a box it isn't selling today.
 */
export async function findByCode(code: string): Promise<CodeMatch | undefined> {
  if (!code?.trim()) return undefined;
  for (const product of await getBaseProducts()) {
    const unit = matchesCode(product, code);
    if (unit) return { product, unit };
  }
  return undefined;
}

/**
 * Products already using a barcode or internal reference, excluding one id.
 * This is the catalogue-wide uniqueness check the save actions run before
 * writing — it produces a message naming the conflicting product, which a
 * bare database constraint error cannot.
 */
export async function findCodeConflicts(
  codes: { barcodes: string[]; references: string[] },
  exceptProductId?: string,
): Promise<{ code: string; product: Product; unitLabel?: string }[]> {
  const barcodes = new Set(codes.barcodes.map(normalizeBarcode).filter(Boolean));
  const references = new Set(codes.references.map(normalizeReference).filter(Boolean));
  if (barcodes.size === 0 && references.size === 0) return [];

  const conflicts: { code: string; product: Product; unitLabel?: string }[] = [];
  for (const product of await getBaseProducts()) {
    if (product.id === exceptProductId) continue;
    for (const unit of sellableUnits(product)) {
      // Stored codes are normalised too — rows written by an Odoo sync or a
      // CSV import may still carry the supplier's spacing, and a conflict
      // that isn't detected is a duplicate barcode let into the catalogue.
      if (unit.barcode && barcodes.has(normalizeBarcode(unit.barcode))) {
        conflicts.push({ code: unit.barcode, product, unitLabel: unit.label });
      }
      if (unit.reference && references.has(normalizeReference(unit.reference))) {
        conflicts.push({ code: unit.reference, product, unitLabel: unit.label });
      }
    }
  }
  return conflicts;
}

/** Every sellable unit in a store — the label-printing / stock-count list. */
export async function getSellableUnitsByStore(slug: string): Promise<SellableUnit[]> {
  return (await getBaseProductsByStore(slug)).flatMap(sellableUnits);
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
  return (await getPromotions()).filter((p) => p.store === storeSlug);
}

/**
 * Every employee, wherever they were stored.
 *
 * Employees are written to Supabase when it is configured and to the JSON
 * overlay when it is not — but a store can end up with rows in BOTH, when
 * a Supabase insert failed and the code fell back to the file. Reading only
 * one of the two is how an invitation gets accepted, saved, and then
 * vanishes from the page that created it. Both are read, Supabase wins on
 * a shared id, and nothing added through either path disappears.
 */
export async function getAllEmployees(): Promise<Employee[]> {
  const [remote, local] = await Promise.all([
    fetchEmployeesFromSupabase(),
    getDB().then((db) => db.employees),
  ]);

  if (!remote) return local;

  const seen = new Set(remote.map((e) => e.email.toLowerCase()));
  return [...remote, ...local.filter((e) => !seen.has(e.email.toLowerCase()))];
}

/** Employees of a store, or of the platform when storeSlug === "platform". */
export async function getEmployees(storeSlug: string): Promise<Employee[]> {
  return (await getAllEmployees()).filter((e) => e.store === storeSlug);
}

/** The employee this email signs in as, from either store. */
export async function getEmployeeByEmail(email: string): Promise<Employee | null> {
  const clean = email.trim().toLowerCase();
  const all = await getAllEmployees();
  return all.find((e) => e.email.trim().toLowerCase() === clean) ?? null;
}

/** The employee an invite link belongs to. */
export async function getEmployeeByInviteToken(token: string): Promise<Employee | null> {
  const clean = token.trim();
  if (!clean) return null;
  const all = await getAllEmployees();
  return all.find((e) => e.inviteToken && e.inviteToken === clean) ?? null;
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

/**
 * Give old order lines back their product name and photo.
 *
 * Checkout records the name, price and image on every line (see
 * submitOrderAction), but orders placed before that carry `{ productId,
 * qty }` alone — and every screen that renders them then shows
 * "1 × dinner-set-for-12-people-msahht5c".
 *
 * Only the DISPLAY fields are filled in. The price is deliberately left
 * missing: a product's price today is not what the customer paid, and
 * quietly substituting it would turn an estimate into something that looks
 * like a record. The analytics layer makes that same distinction and says
 * so on screen (see `usesEstimatedPrices`).
 *
 * The catalogue is only loaded when something actually needs it, so orders
 * placed since the fix cost nothing here.
 */
async function withProductNames(orders: Order[]): Promise<Order[]> {
  const needsNames = orders.some((order) => order.items?.some((item) => !item.name));
  if (!needsNames) return orders;

  const catalogue = new Map((await getBaseProducts()).map((p) => [p.id, p]));

  return orders.map((order) => ({
    ...order,
    items: (order.items ?? []).map((item) => {
      if (item.name) return item;
      const product = catalogue.get(item.productId);
      if (!product) return item;
      return {
        ...item,
        name: product.name,
        image: item.image ?? product.images?.[0],
        store: item.store ?? product.store,
      };
    }),
  }));
}

export async function getOrders(): Promise<Order[]> {
  const supabaseOrders = await fetchOrdersFromSupabase();
  // Not `length > 0`: once Supabase answers, it is the truth — including
  // when the answer is "no orders". Falling back on empty meant a real shop
  // with no sales yet saw a dashboard full of generated demo orders, and a
  // cleared table silently refilled itself.
  if (supabaseOrders) {
    return withProductNames(supabaseOrders);
  }
  const db = await getDB();
  return seedOrders.map((o) => ({
    ...o,
    ...(db.orderStatus[o.id] ? { status: db.orderStatus[o.id] } : {}),
    // Courier and timeline edits made in the dashboard, for the local-dev
    // path. Without this the seller saves a driver and the tracking page
    // keeps showing no contact.
    ...(db.orderDelivery?.[o.id] ?? {}),
    // Demo orders are pre-existing, so they count as already seen unless
    // the overlay says otherwise — a badge of 40 on first login is the
    // fastest way to teach someone to ignore badges forever.
    seenAt: db.ordersSeen?.[o.id] ?? o.seenAt ?? new Date(0).toISOString(),
  }));
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

/**
 * Marketplace totals, ALL TIME.
 *
 * Kept for the pages that want a lifetime figure rather than a window
 * (the store leaderboard, a seller's own account page). The dashboards use
 * summariseSales() directly so they can scope to a period and show a real
 * period-over-period change — see lib/analytics.ts.
 */
export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const [allOrders, allStores, allProducts] = await Promise.all([
    getOrders(),
    getAllStores(),
    getAllProducts(),
  ]);

  const period = resolvePeriod("all");
  const summary = summariseSales({
    orders: allOrders,
    products: allProducts,
    stores: allStores,
    period,
  });

  return {
    revenue: summary.revenue,
    // Cancelled orders are excluded from revenue, so counting them here
    // made the average order value on this page impossible to reproduce.
    orderCount: summary.orders,
    productCount: allProducts.length,
    activeStores: allStores.filter((s) => s.status === "active").length,
    pendingStores: allStores.filter((s) => s.status === "pending").length,
    customers: summary.customers,
    revenueSeries: summary.series.map((point) => ({ date: point.date, value: point.value })),
    topStores: summary.topStores
      .map((ranked) => ({
        store: allStores.find((s) => s.slug === ranked.id)!,
        revenue: ranked.revenue,
        orderCount: ranked.orders,
      }))
      .filter((entry) => entry.store)
      .slice(0, 5),
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

/** One store's totals, ALL TIME. See the note on getMarketplaceStats. */
export async function getVendorStats(storeSlug: string): Promise<VendorStats> {
  const [storeOrders, storeProducts, store] = await Promise.all([
    getOrdersByStore(storeSlug),
    getAllProductsByStore(storeSlug),
    getStore(storeSlug),
  ]);

  const period = resolvePeriod("all");
  const summary = summariseSales({ orders: storeOrders, products: storeProducts, period });
  const byId = new Map(storeProducts.map((product) => [product.id, product]));

  return {
    revenue: summary.revenue,
    orderCount: summary.orders,
    productCount: storeProducts.length,
    unitsSold: summary.units,
    rating: store?.rating ?? 0,
    aov: summary.aov,
    pendingOrders: storeOrders.filter((o) => o.status === "pending" || o.status === "processing")
      .length,
    statusBreakdown: summary.statusBreakdown.map(({ status, count }) => ({ status, count })),
    // Per-LINE revenue. This used to add the whole order total to every
    // product on it, which multiplied the numbers and mis-ranked the list.
    topProducts: summary.topProducts
      .map((ranked) => ({
        product: byId.get(ranked.id)!,
        revenue: ranked.revenue,
        units: ranked.units,
      }))
      .filter((entry) => entry.product)
      .slice(0, 5),
    revenueSeries: summary.series.map((point) => ({ date: point.date, value: point.value })),
  };
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

/** Every review left by a real customer. */
export async function getCustomerReviews(): Promise<ProductReview[]> {
  const supabaseReviews = await fetchReviewsFromSupabase();
  if (supabaseReviews) return supabaseReviews;
  return (await getDB()).reviews ?? [];
}

/**
 * Reviews for a product.
 *
 * Real customer reviews (collected by the rating prompt, see
 * lib/reco/prompts.ts) come first and are never mixed in among the
 * generated demo ones — once a product has a real review, the samples stop
 * entirely. Padding genuine feedback with invented feedback is the fastest
 * way to make every review on the site worthless.
 */
export async function getReviews(product: Product): Promise<Review[]> {
  const real = (await getCustomerReviews()).filter((r) => r.productId === product.id);
  if (real.length > 0) {
    return real
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => ({
        author: r.verified ? `${r.author} ✓` : r.author,
        rating: r.rating,
        date: r.date,
        text: r.text || "",
      }));
  }

  const seed = product.slug.length;
  return Array.from({ length: 3 }, (_, i) => ({
    author: REVIEWERS[(seed + i * 2) % REVIEWERS.length],
    rating: i === 2 ? Math.max(3, Math.round(product.rating) - 1) : 5,
    date: `2026-07-${String(10 + ((seed + i * 5) % 20)).padStart(2, "0")}`,
    text: REVIEW_TEXTS[(seed + i) % REVIEW_TEXTS.length],
  }));
}

// ── Category artwork ───────────────────────────────────────────────────

/**
 * A photo for every department, keyed by slug.
 *
 * The admin can set one per category, but almost none will be set on day
 * one — and a department row of emoji on a coloured square is the single
 * thing that makes a storefront look like a template rather than a shop.
 * So where no cover has been chosen, the best photo already in that
 * department stands in.
 *
 * "Best" is deliberately not "first": it prefers the product with the most
 * sales, because that is the one whose photo a seller has already had a
 * reason to get right. Products beneath a department count too, so a parent
 * with no direct listings still gets artwork from its children.
 */
export async function categoryCovers(
  categories: Category[],
  products: Product[],
): Promise<Record<string, string>> {
  // Map every category to its root so a child's products dress the parent.
  const parentOf = new Map(categories.map((c) => [c.slug, c.parentSlug]));
  const rootOf = (slug: string): string => {
    let current = slug;
    for (let hops = 0; hops < 10; hops++) {
      const parent = parentOf.get(current);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const best = new Map<string, { image: string; sold: number }>();

  for (const product of products) {
    if (product.hidden) continue;
    const image = product.images?.[0] ?? product.variants?.find((v) => v.images?.[0])?.images?.[0];
    if (!image) continue;

    // Credit both the exact category and its root.
    for (const slug of new Set([product.category, rootOf(product.category)])) {
      const current = best.get(slug);
      if (!current || product.sold > current.sold) {
        best.set(slug, { image, sold: product.sold });
      }
    }
  }

  const covers: Record<string, string> = {};
  for (const category of categories) {
    const chosen = category.image || best.get(category.slug)?.image;
    if (chosen) covers[category.slug] = chosen;
  }
  return covers;
}

// ── Discovery: recommender settings & product stories ──────────────────

/** Admin control over the recommender. Falls back to the shipped defaults. */
export async function getRecoSettings(): Promise<RecoSettings> {
  const fromSupabase = await fetchRecoSettingsFromSupabase();
  if (fromSupabase) return fromSupabase;
  return (await getDB()).reco ?? DEFAULT_RECO;
}

/** Every story, including unpublished drafts. Dashboard view. */
export async function getAllStories(): Promise<ProductStory[]> {
  const fromSupabase = await fetchStoriesFromSupabase();
  if (fromSupabase) return fromSupabase;
  return (await getDB()).stories ?? [];
}

/** Storefront view: published stories only. */
export async function getStories(): Promise<ProductStory[]> {
  return (await getAllStories()).filter((s) => s.published);
}

export async function getStory(id: string): Promise<ProductStory | undefined> {
  return (await getAllStories()).find((s) => s.id === id);
}

/**
 * Stories that apply to a product — attached directly, or through its
 * category so one "how to care for cast iron" piece can serve a whole
 * range without being re-attached to every new listing.
 *
 * Direct attachments rank first: a story written about THIS product beats
 * one written about its department.
 */
export async function getStoriesForProduct(product: Product): Promise<ProductStory[]> {
  const [stories, ancestors] = await Promise.all([
    getStories(),
    getCategoryPath(product.category),
  ]);
  const branch = new Set(ancestors.map((c) => c.slug));

  return stories
    .map((story) => {
      if (story.productIds.includes(product.id)) return { story, rank: 0 };
      if (story.categorySlugs?.some((slug) => branch.has(slug))) return { story, rank: 1 };
      return null;
    })
    .filter((entry): entry is { story: ProductStory; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.story);
}
