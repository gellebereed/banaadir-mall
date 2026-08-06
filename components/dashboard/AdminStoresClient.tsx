"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deleteStore, setStoreStatus, toggleStoreOfficial } from "@/app/actions";
import StoreAvatar from "@/components/StoreAvatar";
import { compact, money } from "@/lib/format";
import type { Store } from "@/lib/types";

interface StoreWithStats {
  store: Store;
  stats: {
    revenue: number;
    orderCount: number;
    productCount: number;
  };
}

export default function AdminStoresClient({
  storesWithStats,
  pendingStores,
  inactiveStores,
}: {
  storesWithStats: StoreWithStats[];
  pendingStores: Store[];
  inactiveStores: Store[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "official" | "pending" | "inactive">("all");
  const [isPending, startTransition] = useTransition();
  /** The store the admin is being asked to confirm deleting. */
  const [deleting, setDeleting] = useState<Store | null>(null);

  const officialCount = useMemo(
    () => storesWithStats.filter(({ store }) => store.official).length,
    [storesWithStats]
  );

  const totalRevenue = useMemo(
    () => storesWithStats.reduce((sum, { stats }) => sum + stats.revenue, 0),
    [storesWithStats]
  );

  const filteredStores = useMemo(() => {
    let list = storesWithStats;

    if (filter === "official") {
      list = list.filter(({ store }) => store.official);
    }

    if (!query.trim()) return list;

    const q = query.toLowerCase();
    return list.filter(
      ({ store }) =>
        store.name.toLowerCase().includes(q) ||
        store.slug.toLowerCase().includes(q) ||
        store.city.toLowerCase().includes(q) ||
        store.category.toLowerCase().includes(q) ||
        store.tagline.toLowerCase().includes(q)
    );
  }, [storesWithStats, filter, query]);

  return (
    <div className="space-y-6">
      {/* ── Metric Summary Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <span className="text-2xl">🏪</span>
          <p className="mt-2 font-display text-2xl font-extrabold text-ocean-950">
            {storesWithStats.length}
          </p>
          <p className="text-xs text-slate-500 font-medium">Active Stores</p>
        </div>

        <div className="card p-4">
          <span className="text-2xl">⭐</span>
          <p className="mt-2 font-display text-2xl font-extrabold text-mango-950">
            {officialCount}
          </p>
          <p className="text-xs text-mango-700 font-bold">Official Brands</p>
        </div>

        <div className="card p-4">
          <span className="text-2xl">⏳</span>
          <p className="mt-2 font-display text-2xl font-extrabold text-amber-950">
            {pendingStores.length}
          </p>
          <p className="text-xs text-amber-700 font-medium">Awaiting Approval</p>
        </div>

        <div className="card p-4">
          <span className="text-2xl">💰</span>
          <p className="mt-2 font-display text-2xl font-extrabold text-emerald-950">
            {money(totalRevenue)}
          </p>
          {/* All-time, like every figure on this page — see getVendorStats.
              For a windowed view with period-on-period change, the dashboard
              at /admin has the range filter. */}
          <p className="text-xs text-emerald-700 font-medium">Total Volume (all time)</p>
        </div>
      </div>

      {/* ── Pending Approval Queue Callout ─────────────────────────── */}
      {pendingStores.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-sm animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
            <div>
              <h2 className="font-display text-lg font-extrabold text-amber-950 flex items-center gap-2">
                <span>⏳</span>
                <span>Pending Store Applications ({pendingStores.length})</span>
              </h2>
              <p className="text-xs text-amber-800">
                New vendors awaiting review. Approve to grant store dashboard access and list on storefront.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pendingStores.map((s) => (
              <div
                key={s.slug}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm border border-amber-100"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <StoreAvatar store={s} size={48} className="h-12 w-12 rounded-2xl border border-sand-200 shadow-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 truncate">{s.name}</p>
                      <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {s.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      📍 {s.city} · {s.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <form
                    action={async () => {
                      startTransition(async () => {
                        await setStoreStatus(s.slug, "active");
                      });
                    }}
                  >
                    <button
                      type="submit"
                      disabled={isPending}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isPending ? "Approving…" : "✓ Approve Store"}
                    </button>
                  </form>
                  <form
                    action={async () => {
                      startTransition(async () => {
                        await setStoreStatus(s.slug, "rejected");
                      });
                    }}
                  >
                    <button
                      type="submit"
                      disabled={isPending}
                      className="rounded-full border border-coral-400 px-3.5 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-50 hover:text-coral-800 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Stores Section ───────────────────────────────────── */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-xl text-ocean-950">Store Directory</h2>
            <p className="text-xs text-slate-500">Manage all registered merchant stores and official brand franchises.</p>
          </div>

          {/* Search & Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by store name or city…"
                className="input py-2 pl-9 pr-4 text-xs w-60"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                filter === "all" ? "bg-ocean-800 text-white" : "bg-sand-100 text-slate-600 hover:bg-sand-200"
              }`}
            >
              All ({storesWithStats.length})
            </button>

            <button
              type="button"
              onClick={() => setFilter("official")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                filter === "official" ? "bg-mango-500 text-white" : "bg-mango-100 text-mango-800 hover:bg-mango-200"
              }`}
            >
              ⭐ Official ({officialCount})
            </button>

            {inactiveStores.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter("inactive")}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  filter === "inactive" ? "bg-slate-700 text-white" : "bg-sand-100 text-slate-500 hover:bg-sand-200"
                }`}
              >
                🙈 Inactive ({inactiveStores.length})
              </button>
            )}
          </div>
        </div>

        {filter === "inactive" ? (
          /* Inactive Stores View */
          <div className="mt-5 space-y-3">
            {inactiveStores.map((s) => (
              <div key={s.slug} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sand-200 p-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <StoreAvatar store={s} size={44} className="h-11 w-11 rounded-2xl border border-sand-200" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                    <p className="text-xs text-coral-600 font-medium capitalize">Status: {s.status}</p>
                  </div>
                </div>
                <form
                  action={async () => {
                    startTransition(async () => {
                      await setStoreStatus(s.slug, s.status === "suspended" ? "active" : "pending");
                    });
                  }}
                >
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200 disabled:opacity-50"
                  >
                    {s.status === "suspended" ? "Reactivate Store" : "Back to Approval Queue"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          /* Active Stores Table */
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-sand-200 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Brand Store</th>
                  <th className="px-4 py-3">Official Status</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3 text-center">Products</th>
                  <th className="px-4 py-3 text-center">Orders</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-center">Rating</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {filteredStores.map(({ store, stats }) => (
                  <tr key={store.slug} className="hover:bg-sand-50/80 transition">
                    {/* Store Logo & Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <StoreAvatar
                          store={store}
                          size={44}
                          className="h-11 w-11 shrink-0 rounded-2xl border border-sand-200 shadow-xs"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 hover:text-ocean-700 truncate">
                            {store.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate max-w-xs">{store.tagline}</p>
                        </div>
                      </div>
                    </td>

                    {/* Official Brand Toggle */}
                    <td className="px-4 py-3.5">
                      <form
                        action={async () => {
                          startTransition(async () => {
                            await toggleStoreOfficial(store.slug);
                          });
                        }}
                      >
                        <button
                          type="submit"
                          disabled={isPending}
                          title={store.official ? "Click to remove Official Brand badge" : "Click to set as Official Brand"}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
                            store.official
                              ? "bg-mango-100 text-mango-900 border border-mango-300 hover:bg-mango-200"
                              : "bg-sand-100 text-slate-500 hover:bg-mango-100 hover:text-mango-900"
                          }`}
                        >
                          {store.official ? "⭐ Official Brand" : "+ Mark Official"}
                        </button>
                      </form>
                    </td>

                    {/* City */}
                    <td className="px-4 py-3.5 text-xs text-slate-600 font-medium">{store.city}</td>

                    {/* Products Count */}
                    <td className="px-4 py-3.5 text-center text-xs font-semibold text-slate-700">
                      {stats.productCount}
                    </td>

                    {/* Orders Count */}
                    <td className="px-4 py-3.5 text-center text-xs font-semibold text-slate-700">
                      {stats.orderCount}
                    </td>

                    {/* Revenue */}
                    <td className="px-4 py-3.5 text-right font-display text-sm font-bold text-ocean-950">
                      {money(stats.revenue)}
                    </td>

                    {/* Rating */}
                    <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-700">
                      ★ {store.rating || 5.0}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/store/${store.slug}`}
                          className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold text-ocean-800 transition hover:bg-ocean-100"
                        >
                          View
                        </Link>

                        <form
                          action={async () => {
                            if (!confirm(`Are you sure you want to suspend ${store.name}?`)) return;
                            startTransition(async () => {
                              await setStoreStatus(store.slug, "suspended");
                            });
                          }}
                        >
                          <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-full border border-coral-300 px-3 py-1 text-xs font-bold text-coral-600 transition hover:bg-coral-50 hover:text-coral-800 disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        </form>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setDeleting(store)}
                          className="rounded-full border border-sand-300 px-3 py-1 text-xs font-bold text-slate-500 transition hover:border-coral-500 hover:bg-coral-50 hover:text-coral-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredStores.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                      No stores found matching your query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleting && (
        <DeleteStoreDialog
          store={deleting}
          stats={storesWithStats.find((entry) => entry.store.slug === deleting.slug)?.stats}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/**
 * Confirmation for deleting a store.
 *
 * Typing the store's name is not friction for its own sake. This removes a
 * seller's entire catalogue and cannot be undone, and it sits two pixels
 * from "Suspend" — which is reversible and is what an admin usually wants.
 * A browser `confirm()` is one reflexive Enter away from wiping the wrong
 * shop; typing the name cannot be done by accident.
 *
 * The dialog also states plainly what SURVIVES. Orders are a customer's
 * receipt and a financial record, and an admin needs to know they are not
 * signing away their sales history to remove a vendor.
 */
function DeleteStoreDialog({
  store,
  stats,
  onCancel,
}: {
  store: Store;
  stats?: { revenue: number; orderCount: number; productCount: number };
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();
  const confirmed = typed.trim().toLowerCase() === store.name.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/50 p-4 sm:p-6 overflow-y-auto backdrop-blur-sm">
      <div className="my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-100 text-xl">
            ⚠️
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-ocean-950">
              Delete {store.name}?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This cannot be undone.
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-1.5 rounded-2xl bg-coral-50 p-4 text-sm text-coral-800">
          <li>
            • <strong>{stats?.productCount ?? 0}</strong> product
            {stats?.productCount === 1 ? "" : "s"} removed from the catalogue
          </li>
          <li>• Their promotions, staff logins and guides</li>
          <li>
            • The owner login{" "}
            <code className="font-mono text-xs">{store.slug}@seller…</code> stops working
          </li>
        </ul>

        <p className="mt-3 rounded-2xl bg-sand-50 p-3 text-xs leading-relaxed text-slate-500">
          <strong className="text-slate-700">Orders are kept.</strong> They are your
          customers&apos; receipts and your sales record — removing a vendor
          doesn&apos;t undo their {stats?.orderCount ?? 0} order
          {stats?.orderCount === 1 ? "" : "s"}.
        </p>

        <label className="label mt-5" htmlFor="confirm-store-name">
          Type <strong className="text-ocean-900">{store.name}</strong> to confirm
        </label>
        <input
          id="confirm-store-name"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          className="input"
          placeholder={store.name}
        />

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-slate-500 transition hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteStore(store.slug);
                onCancel();
              })
            }
            className="rounded-full bg-coral-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-coral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
