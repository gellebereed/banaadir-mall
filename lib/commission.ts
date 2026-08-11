/**
 * ─────────────────────────────────────────────────────────────────────────
 *  COMMISSION — what the marketplace keeps, and what the seller is owed.
 * ─────────────────────────────────────────────────────────────────────────
 * One engine, used by the admin's earnings figures and by the seller's
 * payout figures, so the two can never disagree about the same order. That
 * matters more here than anywhere else in the app: a dashboard that
 * disagrees with a payout is not a display bug, it is an argument about
 * money.
 *
 * ── Everything is computed, nothing is stored ────────────────────────────
 * There is no `commission` column on an order. The rate is applied to the
 * order as it stands whenever a figure is asked for, which has one obvious
 * consequence worth stating plainly: CHANGING THE RATE CHANGES HISTORY.
 * Last month's earnings will be restated when you edit a rule.
 *
 * That is the right trade at this size — a settings screen and no
 * reconciliation machinery — but it stops being right the day money is paid
 * out against these numbers. At that point the commission belongs ON the
 * order, stamped at checkout, and this module becomes the thing that
 * computes the stamp rather than the thing that answers the question. The
 * shape below is deliberately ready for that: commissionForOrder() takes an
 * order and returns a breakdown, so stamping it is a matter of calling this
 * once at checkout instead of on every read.
 *
 * ── Rounding ─────────────────────────────────────────────────────────────
 * Every figure is rounded to the cent at the point it becomes an ANSWER,
 * never mid-calculation. Rounding each line and then summing produces a
 * total that does not match the same total computed directly, and one of
 * the two ends up on a seller's statement.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { lineRevenue } from "./analytics.ts";
import type { CommissionRule, CommissionSettings, Order, Product } from "./types";

/** What a marketplace with no rules set up yet charges: nothing. */
export const DEFAULT_COMMISSION: CommissionSettings = {
  enabled: false,
  defaultPct: 10,
  orderFee: 0,
  chargeOnDelivery: false,
  showToSellers: true,
  rules: [],
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamp a percentage into something that cannot produce a negative payout. */
export function normalisePct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

// ── Which rate applies ─────────────────────────────────────────────────

export interface ResolvedRate {
  pct: number;
  /** The rule that won, or undefined when the default applied. */
  rule?: CommissionRule;
  /** How the rate was chosen, for the "why am I being charged this" answer. */
  basis: "store+category" | "store" | "category" | "default";
}

/**
 * The rate for one line, most specific rule first.
 *
 * ── Specificity, not order ───────────────────────────────────────────────
 * Rules are matched by how precisely they describe the line, not by where
 * they sit in the list. "Karaca, electronics" beats "Karaca", which beats
 * "electronics", which beats the default. Ordering by position instead
 * would mean the rate depends on the order someone happened to add rules
 * in, and reordering the table would silently change everybody's bill.
 *
 * Ties within a tier go to the first ACTIVE rule, so a duplicate left
 * behind by an experiment cannot quietly outrank the one before it.
 */
export function rateFor(
  settings: CommissionSettings,
  storeSlug: string | undefined,
  categorySlug: string | undefined,
): ResolvedRate {
  const fallback: ResolvedRate = { pct: normalisePct(settings.defaultPct), basis: "default" };
  if (!settings.enabled) return { pct: 0, basis: "default" };

  const active = (settings.rules ?? []).filter((rule) => rule.active);
  const matches = (rule: CommissionRule, wantStore: boolean, wantCategory: boolean) =>
    Boolean(rule.store) === wantStore &&
    Boolean(rule.category) === wantCategory &&
    (!rule.store || rule.store === storeSlug) &&
    (!rule.category || rule.category === categorySlug);

  const tiers: { basis: ResolvedRate["basis"]; store: boolean; category: boolean }[] = [
    { basis: "store+category", store: true, category: true },
    { basis: "store", store: true, category: false },
    { basis: "category", store: false, category: true },
  ];

  for (const tier of tiers) {
    const rule = active.find((r) => matches(r, tier.store, tier.category));
    if (rule) return { pct: normalisePct(rule.pct), rule, basis: tier.basis };
  }

  return fallback;
}

// ── One order ──────────────────────────────────────────────────────────

export interface CommissionLine {
  productId: string;
  name: string;
  /** What the line was worth to the customer. */
  value: number;
  pct: number;
  commission: number;
  basis: ResolvedRate["basis"];
}

export interface OrderCommission {
  orderId: string;
  store: string;
  /** What the customer paid, delivery included — `order.total`. */
  gross: number;
  /** The lines only, before delivery. */
  itemsValue: number;
  /**
   * Gross minus the lines. Usually delivery; also absorbs any order-level
   * discount, which is why it is named for what it IS rather than for what
   * it is usually made of.
   */
  unattributed: number;
  /** The percentage part, summed across lines. */
  rateCommission: number;
  /** The flat per-order part. */
  fee: number;
  /** Everything the marketplace keeps on this order. */
  commission: number;
  /** What the seller is owed. Never negative. */
  payout: number;
  /** Commission as a share of gross, for a single readable number. */
  effectivePct: number;
  lines: CommissionLine[];
}

/**
 * Break one order into what the marketplace keeps and what the seller gets.
 *
 * Cancelled orders earn nothing — checked by the CALLER rather than here,
 * because "what would this order have earned" is a question the admin page
 * legitimately asks about a cancellation.
 */
export function commissionForOrder(
  order: Order,
  catalogue: Map<string, Product>,
  settings: CommissionSettings,
): OrderCommission {
  const gross = order.total || 0;

  const lines: CommissionLine[] = (order.items ?? []).map((item) => {
    const product = catalogue.get(item.productId);
    const value = lineRevenue(item, catalogue);
    const { pct, basis } = rateFor(
      settings,
      item.store ?? product?.store ?? order.store,
      product?.category,
    );
    return {
      productId: item.productId,
      name: item.name ?? product?.name ?? "Deleted product",
      value: round2(value),
      pct,
      commission: round2((value * pct) / 100),
      basis,
    };
  });

  const itemsValue = lines.reduce((total, line) => total + line.value, 0);

  /*
   * Delivery is `gross - lines`, floored at zero.
   *
   * Not floored, a legacy order whose line prices had to be estimated from
   * today's catalogue can produce lines worth MORE than the order total,
   * and a negative "delivery" then quietly reduces the commission on an
   * order that was fine. See lineRevenue on where estimates come from.
   */
  const unattributed = Math.max(0, gross - itemsValue);

  let rateCommission = lines.reduce((total, line) => total + line.commission, 0);
  if (settings.enabled && settings.chargeOnDelivery && unattributed > 0) {
    rateCommission += (unattributed * normalisePct(settings.defaultPct)) / 100;
  }

  const fee = settings.enabled ? Math.max(0, settings.orderFee || 0) : 0;

  // Capped at the order value: a flat fee larger than a small order must
  // not invoice the seller for the privilege of having sold something.
  const commission = round2(Math.min(gross, rateCommission + fee));

  return {
    orderId: order.id,
    store: order.store,
    gross: round2(gross),
    itemsValue: round2(itemsValue),
    unattributed: round2(unattributed),
    rateCommission: round2(rateCommission),
    fee: round2(Math.min(fee, gross)),
    commission,
    payout: round2(Math.max(0, gross - commission)),
    effectivePct: gross > 0 ? round2((commission / gross) * 100) : 0,
    lines,
  };
}

// ── Many orders ────────────────────────────────────────────────────────

export interface CommissionTotals {
  /** Orders the totals are built from — cancellations excluded. */
  orders: number;
  gross: number;
  commission: number;
  payout: number;
  fees: number;
  /** Commission as a share of gross across the whole set. */
  effectivePct: number;
  /** What was NOT earned because the orders were cancelled. */
  cancelledCommission: number;
}

export interface StoreCommission extends CommissionTotals {
  store: string;
}

/**
 * Totals across a set of orders, plus the same split per store.
 *
 * The per-store split is the thing an admin actually acts on — it is the
 * statement each seller gets — so it is computed here rather than left to
 * every caller to re-derive and get subtly differently.
 */
export function summariseCommission(
  orders: Order[],
  products: Product[],
  settings: CommissionSettings,
): CommissionTotals & { byStore: StoreCommission[]; breakdowns: OrderCommission[] } {
  const catalogue = new Map(products.map((product) => [product.id, product]));

  const live = orders.filter((order) => order.status !== "cancelled");
  const cancelled = orders.filter((order) => order.status === "cancelled");

  const breakdowns = live.map((order) => commissionForOrder(order, catalogue, settings));

  const perStore = new Map<string, StoreCommission>();
  for (const entry of breakdowns) {
    const row = perStore.get(entry.store) ?? {
      store: entry.store,
      orders: 0,
      gross: 0,
      commission: 0,
      payout: 0,
      fees: 0,
      effectivePct: 0,
      cancelledCommission: 0,
    };
    row.orders += 1;
    row.gross += entry.gross;
    row.commission += entry.commission;
    row.payout += entry.payout;
    row.fees += entry.fee;
    perStore.set(entry.store, row);
  }

  const gross = breakdowns.reduce((total, entry) => total + entry.gross, 0);
  const commission = breakdowns.reduce((total, entry) => total + entry.commission, 0);
  const fees = breakdowns.reduce((total, entry) => total + entry.fee, 0);

  const cancelledCommission = cancelled.reduce(
    (total, order) => total + commissionForOrder(order, catalogue, settings).commission,
    0,
  );

  return {
    orders: breakdowns.length,
    gross: round2(gross),
    commission: round2(commission),
    payout: round2(gross - commission),
    fees: round2(fees),
    effectivePct: gross > 0 ? round2((commission / gross) * 100) : 0,
    cancelledCommission: round2(cancelledCommission),
    byStore: [...perStore.values()]
      .map((row) => ({
        ...row,
        gross: round2(row.gross),
        commission: round2(row.commission),
        payout: round2(row.payout),
        fees: round2(row.fees),
        effectivePct: row.gross > 0 ? round2((row.commission / row.gross) * 100) : 0,
      }))
      .sort((a, b) => b.commission - a.commission),
    breakdowns,
  };
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Why this rule cannot be saved, or nothing.
 *
 * Rejected at the point of entry rather than ignored at the point of use:
 * a rule that silently never matches is worse than one that was refused,
 * because the admin believes a rate is in force that is not.
 */
export function ruleProblem(rule: CommissionRule): string | undefined {
  if (!rule.store && !rule.category) {
    return "A rule needs a store, a category, or both — otherwise it is just the default rate.";
  }
  if (!Number.isFinite(rule.pct) || rule.pct < 0 || rule.pct > 100) {
    return "A commission rate has to be between 0 and 100 percent.";
  }
  return undefined;
}

/** A human sentence for what a rule covers, e.g. "Karaca Home · Cookware". */
export function ruleScopeLabel(
  rule: CommissionRule,
  storeNames: Map<string, string>,
  categoryNames: Map<string, string>,
): string {
  const parts = [
    rule.store ? (storeNames.get(rule.store) ?? rule.store) : "Every store",
    rule.category ? (categoryNames.get(rule.category) ?? rule.category) : "Every category",
  ];
  return parts.join(" · ");
}
