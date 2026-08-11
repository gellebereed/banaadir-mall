/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ANALYTICS — the numbers behind both dashboards.
 * ─────────────────────────────────────────────────────────────────────────
 * One engine, used by the seller dashboard and the admin dashboard alike,
 * so the same question never gets two different answers depending on which
 * page you ask it from.
 *
 * ── What was wrong before, and why it matters ────────────────────────────
 *
 * 1. TOP PRODUCTS COUNTED THE WHOLE ORDER, ONCE PER LINE. The old loop did
 *    `entry.revenue += o.total` for every item on the order, so a two-item
 *    order credited BOTH products with the full basket. A best-seller list
 *    built that way ranks by "appeared in expensive orders", not by sales,
 *    and the totals came out at several times real revenue.
 *
 * 2. "REVENUE (30d)" WAS ALL-TIME. Nothing filtered by date; the label was
 *    the only thing making it thirty days.
 *
 * 3. THE TREND LINES WERE INVENTED. "+18% vs last month" was hard-coded
 *    into the page. Every deltas here is computed against the immediately
 *    preceding window of the same length, or it is not shown at all.
 *
 * 4. THE CHART WAS PINNED TO A DATE IN THE PAST — fourteen days ending
 *    2026-07-31, a constant left over from the demo seed. Any order placed
 *    after that simply did not appear, which is exactly what a shop sees
 *    when it makes its first real sale and the graph stays flat.
 *
 * ── Revenue: two numbers, deliberately ───────────────────────────────────
 * Headline revenue sums `order.total` — what the customer was actually
 * charged, including delivery. Per-product revenue sums the LINE, because
 * an order total cannot be attributed to one product. They will not always
 * reconcile to the penny, and that is correct: the difference is delivery
 * and order-level discounts, which belong to no single product.
 * ─────────────────────────────────────────────────────────────────────────
 */

// Explicit .ts extension so this module also runs outside the bundler,
// which is how the dashboard numbers get checked against real data.
import { totalStock } from "./product-utils.ts";
import type { Order, OrderItem, Product, Store } from "./types";

// ── Periods ────────────────────────────────────────────────────────────

export type RangeKey = "7d" | "30d" | "90d" | "12m" | "all";

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
];

export interface Period {
  key: RangeKey;
  label: string;
  /** Inclusive ISO date, e.g. "2026-07-06". */
  start: string;
  /** Inclusive ISO date — today. */
  end: string;
  days: number;
  /** The window of equal length immediately before `start`. */
  previousStart: string;
  previousEnd: string;
  /** True for "all time", where a previous window is meaningless. */
  unbounded: boolean;
}

const DAY = 86400000;

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  return isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY));
}

export function parseRange(value: string | undefined): RangeKey {
  return RANGES.some((range) => range.key === value) ? (value as RangeKey) : "30d";
}

/**
 * Resolve a range key into concrete dates.
 *
 * `today` is injectable so this can be tested, but it defaults to the real
 * clock — never to a constant, which is the mistake that froze the old
 * chart in July.
 */
export function resolvePeriod(key: RangeKey, today = new Date()): Period {
  const end = isoDate(today);
  const range = RANGES.find((r) => r.key === key) ?? RANGES[1];

  if (range.days === null) {
    return {
      key: "all",
      label: range.label,
      // Far enough back to include anything, without pretending to a date.
      start: "0000-01-01",
      end,
      days: 0,
      previousStart: "0000-01-01",
      previousEnd: "0000-01-01",
      unbounded: true,
    };
  }

  // Inclusive of both ends: a "7 days" window is today plus the six before.
  const start = shiftDays(end, -(range.days - 1));
  return {
    key: range.key,
    label: range.label,
    start,
    end,
    days: range.days,
    previousStart: shiftDays(start, -range.days),
    previousEnd: shiftDays(start, -1),
    unbounded: false,
  };
}

/** ISO date strings compare correctly with `<=`, which is why they're used. */
export function withinPeriod(date: string, start: string, end: string): boolean {
  const day = (date ?? "").slice(0, 10);
  return day >= start && day <= end;
}

export function inPeriod(orders: Order[], start: string, end: string): Order[] {
  return orders.filter((order) => withinPeriod(order.date, start, end));
}

// ── Deltas ─────────────────────────────────────────────────────────────

export interface Delta {
  /** Percentage change, or null when there is no basis for one. */
  pct: number | null;
  direction: "up" | "down" | "flat";
  previous: number;
  /** Why a percentage is absent, phrased for the tile. */
  note?: string;
}

/**
 * Change against the previous window.
 *
 * Growth from zero is left as `null` rather than reported as +100% or
 * ∞ — the first sale after a quiet week is not a percentage story, and
 * showing one there is how a dashboard starts lying quietly.
 */
export function computeDelta(current: number, previous: number, unbounded = false): Delta {
  if (unbounded) return { pct: null, direction: "flat", previous, note: "all time" };
  if (previous === 0) {
    return {
      pct: null,
      direction: current > 0 ? "up" : "flat",
      previous,
      note: current > 0 ? "first in this period" : "none before",
    };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    pct,
    direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat",
    previous,
  };
}

// ── Line-level revenue ─────────────────────────────────────────────────

/**
 * What one order line was worth.
 *
 * `item.price` is the price captured at checkout and is authoritative when
 * present. Orders written before that was captured carry only a product id
 * and a quantity, so the current catalogue price stands in — an estimate,
 * and marked as one wherever it is shown.
 */
export function lineRevenue(item: OrderItem, catalogue: Map<string, Product>): number {
  const unit = item.price ?? catalogue.get(item.productId)?.price ?? 0;
  return unit * (item.qty || 0);
}

/** True when any line had to fall back to a catalogue price. */
export function usesEstimatedPrices(orders: Order[]): boolean {
  return orders.some((order) => order.items.some((item) => item.price === undefined));
}

// ── Series ─────────────────────────────────────────────────────────────

export interface SeriesPoint {
  /** ISO date of the bucket start. */
  date: string;
  /** Label for the axis, e.g. "12 Jul" or "Jul". */
  label: string;
  value: number;
  orders: number;
}

type Bucket = "day" | "week" | "month";

/** Long ranges as daily bars are unreadable, so the bucket widens with them. */
function bucketFor(days: number): Bucket {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(iso: string, bucket: Bucket): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (bucket === "month") return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * The buckets a range is drawn in, and how to put a date into one.
 *
 * Extracted so revenue over time and CUSTOMERS over time are bucketed by
 * one rule rather than two. Two charts on the same screen, drawn from the
 * same range, whose bars do not line up is the kind of detail that makes
 * people stop believing a dashboard — and it is exactly what happens when
 * a second chart reimplements "widen the bucket as the range grows".
 */
export interface Buckets {
  /** First day of the window — the earliest order date when unbounded. */
  start: string;
  size: Bucket;
  /** Every bucket in the window, in order, including empty ones. */
  keys: { key: string; label: string }[];
  /** The bucket an ISO date falls in. */
  keyOf: (iso: string) => string;
}

export function bucketsFor(orders: Order[], period: Period, today = new Date()): Buckets {
  const start = period.unbounded ? earliestDate(orders, today) : period.start;
  const end = period.end;

  const spanDays = Math.max(
    1,
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1,
  );
  const size = bucketFor(period.unbounded ? spanDays : period.days);

  const keyOf = (iso: string) => {
    const day = (iso ?? "").slice(0, 10);
    if (size === "day") return day;
    if (size === "month") return `${day.slice(0, 7)}-01`;
    // Week buckets are anchored to the window start so the last bar is
    // always the current partial week rather than an arbitrary Monday.
    const offset = Math.floor(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY,
    );
    return shiftDays(start, Math.floor(offset / 7) * 7);
  };

  const keys: { key: string; label: string }[] = [];
  let cursor = size === "month" ? `${start.slice(0, 7)}-01` : start;
  let guard = 0;

  while (cursor <= end && guard++ < 400) {
    keys.push({ key: cursor, label: labelFor(cursor, size) });
    if (size === "day") cursor = shiftDays(cursor, 1);
    else if (size === "week") cursor = shiftDays(cursor, 7);
    else {
      const date = new Date(`${cursor}T00:00:00Z`);
      cursor = isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
    }
  }

  return { start, size, keys, keyOf };
}

/**
 * Revenue over time, bucketed to suit the range.
 *
 * Every bucket in the window is emitted, including empty ones — a gap in
 * trading is information, and a chart that silently omits quiet days
 * compresses time and makes a slump look like steady sales.
 */
export function buildSeries(orders: Order[], period: Period, today = new Date()): SeriesPoint[] {
  const buckets = bucketsFor(orders, period, today);

  const totals = new Map<string, { value: number; orders: number }>();
  for (const order of orders) {
    const key = buckets.keyOf(order.date);
    const entry = totals.get(key) ?? { value: 0, orders: 0 };
    entry.value += order.total;
    entry.orders += 1;
    totals.set(key, entry);
  }

  return buckets.keys.map(({ key, label }) => ({
    date: key,
    label,
    ...(totals.get(key) ?? { value: 0, orders: 0 }),
  }));
}

function earliestDate(orders: Order[], today: Date): string {
  const dates = orders.map((order) => order.date.slice(0, 10)).filter(Boolean).sort();
  return dates[0] ?? isoDate(today);
}

// ── Sales summary ──────────────────────────────────────────────────────

export interface Ranked {
  id: string;
  label: string;
  sublabel?: string;
  revenue: number;
  units: number;
  orders: number;
}

export interface SalesSummary {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  customers: number;
  cancelled: number;
  cancelledValue: number;
  revenueDelta: Delta;
  ordersDelta: Delta;
  unitsDelta: Delta;
  aovDelta: Delta;
  series: SeriesPoint[];
  statusBreakdown: { status: Order["status"]; count: number; value: number }[];
  topProducts: Ranked[];
  topCategories: Ranked[];
  topCities: Ranked[];
  topStores: Ranked[];
  /** True when some line revenue was estimated from the catalogue price. */
  estimated: boolean;
}

const STATUSES: Order["status"][] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export interface SalesInput {
  orders: Order[];
  products: Product[];
  stores?: Store[];
  period: Period;
  today?: Date;
}

export function summariseSales({
  orders,
  products,
  stores = [],
  period,
  today = new Date(),
}: SalesInput): SalesSummary {
  const catalogue = new Map(products.map((product) => [product.id, product]));
  const storesBySlug = new Map(stores.map((store) => [store.slug, store]));

  const current = period.unbounded ? orders : inPeriod(orders, period.start, period.end);
  const previous = period.unbounded
    ? []
    : inPeriod(orders, period.previousStart, period.previousEnd);

  // A cancelled order is not revenue, but it IS worth counting — a rising
  // cancellation rate is the earliest sign something is wrong upstream.
  const sold = current.filter((order) => order.status !== "cancelled");
  const soldBefore = previous.filter((order) => order.status !== "cancelled");
  const cancelled = current.filter((order) => order.status === "cancelled");

  const revenue = sum(sold, (order) => order.total);
  const previousRevenue = sum(soldBefore, (order) => order.total);
  const units = sum(sold, (order) => sum(order.items, (item) => item.qty || 0));
  const previousUnits = sum(soldBefore, (order) => sum(order.items, (item) => item.qty || 0));
  const aov = sold.length > 0 ? revenue / sold.length : 0;
  const previousAov = soldBefore.length > 0 ? previousRevenue / soldBefore.length : 0;

  // ── Attribution, the part that used to be wrong ──────────────────────
  const byProduct = new Map<string, Ranked>();
  const byCategory = new Map<string, Ranked>();

  for (const order of sold) {
    for (const item of order.items) {
      const product = catalogue.get(item.productId);
      const value = lineRevenue(item, catalogue);
      const qty = item.qty || 0;

      const productKey = item.productId;
      const existing = byProduct.get(productKey);
      if (existing) {
        existing.revenue += value;
        existing.units += qty;
        existing.orders += 1;
      } else {
        byProduct.set(productKey, {
          id: productKey,
          label: product?.name ?? item.name ?? "Deleted product",
          sublabel: product?.internalReference ?? product?.category,
          revenue: value,
          units: qty,
          orders: 1,
        });
      }

      const categoryKey = product?.category ?? "uncategorised";
      const category = byCategory.get(categoryKey);
      if (category) {
        category.revenue += value;
        category.units += qty;
        category.orders += 1;
      } else {
        byCategory.set(categoryKey, {
          id: categoryKey,
          label: categoryKey,
          revenue: value,
          units: qty,
          orders: 1,
        });
      }
    }
  }

  const byCity = new Map<string, Ranked>();
  const byStore = new Map<string, Ranked>();
  for (const order of sold) {
    const cityKey = order.city || "Unknown";
    const city = byCity.get(cityKey);
    if (city) {
      city.revenue += order.total;
      city.orders += 1;
    } else {
      byCity.set(cityKey, { id: cityKey, label: cityKey, revenue: order.total, units: 0, orders: 1 });
    }

    const storeKey = order.store;
    const store = byStore.get(storeKey);
    if (store) {
      store.revenue += order.total;
      store.orders += 1;
      store.units += sum(order.items, (item) => item.qty || 0);
    } else {
      byStore.set(storeKey, {
        id: storeKey,
        label: storesBySlug.get(storeKey)?.name ?? storeKey,
        sublabel: storesBySlug.get(storeKey)?.city,
        revenue: order.total,
        units: sum(order.items, (item) => item.qty || 0),
        orders: 1,
      });
    }
  }

  // Identify a customer by the strongest thing the order carries. Counting
  // by name alone merges every "Ahmed" into one buyer.
  const customerKeys = new Set(
    sold.map((order) => (order.email || order.phone || order.customer || "").trim().toLowerCase()),
  );
  customerKeys.delete("");

  return {
    revenue,
    orders: sold.length,
    units,
    aov,
    customers: customerKeys.size,
    cancelled: cancelled.length,
    cancelledValue: sum(cancelled, (order) => order.total),
    revenueDelta: computeDelta(revenue, previousRevenue, period.unbounded),
    ordersDelta: computeDelta(sold.length, soldBefore.length, period.unbounded),
    unitsDelta: computeDelta(units, previousUnits, period.unbounded),
    aovDelta: computeDelta(aov, previousAov, period.unbounded),
    series: buildSeries(sold, period, today),
    statusBreakdown: STATUSES.map((status) => {
      const matching = current.filter((order) => order.status === status);
      return { status, count: matching.length, value: sum(matching, (o) => o.total) };
    }),
    topProducts: rank(byProduct),
    topCategories: rank(byCategory),
    topCities: rank(byCity),
    topStores: rank(byStore),
    estimated: usesEstimatedPrices(sold),
  };
}

function rank(map: Map<string, Ranked>): Ranked[] {
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units);
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + (value(item) || 0), 0);
}

// ── Catalogue health ───────────────────────────────────────────────────

/** At or below this many units, a product is worth restocking. */
export const LOW_STOCK_THRESHOLD = 5;

export interface CatalogueHealth {
  total: number;
  live: number;
  hidden: number;
  outOfStock: number;
  lowStock: number;
  missingPhotos: number;
  missingBarcode: number;
  missingCost: number;
  neverSold: number;
  stockUnits: number;
  /** Only counts products that HAVE a cost, so it is never half-guessed. */
  stockAtCost: number;
  stockAtRetail: number;
  /**
   * Retail value of ONLY the products whose cost is known.
   *
   * Margin has to be computed against this, not against total retail:
   * subtracting a cost that covers 104 products from a retail figure that
   * covers 121 reports the missing 17 products' entire price as profit.
   */
  retailWhereCostKnown: number;
  costKnownFor: number;
  /** Margin on stock we can actually price, or null when no cost is known. */
  potentialMargin: number | null;
}

export function summariseCatalogue(products: Product[], soldProductIds = new Set<string>()): CatalogueHealth {
  let stockUnits = 0;
  let stockAtCost = 0;
  let stockAtRetail = 0;
  let retailWhereCostKnown = 0;
  let costKnownFor = 0;

  for (const product of products) {
    const stock = totalStock(product);
    stockUnits += stock;
    stockAtRetail += stock * product.price;
    if (typeof product.cost === "number" && product.cost > 0) {
      stockAtCost += stock * product.cost;
      retailWhereCostKnown += stock * product.price;
      costKnownFor += 1;
    }
  }

  return {
    total: products.length,
    live: products.filter((product) => !product.hidden).length,
    hidden: products.filter((product) => product.hidden).length,
    outOfStock: products.filter((product) => totalStock(product) === 0).length,
    lowStock: products.filter((product) => {
      const stock = totalStock(product);
      return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
    }).length,
    missingPhotos: products.filter((product) => !product.images?.length).length,
    missingBarcode: products.filter(
      (product) => !product.barcode && !product.variants?.some((variant) => variant.barcode),
    ).length,
    missingCost: products.filter((product) => typeof product.cost !== "number").length,
    neverSold: products.filter((product) => !soldProductIds.has(product.id)).length,
    stockUnits,
    stockAtCost: round2(stockAtCost),
    stockAtRetail: round2(stockAtRetail),
    retailWhereCostKnown: round2(retailWhereCostKnown),
    costKnownFor,
    potentialMargin: costKnownFor > 0 ? round2(retailWhereCostKnown - stockAtCost) : null,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Products at or under the low-stock line, worst first. */
export function lowStockProducts(products: Product[], limit = 8): { product: Product; stock: number }[] {
  return products
    .filter((product) => !product.hidden)
    .map((product) => ({ product, stock: totalStock(product) }))
    .filter((entry) => entry.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, limit);
}

/** Every product id that has ever appeared on a non-cancelled order. */
export function soldProductIds(orders: Order[]): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const item of order.items) ids.add(item.productId);
  }
  return ids;
}
