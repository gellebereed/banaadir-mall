import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RecordPayoutForm, RemovePayoutButton } from "@/components/dashboard/RecordPayoutForm";
import { getAllStores, getBaseProducts, getCommissionSettings, getOrders } from "@/lib/api";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { buildPayoutSummary, getPayoutAccounts, getPayoutRecords, PAYOUT_METHODS } from "@/lib/payouts";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

/**
 * What the marketplace owes each store — or, for orders the customer paid
 * the shop directly, the commission the store owes the marketplace — and
 * the record of what has been sent either way. Recording a payment here is what the seller then sees on their
 * own Payouts page — one shared ledger instead of two spreadsheets.
 */
export default async function AdminPayoutsPage() {
  const session = await getSession();
  if (session?.role !== "admin" || (session.access && !may(session, "settings.manage"))) {
    redirect("/admin");
  }

  const [stores, orders, products, settings, payments, accounts] = await Promise.all([
    getAllStores(),
    getOrders(),
    getBaseProducts(),
    getCommissionSettings(),
    getPayoutRecords(),
    getPayoutAccounts(),
  ]);

  const rows = stores
    .filter((s) => s.status === "active" || payments.some((p) => p.store === s.slug))
    .map((store) => ({
      store,
      account: accounts.find((a) => a.store === store.slug),
      summary: buildPayoutSummary(
        orders.filter((o) => o.store === store.slug),
        products,
        settings,
        payments.filter((p) => p.store === store.slug),
      ),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.summary.totalOwed) - Math.abs(a.summary.totalOwed) || a.store.name.localeCompare(b.store.name),
    );

  const totalOwed = rows.reduce((s, r) => s + Math.max(0, r.summary.totalOwed), 0);
  const totalDue = rows.reduce((s, r) => s + Math.max(0, -r.summary.totalOwed), 0);
  const totalPaid = rows.reduce((s, r) => s + r.summary.totalPaid, 0);
  const totalReceived = rows.reduce((s, r) => s + r.summary.totalReceived, 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">Payouts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Per store and month. Where customers paid the shop directly, the shop owes you the
        commission; otherwise you owe the shop its sales minus commission. Record money either way
        — the seller sees it on their Payouts page straight away.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Owed to stores now</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-mango-700">{money(totalOwed)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Commission stores owe you</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-coral-600">{money(totalDue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Paid out so far</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-slate-800">{money(totalPaid)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold text-slate-500">Commission received so far</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-slate-800">{money(totalReceived)}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map(({ store, account, summary }) => (
          <details key={store.slug} className="card group overflow-hidden" open={Math.abs(summary.totalOwed) > 0.004 && rows.length <= 5}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 sm:p-5">
              <span className="text-xl">{store.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-900">{store.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {account
                    ? `${account.method}${account.accountNumber !== "—" ? ` · ${account.accountNumber}` : ""}${account.accountName ? ` · ${account.accountName}` : ""}`
                    : "⚠ No payout details yet — ask the owner to add them under Payouts"}
                </span>
              </span>
              <span className="text-right">
                <span
                  className={`block font-display text-lg font-extrabold ${
                    summary.totalOwed > 0.004 ? "text-mango-700" : summary.totalOwed < -0.004 ? "text-coral-600" : "text-emerald-700"
                  }`}
                >
                  {summary.totalOwed > 0.004
                    ? money(summary.totalOwed)
                    : summary.totalOwed < -0.004
                      ? `owes you ${money(-summary.totalOwed)}`
                      : "Settled"}
                </span>
                <span className="block text-[11px] text-slate-400">
                  paid {money(summary.totalPaid)} · received {money(summary.totalReceived)}
                </span>
              </span>
              <span className="text-slate-400 transition group-open:rotate-90">›</span>
            </summary>

            <div className="border-t border-sand-100">
              {summary.months.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No delivered orders yet.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {summary.months.map((m) => (
                    <li key={m.period} className="space-y-2 px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-slate-800">{m.label}</span>
                        <span className="text-xs text-slate-500">
                          {m.orders} orders · sales {money(m.gross)}
                          {m.collectedByShop > 0 && ` (${money(m.collectedByShop)} paid to the shop)`} · commission{" "}
                          {money(m.commission)} · paid {money(m.paid)}
                          {m.received > 0 && ` · received ${money(m.received)}`} ·{" "}
                          {m.owed > 0.004 ? (
                            <strong className="text-mango-700">you owe {money(m.owed)}</strong>
                          ) : m.owed < -0.004 ? (
                            <strong className="text-coral-600">store owes {money(-m.owed)}</strong>
                          ) : (
                            <span className="text-emerald-700">settled</span>
                          )}
                        </span>
                      </div>
                      {m.payments.map((p) => (
                        <p key={p.id} className="text-[11px] text-slate-500">
                          ✓ {p.amount < 0 ? `Received ${money(-p.amount)}` : `Paid ${money(p.amount)}`} on{" "}
                          {shortDate(p.paidAt.slice(0, 10))}
                          {p.method ? ` · ${p.method}` : ""}
                          {p.reference ? ` · ref ${p.reference}` : ""}
                          {p.paidBy ? ` · by ${p.paidBy}` : ""} · <RemovePayoutButton id={p.id} />
                        </p>
                      ))}
                      {m.owed > 0.004 && (
                        <RecordPayoutForm
                          store={store.slug}
                          period={m.period}
                          owed={m.owed}
                          defaultMethod={account?.method}
                          methods={PAYOUT_METHODS}
                        />
                      )}
                      {m.owed < -0.004 && (
                        <RecordPayoutForm
                          store={store.slug}
                          period={m.period}
                          owed={-m.owed}
                          methods={PAYOUT_METHODS}
                          direction="from_store"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
