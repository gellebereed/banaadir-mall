/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PAYOUTS — what each store has earned, been paid, and is still owed.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only.
 *
 * The dashboard showed a "Your payout" figure and nothing else: no record
 * of what had actually been sent, no month-by-month statement, and nowhere
 * for a seller to say which number to send it to. Settling up was a
 * WhatsApp conversation and a spreadsheet, and every disagreement started
 * from scratch.
 *
 * ── How a statement is worked out ────────────────────────────────────────
 * One statement per store per calendar month. A sale counts when its order
 * is DELIVERED — money for a parcel still on the road, or one that comes
 * back, isn't owed yet. Commission is the same calculation the dashboards
 * already use (lib/commission.ts), so every screen agrees on the number.
 *
 *   earned  = delivered sales − commission − order fees
 *   paid    = payments the admin has recorded against that month
 *   owed    = earned − paid
 *
 * A late delivery or a cancellation changes `earned` for its month after
 * the fact; `owed` then shows the difference instead of hiding it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { summariseCommission } from "./commission";
import type { PayoutAccount, PayoutRecord } from "./ledger-types";
import { getDB, mutateDB } from "./db";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";
import type { CommissionSettings, Order, Product } from "./types";

export const PAYOUT_METHODS = ["EVC Plus", "Zaad", "eDahab", "Sahal", "Bank transfer", "Cash"] as const;

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

export const PAYOUTS_MIGRATION =
  "Payout records need the payouts tables — run supabase/migration-payouts-activity.sql in Supabase.";

// ── Payment records ────────────────────────────────────────────────────

export async function getPayoutRecords(store?: string): Promise<PayoutRecord[]> {
  if (isSupabaseConfigured()) {
    let query = getDataClient().from("payouts").select("*").order("paid_at", { ascending: false });
    if (store) query = query.eq("store", store);
    const { data, error } = await query;
    if (!error && data) {
      return data.map((r) => ({
        id: r.id,
        store: r.store,
        period: r.period,
        amount: Number(r.amount),
        method: r.method ?? undefined,
        reference: r.reference ?? undefined,
        note: r.note ?? undefined,
        paidAt: r.paid_at,
        paidBy: r.paid_by ?? undefined,
      }));
    }
    if (!missingTable(error)) console.warn("[Payouts] read failed:", error?.message);
  }
  return ((await getDB()).payouts ?? [])
    .filter((r) => !store || r.store === store)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export async function addPayoutRecord(record: PayoutRecord): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("payouts").insert({
      id: record.id,
      store: record.store,
      period: record.period,
      amount: record.amount,
      method: record.method ?? null,
      reference: record.reference ?? null,
      note: record.note ?? null,
      paid_at: record.paidAt,
      paid_by: record.paidBy ?? null,
    });
    if (!error) return;
    // With Supabase as the source of truth, a local write would look saved
    // and then vanish. Say what is missing instead.
    throw new Error(missingTable(error) ? PAYOUTS_MIGRATION : error.message);
  }
  await mutateDB((db) => {
    db.payouts = [...(db.payouts ?? []), record];
  });
}

export async function deletePayoutRecord(id: string): Promise<PayoutRecord | undefined> {
  const existing = (await getPayoutRecords()).find((r) => r.id === id);
  if (!existing) return undefined;
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("payouts").delete().eq("id", id);
    if (error) throw new Error(missingTable(error) ? PAYOUTS_MIGRATION : error.message);
  } else {
    await mutateDB((db) => {
      db.payouts = (db.payouts ?? []).filter((r) => r.id !== id);
    });
  }
  return existing;
}

// ── Where a store wants to be paid ─────────────────────────────────────

export async function getPayoutAccounts(): Promise<PayoutAccount[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient().from("payout_accounts").select("*");
    if (!error && data) {
      return data.map((r) => ({
        store: r.store,
        method: r.method,
        accountName: r.account_name ?? undefined,
        accountNumber: r.account_number,
        updatedAt: r.updated_at ?? undefined,
        updatedBy: r.updated_by ?? undefined,
      }));
    }
  }
  return (await getDB()).payoutAccounts ?? [];
}

export async function getPayoutAccount(store: string): Promise<PayoutAccount | undefined> {
  return (await getPayoutAccounts()).find((a) => a.store === store);
}

export async function savePayoutAccount(account: PayoutAccount): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("payout_accounts").upsert(
      {
        store: account.store,
        method: account.method,
        account_name: account.accountName ?? null,
        account_number: account.accountNumber,
        updated_at: account.updatedAt ?? new Date().toISOString(),
        updated_by: account.updatedBy ?? null,
      },
      { onConflict: "store" },
    );
    if (!error) return;
    throw new Error(missingTable(error) ? PAYOUTS_MIGRATION : error.message);
  }
  await mutateDB((db) => {
    db.payoutAccounts = [...(db.payoutAccounts ?? []).filter((a) => a.store !== account.store), account];
  });
}

// ── Statements ─────────────────────────────────────────────────────────

export interface MonthStatement {
  period: string;
  label: string;
  orders: number;
  gross: number;
  commission: number;
  earned: number;
  paid: number;
  owed: number;
  payments: PayoutRecord[];
}

export interface PayoutSummary {
  months: MonthStatement[];
  totalEarned: number;
  totalPaid: number;
  totalOwed: number;
  /** Sales not delivered yet — earned once they are. */
  onTheWay: { orders: number; gross: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function periodOf(isoDate: string): string {
  return (isoDate || "").slice(0, 7);
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One store's month-by-month statement. `orders` must be that store's. */
export function buildPayoutSummary(
  orders: Order[],
  products: Product[],
  settings: CommissionSettings,
  payments: PayoutRecord[],
): PayoutSummary {
  const delivered = orders.filter((o) => o.status === "delivered");
  const inFlight = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");

  const periods = new Set<string>([
    ...delivered.map((o) => periodOf(o.date)),
    ...payments.map((p) => p.period),
  ]);

  const months: MonthStatement[] = [...periods]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .map((period) => {
      const monthOrders = delivered.filter((o) => periodOf(o.date) === period);
      const totals = summariseCommission(monthOrders, products, settings);
      // With commission switched off the marketplace keeps nothing.
      const commission = settings.enabled ? totals.commission : 0;
      const gross = round2(monthOrders.reduce((sum, o) => sum + (o.total || 0), 0));
      const earned = round2(gross - commission);
      const monthPayments = payments.filter((p) => p.period === period);
      const paid = round2(monthPayments.reduce((sum, p) => sum + p.amount, 0));
      return {
        period,
        label: periodLabel(period),
        orders: monthOrders.length,
        gross,
        commission: round2(commission),
        earned,
        paid,
        owed: round2(earned - paid),
        payments: monthPayments,
      };
    });

  return {
    months,
    totalEarned: round2(months.reduce((s, m) => s + m.earned, 0)),
    totalPaid: round2(months.reduce((s, m) => s + m.paid, 0)),
    totalOwed: round2(months.reduce((s, m) => s + m.owed, 0)),
    onTheWay: {
      orders: inFlight.length,
      gross: round2(inFlight.reduce((s, o) => s + (o.total || 0), 0)),
    },
  };
}
