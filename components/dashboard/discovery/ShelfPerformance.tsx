import Link from "next/link";
import { money } from "@/lib/format";
import type { ShelfStats } from "@/lib/reco/metrics";
import type { ShelfInfo } from "@/lib/reco/catalogue";

const SURFACE_NAMES: Record<string, string> = {
  home: "Home",
  product: "Product page",
  cart: "Cart",
  wishlist: "Wishlist",
  confirmation: "Order confirmation",
};

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/**
 * What each recommendation shelf earns: seen → tapped → basket → bought.
 * Counts only, never people (lib/reco/metrics.ts).
 */
export default function ShelfPerformance({
  rows,
  stored,
  days,
  shelves,
}: {
  rows: ShelfStats[];
  stored: boolean;
  days: number;
  shelves: ShelfInfo[];
}) {
  const title = (surface: string, id: string) =>
    shelves.find((s) => s.id === id && s.surface === surface)?.title ?? shelves.find((s) => s.id === id)?.title ?? id;
  const total = rows.reduce(
    (t, r) => ({
      impressions: t.impressions + r.impressions,
      clicks: t.clicks + r.clicks,
      carts: t.carts + r.carts,
      orders: t.orders + r.orders,
      revenue: t.revenue + r.revenue,
    }),
    { impressions: 0, clicks: 0, carts: 0, orders: 0, revenue: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-display text-lg font-extrabold text-ocean-950">What the shelves earn</p>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Seen → tapped → added to basket → bought, for each recommendation shelf. A sale counts when the
            product was tapped on that shelf within the previous 7 days. Counts only — no shopper is identified.
          </p>
        </div>
        <div className="flex gap-1.5 text-sm">
          {[7, 30].map((d) => (
            <Link
              key={d}
              href={`/admin/discovery?tab=results&days=${d}`}
              className={`rounded-full px-3 py-1.5 font-semibold ${
                days === d ? "bg-ocean-800 text-white" : "bg-white text-slate-600 ring-1 ring-sand-200"
              }`}
            >
              {d} days
            </Link>
          ))}
        </div>
      </div>

      {!stored && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Not recording yet — run <code className="rounded bg-white px-1">supabase/migration-reco-metrics.sql</code> in
          Supabase.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Shelf views", value: total.impressions.toLocaleString() },
          { label: "Taps", value: `${total.clicks.toLocaleString()} · ${pct(total.clicks, total.impressions)}` },
          { label: "Orders from shelves", value: total.orders.toLocaleString() },
          { label: "Revenue from shelves", value: money(total.revenue) },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-ocean-950">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-sand-200 bg-sand-50/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Shelf</th>
              <th className="px-3 py-3 text-right">Seen</th>
              <th className="px-3 py-3 text-right">Tapped</th>
              <th className="px-3 py-3 text-right" title="Taps per view">Tap rate</th>
              <th className="px-3 py-3 text-right">To basket</th>
              <th className="px-3 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No shelf activity in the last {days} days yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.surface}|${r.shelf}`}>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-800">{title(r.surface, r.shelf)}</span>
                  <span className="block text-xs text-slate-400">{SURFACE_NAMES[r.surface] ?? r.surface}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{pct(r.clicks, r.impressions)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.carts.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.orders.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
