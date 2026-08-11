import type { Metadata } from "next";
import Link from "next/link";
import CommissionForm from "@/components/dashboard/CommissionForm";
import { Footnote, KpiCard, MiniStat, RangeFilter } from "@/components/dashboard/DashboardUI";
import { computeDelta, inPeriod, parseRange, resolvePeriod } from "@/lib/analytics";
import { summariseCommission } from "@/lib/commission";
import {
  getAllProducts,
  getAllStores,
  getCategories,
  getCommissionSettings,
  getOrders,
} from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { getSession } from "@/lib/session";
import { may } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Commission" };

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  COMMISSION — set the rate, and see what it has actually earned.
 * ─────────────────────────────────────────────────────────────────────────
 * Setting a rate and measuring it are the same job, so they are the same
 * page. A settings screen that cannot tell you what the setting produced
 * sends you to a dashboard to find out, and the two then disagree about
 * which period they are describing.
 *
 * The earnings above the form are computed by lib/commission.ts — the same
 * module the seller's payout figure goes through — so what the marketplace
 * reads here and what a seller reads on their own dashboard are two halves
 * of one subtraction, and cannot drift.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Money settings take the permission that means "may change how this
  // business runs", not the one that means "may edit the home page".
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");
  if (!may(session, "settings.manage")) redirect("/admin");

  const params = await searchParams;
  const range = parseRange(params.range);
  const period = resolvePeriod(range);

  const [settings, orders, products, stores, categories] = await Promise.all([
    getCommissionSettings(),
    getOrders(),
    getAllProducts(),
    getAllStores(),
    getCategories(true),
  ]);

  const current = period.unbounded ? orders : inPeriod(orders, period.start, period.end);
  const previous = period.unbounded
    ? []
    : inPeriod(orders, period.previousStart, period.previousEnd);

  const earned = summariseCommission(current, products, settings);
  const earnedBefore = summariseCommission(previous, products, settings);

  const storeNames = new Map(stores.map((store) => [store.slug, store.name]));
  const periodLabel = period.unbounded ? "all time" : `last ${period.label}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Commission</h1>
          <p className="mt-1 text-sm text-slate-500">
            What Banaadir Mall keeps from each sale, and what it has earned —{" "}
            {periodLabel}
            {!period.unbounded && (
              <span className="text-slate-400">
                {" "}
                ({shortDate(period.start)} – {shortDate(period.end)})
              </span>
            )}
          </p>
        </div>
        <RangeFilter basePath="/admin/commissions" range={range} tab="" />
      </div>

      {!settings.enabled && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-mango-200 bg-mango-50 p-4">
          <span className="text-2xl">💤</span>
          <div>
            <p className="font-semibold text-mango-900">Commission is switched off.</p>
            <p className="mt-0.5 text-sm text-mango-900/80">
              Sellers keep the full value of every order. The figures below show
              what the rates in the form <em>would</em> have earned over this
              period, so you can decide before switching it on.
            </p>
          </div>
        </div>
      )}

      {/* ── What it earned ───────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          icon="🏦"
          label={settings.enabled ? "Commission earned" : "Commission it would earn"}
          value={money(earned.commission)}
          delta={computeDelta(earned.commission, earnedBefore.commission, period.unbounded)}
        />
        <KpiCard
          icon="💵"
          label="Paid out to sellers"
          value={money(earned.payout)}
          delta={computeDelta(earned.payout, earnedBefore.payout, period.unbounded)}
        />
        <KpiCard
          icon="📈"
          label="Effective rate"
          value={`${earned.effectivePct.toFixed(1)}%`}
          note={`across ${earned.orders} order${earned.orders === 1 ? "" : "s"}`}
        />
        <KpiCard
          icon="🧾"
          label="Of which fixed fees"
          value={money(earned.fees)}
          note={
            settings.orderFee > 0
              ? `${money(settings.orderFee)} × ${earned.orders} orders`
              : "no per-order fee set"
          }
        />
      </div>

      {earned.cancelledCommission > 0 && (
        <Footnote>
          A further {money(earned.cancelledCommission)} sat on orders that were
          cancelled, and is not counted anywhere above — a cancelled sale earns
          nothing.
        </Footnote>
      )}

      {/* ── Per store ────────────────────────────────────────────── */}
      {earned.byStore.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-sand-200 p-5">
            <div>
              <h2 className="font-display font-bold text-ocean-950">
                By store — {periodLabel}
              </h2>
              <p className="text-xs text-slate-500">
                What each shop sold, what it owes, and what it is due.
              </p>
            </div>
            <Link href="/admin/stores" className="text-xs font-bold text-ocean-700 hover:underline">
              Manage stores →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Store</th>
                  <th className="px-5 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">Sales</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                  <th className="px-5 py-3 text-right">Rate</th>
                  <th className="px-5 py-3 text-right">Seller payout</th>
                </tr>
              </thead>
              <tbody>
                {earned.byStore.map((row) => (
                  <tr key={row.store} className="border-t border-sand-100 hover:bg-sand-50">
                    <td className="px-5 py-3">
                      <Link href={`/store/${row.store}`} className="font-semibold text-slate-800 hover:underline">
                        {storeNames.get(row.store) ?? row.store}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">{row.orders}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(row.gross)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-ocean-950">
                      {money(row.commission)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500">
                      {row.effectivePct.toFixed(1)}%
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                      {money(row.payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── The setup ────────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="font-display text-xl font-extrabold text-ocean-950">Set it up</h2>
        <p className="mt-1 text-sm text-slate-500">
          Changes apply to every figure on this page and on every seller
          dashboard as soon as they are saved.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniStat
            label="Status"
            value={settings.enabled ? "Charging" : "Off"}
            tone={settings.enabled ? "good" : undefined}
          />
          <MiniStat label="Base rate" value={`${settings.defaultPct}%`} />
          <MiniStat
            label="Overrides"
            value={String((settings.rules ?? []).filter((rule) => rule.active).length)}
            note={`${(settings.rules ?? []).length} saved in total`}
          />
        </div>
      </div>

      <CommissionForm
        initial={settings}
        stores={stores.map((store) => ({ slug: store.slug, name: store.name }))}
        categories={categories.map((category) => ({
          slug: category.slug,
          name: category.name,
        }))}
      />

      <Footnote>
        Commission is computed from the rules whenever a figure is asked for,
        rather than stamped onto each order at checkout. That means editing a
        rate <strong>restates past periods</strong> — the numbers above will
        change to match the new rules. It is the right trade while nothing is
        being paid out against them; the day it is, the rate needs recording on
        the order itself (see the note at the top of lib/commission.ts).
      </Footnote>
    </div>
  );
}
