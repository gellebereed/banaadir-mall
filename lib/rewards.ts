/**
 * ─────────────────────────────────────────────────────────────────────────
 *  REWARDS — credit a shopper earns on one order and spends on the next.
 * ─────────────────────────────────────────────────────────────────────────
 * Every other reason to buy in this app works only while somebody is
 * already on the site. A balance is the one that works while they are
 * away: unspent money in a shop is a reason to come back to it.
 *
 * ── Who pays ─────────────────────────────────────────────────────────────
 * The shops, and only the ones that joined (/vendor/promotions) — the same
 * arrangement as the promo code. Customers pay each shop directly, so
 * credit spent at a shop is simply money that shop does not collect. That
 * makes the rules below a promise to SHOPS as much as to shoppers:
 *
 *   • credit is earned only on orders from participating shops
 *   • it can be spent only at participating shops
 *   • at most `maxSpendPct` of one parcel can be paid with it, so a shop
 *     never hands over an order for nothing
 *
 * ── There is no ledger ───────────────────────────────────────────────────
 * A wallet is worked out from the customer's ORDERS, each of which carries
 * what it earned and what it spent (`order.reward`). That is deliberate:
 * a separate balance table has to be kept in step with every status change
 * — delivered, cancelled, cancelled after delivery — and the day the two
 * disagree, somebody has either lost money or been given it. Derived from
 * orders they cannot disagree:
 *
 *   delivered order   its `earn` is available, its `spent` is gone
 *   in-flight order   its `earn` is pending,   its `spent` is gone
 *   cancelled order   counts for nothing — the credit spent on it is back
 *                     in the wallet by itself, with no refund code to run
 *
 * The amounts are stamped on the order when it is placed, so changing the
 * rate later never rewrites what anyone was already promised.
 *
 * Safe to import from client and server.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Order, OrderReward, RewardSettings } from "./types";

export const DEFAULT_REWARDS: RewardSettings = {
  active: false,
  earnPct: 2,
  maxSpendPct: 20,
  stores: [],
};

/** The most an admin can set — a typo must not give the shop away. */
export const MAX_EARN_PCT = 20;
export const MAX_SPEND_PCT = 50;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Down, never up: half a cent of rounding must not overdraw a wallet. */
const floor2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

export function rewardSettings(raw?: Partial<RewardSettings> | null): RewardSettings {
  return { ...DEFAULT_REWARDS, ...(raw ?? {}), stores: raw?.stores ?? [] };
}

/** Is this shop giving and accepting credit right now? */
export function inRewards(settings: RewardSettings, store: string): boolean {
  return settings.active && settings.earnPct > 0 && settings.stores.includes(store);
}

/** Credit an order of `paid` at this shop earns. */
export function earnFor(settings: RewardSettings, store: string, paid: number): number {
  if (!inRewards(settings, store) || paid <= 0) return 0;
  return floor2((paid * settings.earnPct) / 100);
}

/**
 * How a balance is spread over a basket's parcels.
 *
 * Each participating shop's parcel takes up to `maxSpendPct` of its own
 * total, in basket order, until the balance runs out. Returns shop → credit.
 */
export function planSpend(
  settings: RewardSettings,
  balance: number,
  parcels: { store: string; total: number }[],
): Record<string, number> {
  const plan: Record<string, number> = {};
  let left = floor2(balance);
  for (const parcel of parcels) {
    if (left <= 0) break;
    if (!inRewards(settings, parcel.store) || parcel.total <= 0) continue;
    const spend = Math.min(left, floor2((parcel.total * settings.maxSpendPct) / 100));
    if (spend <= 0) continue;
    plan[parcel.store] = spend;
    left = round2(left - spend);
  }
  return plan;
}

export interface WalletEntry {
  orderId: string;
  date: string;
  store: string;
  earn: number;
  spent: number;
  /** "available" once delivered, "pending" until then. */
  state: "available" | "pending";
}

export interface Wallet {
  /** Spendable now. */
  available: number;
  /** Earned on orders still on their way — released on delivery. */
  pending: number;
  /** Everything ever earned and released. */
  earned: number;
  /** Everything ever spent. */
  spent: number;
  /** Orders that moved the wallet, newest first. */
  history: WalletEntry[];
}

/** The wallet these orders add up to. Pass ONE customer's orders. */
export function walletFrom(orders: Pick<Order, "id" | "date" | "store" | "status" | "reward">[]): Wallet {
  let earned = 0;
  let pending = 0;
  let spent = 0;
  const history: WalletEntry[] = [];

  for (const order of orders) {
    const reward: OrderReward | undefined = order.reward;
    if (!reward || order.status === "cancelled") continue;
    const earn = reward.earn ?? 0;
    const used = reward.spent ?? 0;
    if (earn <= 0 && used <= 0) continue;

    const delivered = order.status === "delivered";
    if (delivered) earned += earn;
    else pending += earn;
    spent += used;
    history.push({
      orderId: order.id,
      date: order.date,
      store: order.store,
      earn,
      spent: used,
      state: delivered ? "available" : "pending",
    });
  }

  return {
    // Never below zero: a delivered order later cancelled can leave the
    // books short, and a negative balance is not something to show anyone.
    available: Math.max(0, round2(earned - spent)),
    pending: round2(pending),
    earned: round2(earned),
    spent: round2(spent),
    history: history.sort((a, b) => b.date.localeCompare(a.date) || b.orderId.localeCompare(a.orderId)),
  };
}
