import type { Metadata } from "next";
import Link from "next/link";
import { CohortGrid, SplitBar, SplitTrendChart } from "@/components/dashboard/AnalyticsUI";
import {
  BarBreakdown,
  Footnote,
  KpiCard,
  MiniStat,
  RangeFilter,
  TabFilter,
  type TabDef,
} from "@/components/dashboard/DashboardUI";
import { parseRange, resolvePeriod } from "@/lib/analytics";
import { summariseCustomers } from "@/lib/customers";
import { getAllStores, getOrders } from "@/lib/api";
import { money, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Customer analytics" };

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: "📈" },
  { key: "retention", label: "Retention", icon: "🔁" },
  { key: "people", label: "Customers", icon: "👤" },
  { key: "places", label: "Places", icon: "📍" },
];

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CUSTOMER ANALYTICS — who is buying, and whether they come back.
 * ─────────────────────────────────────────────────────────────────────────
 * The sales dashboard answers "what sold". This answers the question that
 * decides whether a marketplace has a business: are the people who bought
 * once buying again, or is every good month being paid for by finding
 * another batch of strangers?
 *
 * ── The one figure to distrust elsewhere ─────────────────────────────────
 * Every "new customer" number here is judged against a customer's WHOLE
 * history, not against the selected window — see the note at the top of
 * lib/customers.ts for why that distinction is the difference between a
 * customer report and a flattering one.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "overview";
  const period = resolvePeriod(range);

  const [orders, stores] = await Promise.all([getOrders(), getAllStores()]);
  const customers = summariseCustomers({ orders, period });

  const storeNames = new Map(stores.map((store) => [store.slug, store.name]));
  const periodLabel = period.unbounded ? "all time" : `last ${period.label}`;

  return (
    <div>
      {/* ── Head ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            Customer analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Who is buying and whether they come back — {periodLabel}
            {!period.unbounded && (
              <span className="text-slate-400">
                {" "}
                ({shortDate(period.start)} – {shortDate(period.end)})
              </span>
            )}
          </p>
        </div>
        <RangeFilter basePath="/admin/analytics" range={range} tab={tab} />
      </div>

      {/* ── Headline ─────────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          icon="👥"
          label="Customers who bought"
          value={String(customers.active)}
          delta={customers.activeDelta}
          note={`${customers.newCustomers} new · ${customers.returning} returning`}
        />
        <KpiCard
          icon="✨"
          label="New customers"
          value={String(customers.newCustomers)}
          delta={customers.newDelta}
          note="first order they have ever placed"
        />
        <KpiCard
          icon="🔁"
          label="Returning rate"
          value={`${customers.returningRate.toFixed(0)}%`}
          note={`of buyers in this period had bought before`}
        />
        <KpiCard
          icon="💎"
          label="Lifetime value"
          value={money(customers.lifetimeValue)}
          delta={customers.ltvDelta}
          note="average spend per customer, all time"
        />
      </div>

      <div className="mt-8">
        <TabFilter basePath="/admin/analytics" tabs={TABS} active={tab} range={range} />
      </div>

      {/* ══ OVERVIEW ═════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <SplitTrendChart
              series={customers.series}
              title="New vs returning customers"
              subtitle={
                period.unbounded
                  ? "Everyone who has ever bought, by when they bought"
                  : `Last ${period.label} — each bar counts a person once`
              }
            />
            <SplitBar
              title="Where the money came from"
              left={{ label: "New customers", value: customers.newRevenue }}
              right={{ label: "Returning customers", value: customers.returningRevenue }}
              format={money}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat
              label="Average order — new"
              value={money(customers.newAov)}
              note="first-time buyers"
            />
            <MiniStat
              label="Average order — returning"
              value={money(customers.returningAov)}
              tone={customers.returningAov > customers.newAov ? "good" : undefined}
              note={
                customers.returningAov > customers.newAov
                  ? "they spend more once they trust you"
                  : "returning buyers spend less per order"
              }
            />
            <MiniStat
              label="Orders per customer"
              value={customers.ordersPerCustomer.toFixed(2)}
              note="lifetime average"
            />
            <MiniStat
              label="Spend per active customer"
              value={money(customers.revenuePerActive)}
              note="in this period"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <SplitTrendChart
              series={customers.series}
              title="Revenue by customer type"
              subtitle="The same period, split by whether the buyer had bought before"
              metric="revenue"
            />
            <BarBreakdown
              title="How often people buy"
              rows={customers.frequency.map((band) => ({
                label: band.label,
                count: band.customers,
                value: band.revenue,
              }))}
            />
          </div>

          <Footnote>
            A customer is identified by their email, then their phone number,
            then their name — there are no customer accounts behind these
            orders yet, so two people sharing a name and giving no contact
            details would count as one. Every &ldquo;new&rdquo; figure is
            judged against the customer&apos;s whole history, not against the
            selected window.
          </Footnote>
        </div>
      )}

      {/* ══ RETENTION ════════════════════════════════════════════ */}
      {tab === "retention" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat
              label="Buy more than once"
              value={`${customers.repeatPurchaseRate.toFixed(0)}%`}
              tone={customers.repeatPurchaseRate >= 25 ? "good" : "warn"}
              note="of every customer, all time"
            />
            <MiniStat
              label="Bought from 2+ shops"
              value={String(customers.crossStore)}
              note="customers who treat it as a marketplace"
            />
            <MiniStat
              label="Lapsed"
              value={String(customers.lapsed)}
              tone={customers.lapsed > 0 ? "warn" : undefined}
              note="bought before, silent this period"
            />
            <MiniStat
              label="Returning revenue"
              value={money(customers.returningRevenue)}
              note={`${
                customers.newRevenue + customers.returningRevenue > 0
                  ? Math.round(
                      (customers.returningRevenue /
                        (customers.newRevenue + customers.returningRevenue)) *
                        100,
                    )
                  : 0
              }% of the period`}
            />
          </div>

          <CohortGrid cohorts={customers.cohorts} />

          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">
              What to do with this
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="text-ocean-600">•</span>
                <span>
                  <strong className="text-slate-800">The +1 column is the one to watch.</strong>{" "}
                  Whether someone comes back the month after their first order
                  is decided by that first order — the packaging, the delivery,
                  whether it was what the photo promised.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-ocean-600">•</span>
                <span>
                  <strong className="text-slate-800">
                    A row that starts strong and falls off a cliff
                  </strong>{" "}
                  usually means a promotion brought in people who wanted the
                  discount rather than the shop.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-ocean-600">•</span>
                <span>
                  <strong className="text-slate-800">
                    {customers.lapsed} lapsed customer
                    {customers.lapsed === 1 ? "" : "s"}
                  </strong>{" "}
                  bought before and not in this period. They already know what
                  the parcel looks like when it arrives, which makes them far
                  cheaper to win back than a stranger is to win.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ══ CUSTOMERS ════════════════════════════════════════════ */}
      {tab === "people" && (
        <div className="mt-4">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 p-5">
              <div>
                <h3 className="font-display font-bold text-ocean-950">
                  Customers — {periodLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  Ranked by what they spent in this period. Lifetime figures are
                  everything they have ever done.
                </p>
              </div>
              <Link href="/admin/orders" className="text-xs font-bold text-ocean-700 hover:underline">
                All orders →
              </Link>
            </div>

            {customers.topCustomers.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">Nobody bought in this period.</p>
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="sticky top-0 bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">City</th>
                      <th className="px-5 py-3 text-right">Spent now</th>
                      <th className="px-5 py-3 text-right">Orders now</th>
                      <th className="px-5 py-3 text-right">Lifetime</th>
                      <th className="px-5 py-3 text-right">Lifetime orders</th>
                      <th className="px-5 py-3">Shops</th>
                      <th className="px-5 py-3">First bought</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.topCustomers.slice(0, 100).map((customer) => (
                      <tr key={customer.key} className="border-t border-sand-100 hover:bg-sand-50">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">{customer.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {customer.email || customer.phone || "no contact details"}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{customer.city ?? "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold text-ocean-950">
                          {money(customer.periodRevenue)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {customer.periodOrders}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {money(customer.revenue)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-bold " +
                              (customer.orders > 1
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-sand-100 text-slate-500")
                            }
                          >
                            {customer.orders}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {customer.stores
                            .map((slug) => storeNames.get(slug) ?? slug)
                            .join(", ")}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {shortDate(customer.firstOrder)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {customers.topCustomers.length > 100 && (
            <Footnote>
              Showing the top 100 of {customers.topCustomers.length} customers who
              bought in this period.
            </Footnote>
          )}
        </div>
      )}

      {/* ══ PLACES ═══════════════════════════════════════════════ */}
      {tab === "places" && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">
              Customers by city
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Distinct buyers, not parcels — one person ordering four times is
              one customer.
            </p>

            {customers.byCity.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No orders in this period.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {customers.byCity.slice(0, 12).map((city) => {
                  const share =
                    customers.byCity[0].revenue > 0
                      ? (city.revenue / customers.byCity[0].revenue) * 100
                      : 0;
                  return (
                    <li key={city.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-700">📍 {city.label}</span>
                        <span className="shrink-0 text-slate-500">
                          {city.units} customer{city.units === 1 ? "" : "s"} ·{" "}
                          <strong className="text-ocean-950">{money(city.revenue)}</strong>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-ocean-300"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">
              Orders per customer, by city
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Where a city sits above the average, people there are buying
              repeatedly rather than once.
            </p>

            {customers.byCity.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No orders in this period.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {customers.byCity
                  .slice(0, 12)
                  .map((city) => ({
                    ...city,
                    perCustomer: city.units > 0 ? city.orders / city.units : 0,
                  }))
                  .sort((a, b) => b.perCustomer - a.perCustomer)
                  .map((city) => (
                    <li
                      key={city.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate text-slate-700">{city.label}</span>
                      <span className="shrink-0">
                        <strong className="text-ocean-950">
                          {city.perCustomer.toFixed(2)}
                        </strong>{" "}
                        <span className="text-xs text-slate-400">
                          orders each ({city.orders} / {city.units})
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
