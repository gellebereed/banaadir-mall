import type { Metadata } from "next";
import RewardsSettingsForm from "@/components/dashboard/RewardsSettingsForm";
import { rewardSettings, walletFrom } from "@/lib/rewards";
import { getMarketingSettings, getOrders, getStores } from "@/lib/api";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Rewards" };

/**
 * BANAADIR REWARDS — the loyalty programme, on its own page so the admin
 * can find it from the sidebar. It used to sit halfway down /admin/marketing,
 * where it was easy to miss.
 *
 * The controls are the same form; around it, the numbers that say whether
 * the programme is doing anything: which shops have joined, and how much
 * credit customers have earned, are waiting on, and have spent. Those are
 * worked out from orders exactly like a customer's wallet (lib/rewards.ts).
 */
export default async function AdminRewardsPage() {
  const [m, stores, orders] = await Promise.all([getMarketingSettings(), getStores(), getOrders()]);
  const rewards = rewardSettings(m.rewards);
  const joined = stores.filter((s) => rewards.stores.includes(s.slug));
  const declined = stores.filter((s) => rewards.declined?.includes(s.slug));
  const waiting = stores.filter((s) => !rewards.stores.includes(s.slug) && !rewards.declined?.includes(s.slug));
  const totals = walletFrom(orders);
  const customers = new Set(
    orders
      .filter((o) => o.email && o.status !== "cancelled" && ((o.reward?.earn ?? 0) > 0 || (o.reward?.spent ?? 0) > 0))
      .map((o) => o.email!.trim().toLowerCase()),
  ).size;

  const stats = [
    { label: "Credit earned", value: money(totals.earned), note: "on delivered orders" },
    { label: "Credit on the way", value: money(totals.pending), note: "released on delivery" },
    { label: "Credit spent", value: money(totals.spent), note: "paid by shops that joined" },
    { label: "Customers", value: String(customers), note: "earned or spent credit" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Rewards</h1>
          <p className="mt-1 text-sm text-slate-500">
            The loyalty programme: customers earn credit on one order and spend it on the next.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            rewards.active ? "bg-emerald-100 text-emerald-700" : "bg-sand-100 text-slate-500"
          }`}
        >
          {rewards.active ? `On · ${rewards.earnPct}% back` : "Off"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-ocean-950">{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <RewardsSettingsForm rewards={rewards} storeNames={joined.map((s) => s.name)} />
      </div>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🤝 Shops in the programme</h2>
        <p className="mt-1 text-xs text-slate-400">
          Each shop joins from its own Promotions page, because the credit spent at a shop is money that shop
          does not collect. Credit is earned and spent only at shops that joined.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {joined.length} joined · {declined.length} declined · {waiting.length} not answered
        </p>
        {[
          { title: "Joined", list: joined, tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
          { title: "Declined", list: declined, tone: "bg-sand-100 text-slate-600 ring-sand-200" },
          { title: "Not answered", list: waiting, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <div key={g.title} className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {g.list.map((s) => (
                  <span key={s.slug} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${g.tone}`}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
