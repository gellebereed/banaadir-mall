/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CUSTOMER ANALYTICS — who is buying, and whether they come back.
 * ─────────────────────────────────────────────────────────────────────────
 * lib/analytics.ts answers "what sold". This answers "who bought it, and
 * will they buy again", which is the harder and more valuable question: a
 * marketplace can post a good month while quietly burning through
 * first-time buyers who never return, and nothing in a revenue chart shows
 * that happening until the acquisition slows down.
 *
 * ── Two clocks, and keeping them apart is the whole job ──────────────────
 * Every figure here depends on the difference between:
 *
 *   the PERIOD    — the window the admin selected
 *   the LIFETIME  — everything that customer has ever done
 *
 * "New customers this month" is a period question answered with lifetime
 * data: someone is new only if this is the first order they have EVER
 * placed, which cannot be known from the month alone. Getting this wrong is
 * the single most common way a customer report flatters itself — filter the
 * orders to the period first, and every returning customer whose earlier
 * orders fell outside the window is counted as new, so a mature business
 * reports the acquisition numbers of a brand new one.
 *
 * So: records are built from ALL orders, and the period only ever selects
 * which of them to talk about.
 *
 * ── Identity ─────────────────────────────────────────────────────────────
 * There are no customer accounts behind these orders, so a customer is
 * identified by the strongest thing the order carries — email, else phone,
 * else name. Names alone merge every "Ahmed" into one buyer, which is why
 * they are the last resort rather than the first.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  bucketsFor,
  computeDelta,
  inPeriod,
  type Delta,
  type Period,
  type Ranked,
} from "./analytics.ts";
import type { Order } from "./types";

// ── One customer ───────────────────────────────────────────────────────

export interface CustomerRecord {
  /** Stable identity across orders. See the note on identity above. */
  key: string;
  name: string;
  email?: string;
  phone?: string;
  /** The city on their most recent order. */
  city?: string;
  /** Non-cancelled orders, lifetime. */
  orders: number;
  /** What they have spent, lifetime. */
  revenue: number;
  units: number;
  /** ISO date of their first non-cancelled order. */
  firstOrder: string;
  lastOrder: string;
  /** Shops they have bought from — cross-shop buyers are the valuable ones. */
  stores: string[];
  cancelled: number;
}

function identify(order: Order): string {
  return (order.email || order.phone || order.customer || "").trim().toLowerCase();
}

/**
 * Every customer, built from every order ever placed.
 *
 * Cancelled orders are counted (so a customer who only ever cancelled is
 * still visible) but contribute no revenue and do not set the first-order
 * date — being new is something you become by buying, not by trying to.
 */
export function buildCustomers(orders: Order[]): CustomerRecord[] {
  const byKey = new Map<string, CustomerRecord>();

  // Oldest first, so firstOrder/lastOrder fall out of the iteration rather
  // than needing a second pass to sort out.
  const chronological = [...orders].sort((a, b) => a.date.localeCompare(b.date));

  for (const order of chronological) {
    const key = identify(order);
    if (!key) continue;

    const record = byKey.get(key) ?? {
      key,
      name: order.customer || "Unknown",
      email: order.email || undefined,
      phone: order.phone || undefined,
      city: order.city || undefined,
      orders: 0,
      revenue: 0,
      units: 0,
      firstOrder: "",
      lastOrder: "",
      stores: [],
      cancelled: 0,
    };

    const day = order.date.slice(0, 10);

    if (order.status === "cancelled") {
      record.cancelled += 1;
    } else {
      record.orders += 1;
      record.revenue += order.total || 0;
      record.units += (order.items ?? []).reduce((sum, item) => sum + (item.qty || 0), 0);
      if (!record.firstOrder) record.firstOrder = day;
      record.lastOrder = day;
      if (!record.stores.includes(order.store)) record.stores.push(order.store);
    }

    // Latest details win — people move, and change the number they answer on.
    record.name = order.customer || record.name;
    record.email = order.email || record.email;
    record.phone = order.phone || record.phone;
    record.city = order.city || record.city;

    byKey.set(key, record);
  }

  // Anyone who has only ever cancelled has no first order, and belongs in
  // no cohort and no average. Dropped rather than counted as a zero-value
  // customer, which would drag every per-customer figure down.
  return [...byKey.values()].filter((record) => record.orders > 0);
}

// ── Purchase frequency ─────────────────────────────────────────────────

export interface FrequencyBand {
  label: string;
  customers: number;
  revenue: number;
  /** Share of all customers, 0–100. */
  share: number;
}

/**
 * How many customers bought once, twice, and so on.
 *
 * Banded rather than listed: the interesting shape is "how much of the
 * business comes from the people who came back", and a table with a row
 * for every value from 1 to 40 hides it completely.
 */
export function frequencyBands(customers: CustomerRecord[]): FrequencyBand[] {
  const bands = [
    { label: "1 order", test: (n: number) => n === 1 },
    { label: "2 orders", test: (n: number) => n === 2 },
    { label: "3–5 orders", test: (n: number) => n >= 3 && n <= 5 },
    { label: "6–10 orders", test: (n: number) => n >= 6 && n <= 10 },
    { label: "11+ orders", test: (n: number) => n >= 11 },
  ];

  const total = customers.length || 1;
  return bands.map((band) => {
    const matching = customers.filter((customer) => band.test(customer.orders));
    return {
      label: band.label,
      customers: matching.length,
      revenue: round2(matching.reduce((sum, customer) => sum + customer.revenue, 0)),
      share: round2((matching.length / total) * 100),
    };
  });
}

// ── Retention cohorts ──────────────────────────────────────────────────

export interface CohortRow {
  /** First-order month, "2026-03". */
  cohort: string;
  /** "Mar 26" */
  label: string;
  /** Customers who first bought that month. */
  size: number;
  /**
   * Share of the cohort that ordered again in month +n, 0–100.
   * `cells[0]` is always 100 — everyone bought in the month they arrived.
   * `null` means that month has not happened yet for this cohort, which is
   * NOT the same as nobody returning and must not be drawn as a zero.
   */
  cells: (number | null)[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1] ?? "?"} ${year.slice(2)}`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Retention by acquisition month — the single most honest chart about
 * whether a marketplace is working.
 *
 * Read a row left to right and it says: of everyone who first bought in
 * this month, what share came back one month later, two months later, and
 * so on. Read the FIRST COLUMN down and it says whether the customers you
 * are winning now are better or worse than the ones you won last quarter,
 * which is the question a revenue chart cannot answer at all.
 *
 * Built from lifetime data, ignoring the selected period entirely — a
 * cohort's tail extends past any window you might be looking at, and
 * cutting it at the window would make every recent cohort look terrible.
 */
export function buildCohorts(
  customers: CustomerRecord[],
  orders: Order[],
  months = 6,
  today = new Date(),
): CohortRow[] {
  const firstMonthOf = new Map(customers.map((c) => [c.key, c.firstOrder.slice(0, 7)]));
  const nowMonth = today.toISOString().slice(0, 7);

  /** cohort month → customer key → set of months they ordered in. */
  const activity = new Map<string, Map<string, Set<string>>>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const key = identify(order);
    const cohort = firstMonthOf.get(key);
    if (!cohort) continue;

    const perCohort = activity.get(cohort) ?? new Map<string, Set<string>>();
    const seen = perCohort.get(key) ?? new Set<string>();
    seen.add(order.date.slice(0, 7));
    perCohort.set(key, seen);
    activity.set(cohort, perCohort);
  }

  return [...activity.keys()]
    .sort()
    .slice(-months)
    .map((cohort) => {
      const perCustomer = [...(activity.get(cohort)?.values() ?? [])];
      const size = perCustomer.length;
      const elapsed = monthsBetween(cohort, nowMonth);

      const cells: (number | null)[] = [];
      for (let offset = 0; offset < months; offset++) {
        if (offset > elapsed) {
          cells.push(null);
          continue;
        }
        const target = addMonths(cohort, offset);
        const returned = perCustomer.filter((seen) => seen.has(target)).length;
        cells.push(size > 0 ? round2((returned / size) * 100) : 0);
      }

      return { cohort, label: monthLabel(cohort), size, cells };
    })
    .reverse();
}

function addMonths(month: string, count: number): string {
  const [year, index] = month.split("-").map(Number);
  const total = (year * 12 + (index - 1)) + count;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ── The summary ────────────────────────────────────────────────────────

export interface CustomerSeriesPoint {
  date: string;
  label: string;
  newCustomers: number;
  returningCustomers: number;
  newRevenue: number;
  returningRevenue: number;
}

export interface CustomerSummary {
  /** Customers who placed at least one order in the period. */
  active: number;
  /** …of whom this was their first order ever. */
  newCustomers: number;
  /** …of whom had bought before the period began. */
  returning: number;
  /** Returning as a share of active, 0–100. */
  returningRate: number;
  /** Share of ALL customers ever who have bought more than once, 0–100. */
  repeatPurchaseRate: number;
  newRevenue: number;
  returningRevenue: number;
  /** Average order value, split by whether the buyer had bought before. */
  newAov: number;
  returningAov: number;
  /** Average lifetime spend per customer, across everyone ever. */
  lifetimeValue: number;
  /** Average lifetime orders per customer. */
  ordersPerCustomer: number;
  /** Spend per active customer within the period. */
  revenuePerActive: number;
  activeDelta: Delta;
  newDelta: Delta;
  returningRevenueDelta: Delta;
  ltvDelta: Delta;
  series: CustomerSeriesPoint[];
  frequency: FrequencyBand[];
  cohorts: CohortRow[];
  /** Best customers in the period, by what they spent in it. */
  topCustomers: (CustomerRecord & { periodRevenue: number; periodOrders: number })[];
  byCity: Ranked[];
  /** Customers who bought from more than one shop. */
  crossStore: number;
  /**
   * Active before the period and silent during it. The number a retention
   * campaign is actually aimed at.
   */
  lapsed: number;
}

export interface CustomerInput {
  orders: Order[];
  period: Period;
  today?: Date;
}

export function summariseCustomers({
  orders,
  period,
  today = new Date(),
}: CustomerInput): CustomerSummary {
  const all = buildCustomers(orders);
  const byKey = new Map(all.map((customer) => [customer.key, customer]));

  const sold = orders.filter((order) => order.status !== "cancelled");
  const current = period.unbounded ? sold : inPeriod(sold, period.start, period.end);
  const before = period.unbounded ? [] : inPeriod(sold, period.previousStart, period.previousEnd);

  /** Was this order the customer's first ever? */
  const isFirstEver = (order: Order): boolean => {
    const record = byKey.get(identify(order));
    return Boolean(record) && record!.firstOrder === order.date.slice(0, 10);
  };

  const activeKeys = new Set(current.map(identify).filter(Boolean));
  const newKeys = new Set(
    current.filter(isFirstEver).map(identify).filter(Boolean),
  );
  const returningKeys = new Set([...activeKeys].filter((key) => !newKeys.has(key)));

  const newRevenue = sumBy(current.filter(isFirstEver), (order) => order.total);
  const newOrders = current.filter(isFirstEver).length;
  const returningOrders = current.length - newOrders;
  const returningRevenue = sumBy(current, (order) => order.total) - newRevenue;

  // ── The previous window, for the deltas ──────────────────────────────
  const beforeActive = new Set(before.map(identify).filter(Boolean));
  const beforeNew = new Set(before.filter(isFirstEver).map(identify).filter(Boolean));
  const beforeReturningRevenue =
    sumBy(before, (order) => order.total) -
    sumBy(before.filter(isFirstEver), (order) => order.total);

  /*
   * Lifetime value is measured against customers ACQUIRED in each window,
   * not against everyone alive in it.
   *
   * Comparing "average lifetime spend of everyone who bought this month"
   * against the same figure for last month compares two overlapping groups
   * and mostly measures how long each has existed — older customers have
   * had more time to spend, so the number drifts upward forever and means
   * nothing. Cohort LTV moves when the customers you are winning change.
   */
  const ltvOf = (keys: Set<string>) => {
    const members = [...keys].map((key) => byKey.get(key)).filter(Boolean) as CustomerRecord[];
    if (members.length === 0) return 0;
    return round2(members.reduce((sum, c) => sum + c.revenue, 0) / members.length);
  };

  // ── New vs returning over time ───────────────────────────────────────
  const buckets = bucketsFor(current, period, today);
  const seriesTotals = new Map<string, CustomerSeriesPoint>();
  const seenInSeries = new Set<string>();

  for (const order of [...current].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = buckets.keyOf(order.date);
    const point =
      seriesTotals.get(key) ??
      ({
        date: key,
        label: "",
        newCustomers: 0,
        returningCustomers: 0,
        newRevenue: 0,
        returningRevenue: 0,
      } satisfies CustomerSeriesPoint);

    const identity = identify(order);
    const first = isFirstEver(order);

    // Count each customer once per bucket, not once per order — a bucket
    // where one loyal buyer ordered five times is one returning customer.
    const bucketIdentity = `${key}|${identity}`;
    if (identity && !seenInSeries.has(bucketIdentity)) {
      seenInSeries.add(bucketIdentity);
      if (first) point.newCustomers += 1;
      else point.returningCustomers += 1;
    }

    if (first) point.newRevenue += order.total || 0;
    else point.returningRevenue += order.total || 0;

    seriesTotals.set(key, point);
  }

  const series = buckets.keys.map(({ key, label }) => ({
    ...(seriesTotals.get(key) ?? {
      date: key,
      newCustomers: 0,
      returningCustomers: 0,
      newRevenue: 0,
      returningRevenue: 0,
    }),
    date: key,
    label,
  }));

  // ── Top customers, by what they spent IN THE PERIOD ──────────────────
  const periodSpend = new Map<string, { revenue: number; orders: number }>();
  for (const order of current) {
    const key = identify(order);
    if (!key) continue;
    const entry = periodSpend.get(key) ?? { revenue: 0, orders: 0 };
    entry.revenue += order.total || 0;
    entry.orders += 1;
    periodSpend.set(key, entry);
  }

  const topCustomers = [...periodSpend.entries()]
    .map(([key, spend]) => {
      const record = byKey.get(key);
      if (!record) return undefined;
      return {
        ...record,
        periodRevenue: round2(spend.revenue),
        periodOrders: spend.orders,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.periodRevenue - a!.periodRevenue) as (CustomerRecord & {
    periodRevenue: number;
    periodOrders: number;
  })[];

  // ── Where they are ───────────────────────────────────────────────────
  const cities = new Map<string, Ranked>();
  for (const order of current) {
    const city = order.city || "Unknown";
    const row = cities.get(city) ?? { id: city, label: city, revenue: 0, units: 0, orders: 0 };
    row.revenue += order.total || 0;
    row.orders += 1;
    cities.set(city, row);
  }
  // `units` carries the customer count here — a city is ranked by how many
  // distinct buyers it holds, not by how many parcels went to it.
  for (const [city, row] of cities) {
    row.units = new Set(
      current.filter((order) => (order.city || "Unknown") === city).map(identify),
    ).size;
  }

  const lifetimeValue =
    all.length > 0 ? round2(all.reduce((sum, c) => sum + c.revenue, 0) / all.length) : 0;

  return {
    active: activeKeys.size,
    newCustomers: newKeys.size,
    returning: returningKeys.size,
    returningRate: activeKeys.size > 0 ? round2((returningKeys.size / activeKeys.size) * 100) : 0,
    repeatPurchaseRate:
      all.length > 0
        ? round2((all.filter((c) => c.orders > 1).length / all.length) * 100)
        : 0,
    newRevenue: round2(newRevenue),
    returningRevenue: round2(returningRevenue),
    newAov: newOrders > 0 ? round2(newRevenue / newOrders) : 0,
    returningAov: returningOrders > 0 ? round2(returningRevenue / returningOrders) : 0,
    lifetimeValue,
    ordersPerCustomer:
      all.length > 0 ? round2(all.reduce((sum, c) => sum + c.orders, 0) / all.length) : 0,
    revenuePerActive:
      activeKeys.size > 0
        ? round2(sumBy(current, (order) => order.total) / activeKeys.size)
        : 0,
    activeDelta: computeDelta(activeKeys.size, beforeActive.size, period.unbounded),
    newDelta: computeDelta(newKeys.size, beforeNew.size, period.unbounded),
    returningRevenueDelta: computeDelta(
      returningRevenue,
      beforeReturningRevenue,
      period.unbounded,
    ),
    ltvDelta: computeDelta(ltvOf(newKeys), ltvOf(beforeNew), period.unbounded),
    series,
    frequency: frequencyBands(all),
    cohorts: buildCohorts(all, sold, 6, today),
    topCustomers,
    byCity: [...cities.values()].sort((a, b) => b.revenue - a.revenue),
    crossStore: all.filter((customer) => customer.stores.length > 1).length,
    lapsed: period.unbounded
      ? 0
      : all.filter(
          (customer) => customer.lastOrder < period.start && customer.orders > 0,
        ).length,
  };
}

function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + (value(item) || 0), 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
