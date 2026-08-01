import Link from "next/link";
import RevenueChart from "@/components/dashboard/RevenueChart";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { getOrdersByStore, getStore, getVendorStats } from "@/lib/api";
import { compact, money, shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";

/** Seller overview: analytics for the signed-in seller's store. */
export default async function VendorOverviewPage() {
  const { storeSlug } = await requireVendor();
  const [store, stats, storeOrders] = await Promise.all([
    getStore(storeSlug),
    getVendorStats(storeSlug),
    getOrdersByStore(storeSlug),
  ]);
  const maxStatus = Math.max(...stats.statusBreakdown.map((s) => s.count), 1);

  return (
    <div>
      {/* Head */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            How {store?.name} is performing, live.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/store/${storeSlug}`} className="btn-secondary !px-4 !py-2 text-sm">
            View Public Store
          </Link>
          <Link href="/vendor/products/new" className="btn-primary !px-4 !py-2 text-sm">
            + Add Product
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon="💰" label="Revenue (30d)" value={money(stats.revenue)} trend="+18% vs last month" />
        <StatCard icon="🧾" label="Orders (30d)" value={String(stats.orderCount)} trend={`${stats.pendingOrders} awaiting action`} />
        <StatCard icon="💳" label="Avg. Order Value" value={money(stats.aov)} />
        <StatCard icon="⭐" label="Store Rating" value={stats.rating.toFixed(1)} trend={`${compact(store?.reviewCount ?? 0)} reviews`} />
      </div>

      {/* Chart + order status breakdown */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <RevenueChart series={stats.revenueSeries} />
        <div className="card p-5">
          <h3 className="font-display font-bold text-ocean-950">Orders by status</h3>
          <div className="mt-4 space-y-3">
            {stats.statusBreakdown.map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <span className="w-20 text-xs font-semibold capitalize text-slate-500">
                  {s.status}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-ocean-400"
                    style={{ width: `${(s.count / maxStatus) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-bold text-ocean-950">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/vendor/orders"
            className="mt-4 block text-xs font-bold text-ocean-700 hover:underline"
          >
            Manage orders →
          </Link>
        </div>
      </div>

      {/* Top products + recent orders */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-ocean-950">Top products by revenue</h3>
            <Link href="/vendor/products" className="text-xs font-bold text-ocean-700 hover:underline">
              All products →
            </Link>
          </div>
          <ol className="mt-4 space-y-3">
            {stats.topProducts.map((t, i) => (
              <li key={t.product.id} className="flex items-center gap-3">
                <span className="font-display text-sm font-extrabold text-slate-300">{i + 1}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sand-100 text-lg">
                  {t.product.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.product.name}</p>
                  <p className="text-xs text-slate-400">{t.units} units sold</p>
                </div>
                <span className="font-display text-sm font-bold text-ocean-950">
                  {money(t.revenue)}
                </span>
              </li>
            ))}
            {stats.topProducts.length === 0 && (
              <p className="text-sm text-slate-400">No sales yet this month.</p>
            )}
          </ol>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-ocean-950">Recent orders</h3>
            <Link href="/vendor/orders" className="text-xs font-bold text-ocean-700 hover:underline">
              All orders →
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {storeOrders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center gap-3 text-sm">
                <span className="font-bold text-ocean-800">{o.id}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">
                  {o.customer} · {shortDate(o.date)}
                </span>
                <span className="font-semibold">{money(o.total)}</span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
