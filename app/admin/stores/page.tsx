import type { Metadata } from "next";
import Link from "next/link";
import { setStoreStatus, toggleStoreOfficial } from "@/app/actions";
import { getAllStores, getVendorStats } from "@/lib/api";
import { compact, money } from "@/lib/format";

export const metadata: Metadata = { title: "Stores" };

/**
 * Admin store management. Approve/Reject move applications through the
 * queue; Suspend takes an active store (and its products) off the
 * storefront until reactivated. All buttons are live (server actions).
 */
export default async function AdminStoresPage() {
  const stores = await getAllStores();
  const pending = stores.filter((s) => s.status === "pending");
  const active = stores.filter((s) => s.status === "active");
  const inactive = stores.filter((s) => s.status === "rejected" || s.status === "suspended");

  const activeWithStats = await Promise.all(
    active.map(async (store) => ({
      store,
      stats: await getVendorStats(store.slug),
    })),
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Stores</h1>
      <p className="mt-1 text-sm text-slate-500">
        {active.length} active · {pending.length} awaiting approval
        {inactive.length > 0 && ` · ${inactive.length} inactive`}
      </p>

      {/* Approval queue */}
      {pending.length > 0 && (
        <div className="mt-5 rounded-2xl border-2 border-mango-200 bg-mango-50 p-5">
          <h2 className="font-display font-bold text-mango-900">
            ⏳ Awaiting Approval ({pending.length})
          </h2>
          <div className="mt-3 space-y-3">
            {pending.map((s) => (
              <div
                key={s.slug}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                  style={{ background: `linear-gradient(135deg, ${s.art.from}, ${s.art.to})` }}
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {s.city} · applied 2026 · {s.tagline}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={setStoreStatus.bind(null, s.slug, "active")}>
                    <button className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700">
                      Approve
                    </button>
                  </form>
                  <form action={setStoreStatus.bind(null, s.slug, "rejected")}>
                    <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-100">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active stores table */}
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Store</th>
              <th className="px-5 py-3">Official Brand</th>
              <th className="px-5 py-3">City</th>
              <th className="px-5 py-3">Products</th>
              <th className="px-5 py-3">Orders (30d)</th>
              <th className="px-5 py-3">Revenue (30d)</th>
              <th className="px-5 py-3">Rating</th>
              <th className="px-5 py-3">Followers</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {activeWithStats.map(({ store, stats }) => (
              <tr key={store.slug} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                <td className="px-5 py-3.5 font-semibold text-slate-800">
                  <span className="mr-2">{store.icon}</span>
                  {store.name}
                </td>
                <td className="px-5 py-3.5">
                  <form action={toggleStoreOfficial.bind(null, store.slug)}>
                    <button
                      type="submit"
                      title={store.official ? "Click to remove Official Brand badge" : "Click to mark as Official Brand"}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                        store.official
                          ? "bg-mango-100 text-mango-800 hover:bg-mango-200"
                          : "bg-sand-100 text-slate-500 hover:bg-mango-100 hover:text-mango-800"
                      }`}
                    >
                      {store.official ? "⭐ Official Brand" : "+ Mark Official"}
                    </button>
                  </form>
                </td>
                <td className="px-5 py-3.5 text-slate-500">{store.city}</td>
                <td className="px-5 py-3.5 text-slate-600">{stats.productCount}</td>
                <td className="px-5 py-3.5 text-slate-600">{stats.orderCount}</td>
                <td className="px-5 py-3.5 font-semibold">{money(stats.revenue)}</td>
                <td className="px-5 py-3.5 text-slate-600">★ {store.rating}</td>
                <td className="px-5 py-3.5 text-slate-600">{compact(store.followers)}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/store/${store.slug}`}
                      className="text-xs font-bold text-ocean-700 hover:underline"
                    >
                      View
                    </Link>
                    <form action={setStoreStatus.bind(null, store.slug, "suspended")}>
                      <button className="text-xs font-bold text-coral-600 hover:underline">
                        Suspend
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rejected / suspended */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-lg font-bold text-ocean-950">
            Inactive stores
          </h2>
          <div className="mt-3 space-y-3">
            {inactive.map((s) => (
              <div key={s.slug} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sand-100 text-lg">
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{s.name}</p>
                  <p className="text-xs capitalize text-coral-600">{s.status}</p>
                </div>
                <form action={setStoreStatus.bind(null, s.slug, s.status === "suspended" ? "active" : "pending")}>
                  <button className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-200">
                    {s.status === "suspended" ? "Reactivate" : "Back to queue"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
