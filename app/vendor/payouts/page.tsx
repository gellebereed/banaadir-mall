import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PayoutDetailsForm from "@/components/dashboard/PayoutDetailsForm";
import { getBaseProductsByStore, getCommissionSettings, getOrdersByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import {
  buildPayoutSummary,
  getPayoutAccount,
  getPayoutRecords,
  PAYOUT_METHODS,
} from "@/lib/payouts";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

/**
 * What this store has earned, what the marketplace has paid, and what is
 * still owed — month by month. See lib/payouts.ts for how it's worked out.
 *
 * The owner sees everything and sets where to be paid. Staff see it only
 * with "See cost price & profit" (the Money permission), and can't change
 * the payout account.
 */
export default async function VendorPayoutsPage() {
  const { session, storeSlug } = await requireVendor();
  const isOwner = !session.access && session.role === "seller";
  if (!isOwner && !may(session, "costs.view") && session.role !== "admin") redirect("/vendor");

  const [orders, products, settings, payments, account] = await Promise.all([
    getOrdersByStore(storeSlug),
    getBaseProductsByStore(storeSlug),
    getCommissionSettings(),
    getPayoutRecords(storeSlug),
    getPayoutAccount(storeSlug),
  ]);
  const summary = buildPayoutSummary(orders, products, settings, payments);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">Payouts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Money from delivered orders, after the marketplace&apos;s commission
        {settings.enabled ? "" : " (none is charged at the moment)"}, and what has been sent to you.
      </p>

      {/* ── Balance ──────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Owed to you</p>
          <p className={`mt-1 font-display text-3xl font-extrabold ${summary.totalOwed > 0 ? "text-emerald-700" : "text-slate-800"}`}>
            {money(summary.totalOwed)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Earned, not yet paid</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Paid to you so far</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-slate-800">{money(summary.totalPaid)}</p>
          <p className="mt-1 text-[11px] text-slate-400">of {money(summary.totalEarned)} earned</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">On the way</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-slate-800">{money(summary.onTheWay.gross)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {summary.onTheWay.orders} order{summary.onTheWay.orders === 1 ? "" : "s"} not delivered yet — earned on delivery
          </p>
        </div>
      </div>

      {/* ── Where to pay ─────────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ocean-950">Where we send your money</h2>
        {isOwner ? (
          <>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              {account
                ? `Currently ${account.method}${account.accountNumber !== "—" ? ` · ${account.accountNumber}` : ""}.`
                : "Not set yet — add it so the marketplace knows where to send your payouts."}
            </p>
            {/* Keyed so a save remounts it with the saved values — React resets
                a form to its defaults after an action, and stale defaults
                showed the old method. */}
            <PayoutDetailsForm key={account?.updatedAt ?? "new"} account={account} methods={PAYOUT_METHODS} />
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            {account ? `${account.method}${account.accountNumber !== "—" ? ` · ${account.accountNumber}` : ""}` : "Not set yet."}{" "}
            Only the store owner can change this.
          </p>
        )}
      </section>

      {/* ── Statements ───────────────────────────────────────────── */}
      <section className="card mt-5 overflow-hidden">
        <div className="border-b border-sand-100 p-5">
          <h2 className="font-display text-lg font-bold text-ocean-950">Monthly statements</h2>
          <p className="mt-0.5 text-sm text-slate-500">By the month orders were placed; counted once delivered.</p>
        </div>
        {summary.months.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No delivered orders yet — your first statement appears here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">Sales</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                  <th className="px-5 py-3 text-right">Earned</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {summary.months.map((m) => (
                  <tr key={m.period} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{m.label}</p>
                      {m.payments.map((p) => (
                        <p key={p.id} className="mt-0.5 text-[11px] text-slate-500">
                          Paid {money(p.amount)} on {shortDate(p.paidAt.slice(0, 10))}
                          {p.method ? ` · ${p.method}` : ""}
                          {p.reference ? ` · ref ${p.reference}` : ""}
                        </p>
                      ))}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">{m.orders}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(m.gross)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{m.commission > 0 ? `−${money(m.commission)}` : "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(m.earned)}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(m.paid)}</td>
                    <td className="px-5 py-3 text-right">
                      {m.owed > 0.004 ? (
                        <span className="rounded-full bg-mango-100 px-2 py-0.5 text-xs font-bold text-mango-800">{money(m.owed)}</span>
                      ) : m.owed < -0.004 ? (
                        <span className="text-xs font-semibold text-slate-500">overpaid {money(-m.owed)}</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
