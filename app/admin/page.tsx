import Link from "next/link";
import RevenueChart from "@/components/dashboard/RevenueChart";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { getAllStores, getFlashRequests, getMarketplaceStats, getOrders } from "@/lib/api";
import { money, shortDate } from "@/lib/format";

/** Admin dashboard: whole-marketplace statistics at a glance. */
export default async function AdminDashboardPage() {
  const [stats, orders, flashRequests, stores] = await Promise.all([
    getMarketplaceStats(),
    getOrders(),
    getFlashRequests(),
    getAllStores(),
  ]);
  const recent = orders.slice(0, 7);
  const pendingFlash = flashRequests.filter((r) => r.status === "pending").length;
  const pendingStores = stores.filter((s) => s.status === "pending").length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        Marketplace Overview
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything happening across Banaadir Mall, in one place.
      </p>

      {/* Anything waiting on an admin decision surfaces here first. */}
      {(pendingFlash > 0 || pendingStores > 0) && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-mango-200 bg-mango-50 p-4">
          <span className="text-2xl">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-mango-900">
              You have {pendingFlash + pendingStores} item
              {pendingFlash + pendingStores === 1 ? "" : "s"} waiting for review
            </p>
            <p className="text-xs text-mango-800">
              {pendingFlash > 0 && `${pendingFlash} flash-deal application${pendingFlash === 1 ? "" : "s"}`}
              {pendingFlash > 0 && pendingStores > 0 && " · "}
              {pendingStores > 0 && `${pendingStores} store application${pendingStores === 1 ? "" : "s"}`}
            </p>
          </div>
          {pendingFlash > 0 && (
            <Link href="/admin/flash" className="btn-primary !px-4 !py-2 text-sm">
              Review flash deals
            </Link>
          )}
          {pendingStores > 0 && (
            <Link href="/admin/stores" className="btn-secondary !px-4 !py-2 text-sm">
              Review stores
            </Link>
          )}
        </div>
      )}

      {/* KPI grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon="💰" label="Total Revenue (30d)" value={money(stats.revenue)} trend="+22% vs last month" />
        <StatCard icon="🧾" label="Orders (30d)" value={String(stats.orderCount)} trend="+9% vs last month" />
        <StatCard icon="🏪" label="Active Stores" value={String(stats.activeStores)} trend={`${stats.pendingStores} pending approval`} />
        <StatCard icon="👥" label="Customers" value={String(stats.customers)} trend="+14% vs last month" />
      </div>

      {/* Revenue chart + top stores */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <RevenueChart series={stats.revenueSeries} title="Marketplace revenue — last 14 days" />
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-ocean-950">Top Stores</h3>
            <Link href="/admin/stores" className="text-xs font-bold text-ocean-700 hover:underline">
              All stores →
            </Link>
          </div>
          <ol className="mt-4 space-y-3">
            {stats.topStores.map((t, i) => (
              <li key={t.store.slug} className="flex items-center gap-3">
                <span className="font-display text-sm font-extrabold text-slate-300">
                  {i + 1}
                </span>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                  style={{ background: `linear-gradient(135deg, ${t.store.art.from}, ${t.store.art.to})` }}
                >
                  {t.store.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {t.store.name}
                  </p>
                  <p className="text-xs text-slate-400">{t.orderCount} orders</p>
                </div>
                <span className="font-display text-sm font-bold text-ocean-950">
                  {money(t.revenue)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Recent orders */}
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ocean-950">Latest Orders</h2>
          <Link href="/admin/orders" className="text-xs font-bold text-ocean-700 hover:underline">
            All orders →
          </Link>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">City</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                  <td className="px-5 py-3.5 font-bold text-ocean-800">{o.id}</td>
                  <td className="px-5 py-3.5 text-slate-600">{o.customer}</td>
                  <td className="px-5 py-3.5 text-slate-500">{o.city}</td>
                  <td className="px-5 py-3.5 text-slate-500">{shortDate(o.date)}</td>
                  <td className="px-5 py-3.5 font-semibold">{money(o.total)}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
