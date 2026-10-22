import PendingButton from "@/components/dashboard/PendingButton";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { includeSaleItemsInOffer, toggleOffer } from "@/app/actions";
import DailyBars from "@/components/dashboard/DailyBars";
import { getAllProductsByStore, getOffersByStore, getOrdersByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { money } from "@/lib/format";
import { offerCoverage, offerHeadline, offerTerms, isOfferLive } from "@/lib/offers";
import { offerResults } from "@/lib/offer-results";
import { getT } from "@/lib/prefs-server";
import { requireVendor } from "@/lib/session";
import { formatShopTime } from "@/lib/shop-time";

export const metadata: Metadata = { title: "Offer results" };
export const dynamic = "force-dynamic";

/**
 * How one offer has done: what it sold, what it cost the shop, and whether
 * orders with it are bigger than orders without — the question a seller
 * actually has before keeping an offer running.
 */
export default async function OfferResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "promotions.manage")) redirect("/vendor");

  const [offers, orders, products, t] = await Promise.all([
    getOffersByStore(storeSlug),
    getOrdersByStore(storeSlug),
    getAllProductsByStore(storeSlug),
    getT(),
  ]);
  const offer = offers.find((o) => o.id === id);
  if (!offer) notFound();

  const r = offerResults(offer, orders);
  const coverage = offerCoverage(offer, products);
  const live = isOfferLive(offer);
  const lift = r.avgWith !== null && r.avgWithout ? (r.avgWith - r.avgWithout) / r.avgWithout : null;
  const share = r.ordersSince ? r.orders / r.ordersSince : 0;

  const tiles: { label: string; value: string; note?: string }[] = [
    { label: "Orders with this offer", value: String(r.orders), note: r.ordersSince ? `${Math.round(share * 100)}% of ${r.ordersSince} orders since it started` : undefined },
    { label: "Revenue from those orders", value: money(r.revenue) },
    { label: "Customers saved (your cost)", value: money(r.saved), note: r.revenue ? `${((r.saved / (r.revenue + r.saved)) * 100).toFixed(1)}% of full price` : undefined },
    {
      label: "Average order",
      value: r.avgWith !== null ? money(r.avgWith) : "—",
      note:
        lift !== null
          ? `${lift >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(lift * 100))}% vs ${money(r.avgWithout!)} without it`
          : r.avgWithout !== null
            ? `${money(r.avgWithout)} without it`
            : undefined,
    },
  ];

  return (
    <div>
      <Link href="/vendor/promotions" className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Promotions &amp; offers
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">🎁 {offer.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {offerHeadline(offer, t, money)}
            {offerTerms(offer, t).map((term) => ` · ${term}`)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {offer.usedUpAt
              ? `Used up on ${formatShopTime(offer.usedUpAt)}`
              : live
                ? "Live now"
                : offer.active
                  ? offer.startsAt
                    ? `Scheduled · starts ${formatShopTime(offer.startsAt)}`
                    : "Ended"
                  : "Paused"}
            {offer.createdAt && ` · created ${formatShopTime(offer.createdAt)}`}
            {` · shows on ${coverage.eligible} of ${coverage.total} products`}
          </p>
        </div>
        <form action={toggleOffer.bind(null, offer.id)}>
          <PendingButton
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              offer.active ? "bg-sand-100 text-slate-600 hover:bg-sand-200" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {offer.active ? "Pause offer" : "Switch on"}
          </PendingButton>
        </form>
      </div>

      {coverage.eligible === 0 && coverage.onSaleSkipped > 0 && (
        <form
          action={includeSaleItemsInOffer.bind(null, offer.id)}
          className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          ⚠ Customers can&apos;t see this offer — every product it covers already has a &ldquo;was&rdquo; price.
          <button className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">Count sale items too</button>
        </form>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-xs font-medium text-slate-500">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ocean-950">{tile.value}</p>
            {tile.note && <p className="mt-0.5 text-[11px] text-slate-500">{tile.note}</p>}
          </div>
        ))}
      </div>

      {(offer.maxUses || offer.budget) && (
        <div className="card mt-3 space-y-3 p-4">
          {offer.maxUses && <Meter label="Orders" used={r.orders} limit={offer.maxUses} format={String} />}
          {offer.budget && <Meter label="Budget" used={r.saved} limit={offer.budget} format={money} />}
        </div>
      )}

      <section className="card mt-5 p-5">
        <h2 className="font-display font-bold text-ocean-950">Orders with this offer — last 30 days</h2>
        <div className="mt-3">
          <DailyBars
            label="orders"
            data={r.daily.map((d) => ({ date: d.date, value: d.orders, detail: d.orders ? money(d.revenue) : undefined }))}
          />
        </div>
        {/* The same numbers as a table, for anyone who would rather read them. */}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-ocean-700">Show as a table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 font-semibold">Day</th>
                <th className="py-1 text-right font-semibold">Orders</th>
                <th className="py-1 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {r.daily
                .filter((d) => d.orders > 0)
                .map((d) => (
                  <tr key={d.date}>
                    <td className="py-1">{d.date}</td>
                    <td className="py-1 text-right tabular-nums">{d.orders}</td>
                    <td className="py-1 text-right tabular-nums">{money(d.revenue)}</td>
                  </tr>
                ))}
              {r.daily.every((d) => d.orders === 0) && (
                <tr>
                  <td colSpan={3} className="py-2 text-slate-400">No orders with this offer in the last 30 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card mt-5 p-5">
        <h2 className="font-display font-bold text-ocean-950">What it sold</h2>
        {r.topProducts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing yet.{" "}
            {live
              ? "It shows on your products and in carts — results appear here as orders come in."
              : offer.active && offer.startsAt
                ? `It starts ${formatShopTime(offer.startsAt)} — results appear here once orders come in.`
                : "Switch it on to start selling."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-100 text-sm">
            {r.topProducts.map((p) => (
              <li key={p.productId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-slate-700">{p.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {p.units} unit{p.units === 1 ? "" : "s"} · saved {money(p.saved)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Meter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (n: number) => string }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="text-slate-500">
          {format(used)} of {format(limit)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "bg-ocean-600"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
