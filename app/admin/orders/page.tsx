import type { Metadata } from "next";
import Link from "next/link";
import OrderStatusSelect from "@/components/dashboard/OrderStatusSelect";
import ParcelPayment from "@/components/dashboard/ParcelPayment";
import { getOrders, getStores } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { applyFilters, inRange, needsAttention, readFilters, STATUSES, type OrderFilters } from "./filters";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  pending: "Order placed",
  processing: "Being packed",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Every order on the marketplace — searchable, filterable by status, shop
 * and date, with the ones that need a look surfaced first and an export of
 * exactly what's on screen. Filters live in the URL, so a filtered view can
 * be bookmarked or sent to a colleague.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = readFilters(params);
  const page = Math.max(1, Number(params.page) || 1);

  const [orders, stores] = await Promise.all([getOrders(), getStores()]);
  const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name ?? slug.replace(/-/g, " ");

  const ranged = inRange(orders, filters.range);
  const forCounts = applyFilters(ranged, { ...filters, status: "" }, storeName);
  const rows = applyFilters(ranged, filters, storeName);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const live = ranged.filter((o) => o.status !== "cancelled");
  const revenue = live.reduce((t, o) => t + o.total, 0);
  const attention = forCounts.filter((o) => needsAttention(o)).length;

  /** The same URL with some filters changed (and back to page 1). */
  const href = (change: Partial<OrderFilters> & { page?: number }) => {
    const next = { ...filters, ...change };
    const qs = new URLSearchParams();
    if (next.status) qs.set("status", next.status);
    if (next.store) qs.set("store", next.store);
    if (next.q) qs.set("q", next.q);
    if (next.range !== "all") qs.set("range", next.range);
    if (change.page && change.page > 1) qs.set("page", String(change.page));
    const s = qs.toString();
    return `/admin/orders${s ? `?${s}` : ""}`;
  };
  const exportHref = href({}).replace("/admin/orders", "/admin/orders/export");

  const chips: { key: OrderFilters["status"]; label: string; count: number; tone?: string }[] = [
    { key: "", label: "All", count: forCounts.length },
    { key: "attention", label: "⚠ Needs attention", count: attention, tone: "amber" },
    ...STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: forCounts.filter((o) => o.status === s).length })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ranged.length} order{ranged.length === 1 ? "" : "s"}
            {filters.range === "all" ? " in total" : ` in the last ${filters.range} days`}
          </p>
        </div>
        <a href={exportHref} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ocean-800 ring-1 ring-sand-200 hover:ring-ocean-300">
          ⬇ Export CSV ({rows.length})
        </a>
      </div>

      {/* The numbers that matter */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Orders", value: String(live.length), note: `${ranged.length - live.length} cancelled` },
          { label: "Revenue", value: money(revenue), note: "excluding cancelled" },
          { label: "Average order", value: live.length ? money(revenue / live.length) : "—" },
          { label: "Needs attention", value: String(attention), note: "waiting 2+ days, unpaid 48h+, or no driver", warn: attention > 0 },
        ].map((tile) => (
          <div key={tile.label} className={`card p-4 ${tile.warn ? "ring-1 ring-amber-300" : ""}`}>
            <p className="text-xs font-medium text-slate-500">{tile.label}</p>
            <p className={`mt-1 font-display text-2xl font-extrabold ${tile.warn ? "text-amber-700" : "text-ocean-950"}`}>{tile.value}</p>
            {tile.note && <p className="text-[11px] text-slate-400">{tile.note}</p>}
          </div>
        ))}
      </div>

      {/* Filters: search, shop, period — a plain GET form, so it works
          without JavaScript and the URL is the state. */}
      <form className="mt-5 flex flex-wrap items-center gap-2" action="/admin/orders">
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="🔍 Order #, customer, phone, email, item…"
          aria-label="Search orders"
          className="input !py-2 text-sm sm:max-w-sm"
        />
        <select name="store" defaultValue={filters.store} aria-label="Shop" className="input !w-auto !py-2 text-sm">
          <option value="">All shops</option>
          {stores.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="range" defaultValue={filters.range} aria-label="Period" className="input !w-auto !py-2 text-sm">
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button className="btn-primary !px-5 !py-2 text-sm">Apply</button>
        {(filters.q || filters.store || filters.range !== "all" || filters.status) && (
          <Link href="/admin/orders" className="text-sm font-semibold text-coral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = filters.status === c.key;
          return (
            <Link
              key={c.key || "all"}
              href={href({ status: c.key })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                active
                  ? "bg-ocean-800 text-white"
                  : c.tone === "amber" && c.count > 0
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                    : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
              }`}
            >
              {c.label} <span className={active ? "text-ocean-100" : "text-slate-400"}>{c.count}</span>
            </Link>
          );
        })}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 bg-sand-50/70 text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No orders match these filters.
                </td>
              </tr>
            )}
            {shown.map((o) => {
              const flagged = needsAttention(o);
              const units = o.items.reduce((t, i) => t + i.qty, 0);
              return (
                <tr key={o.id} className={`border-b border-sand-100 align-top last:border-0 ${flagged ? "bg-amber-50/50" : "hover:bg-sand-50"}`}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/track?id=${o.id}`} className="font-mono font-bold text-ocean-800 hover:underline">
                      {o.id}
                    </Link>
                    <p className="text-xs text-slate-500">{shortDate(o.date)}</p>
                    {flagged && (
                      <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                        {o.status === "shipped" ? "⚠ No driver" : "⚠ Waiting 2+ days"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{o.customer}</p>
                    <p className="text-xs text-slate-500">
                      {o.city}
                      {o.phone && ` · ${o.phone}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <Link href={href({ store: o.store })} className="hover:text-ocean-700 hover:underline">
                      {storeName(o.store)}
                    </Link>
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-xs text-slate-600">
                    <p className="truncate">{o.items[0]?.name ?? o.items[0]?.productId}</p>
                    <p className="text-slate-400">
                      {units} unit{units === 1 ? "" : "s"}
                      {o.items.length > 1 && ` · ${o.items.length} products`}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{money(o.total)}</td>
                  <td className="px-4 py-3">
                    <OrderStatusSelect orderId={o.id} status={o.status} />
                    {/* Read-only here: only the shop knows whether its customer paid. */}
                    <div className="mt-1.5">
                      <ParcelPayment order={o} mayManage={false} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
          <span className="text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="rounded-full bg-white px-4 py-1.5 font-semibold ring-1 ring-sand-200 hover:ring-ocean-300">
                ← Newer
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="rounded-full bg-white px-4 py-1.5 font-semibold ring-1 ring-sand-200 hover:ring-ocean-300">
                Older →
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
