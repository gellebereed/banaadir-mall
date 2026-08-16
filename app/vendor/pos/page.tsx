import type { Metadata } from "next";
import Link from "next/link";
import TillClient from "@/components/pos/TillClient";
import { getOrdersByStore, getPosSettings, getProductsByStore } from "@/lib/api";
import { money } from "@/lib/format";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Sell" };

/**
 * The counter.
 *
 * Shows what the till has taken TODAY above the buttons — the one number
 * an owner checks between customers, and the reason they open this screen
 * when they are not actually selling anything.
 */
export default async function TillPage() {
  const { storeSlug } = await requireVendor();

  const [products, settings, orders] = await Promise.all([
    getProductsByStore(storeSlug),
    getPosSettings(storeSlug),
    getOrdersByStore(storeSlug),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysCounterSales = orders.filter(
    (order) =>
      order.channel === "pos" && order.date.slice(0, 10) === today && order.status !== "cancelled",
  );
  const taken = todaysCounterSales.reduce((total, order) => total + order.total, 0);

  /*
   * Sellable first, sold-out last, but nothing is HIDDEN.
   *
   * A missing tile reads as a bug to whoever is standing at the counter —
   * they know the shop sells it. A greyed-out one with "Sold out" on it
   * answers the question before it is asked.
   */
  const ordered = [...products].sort((a, b) => {
    const aOut = (a.stock ?? 0) <= 0 ? 1 : 0;
    const bOut = (b.stock ?? 0) <= 0 ? 1 : 0;
    return aOut - bOut || b.sold - a.sold || a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Sell</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tap what they are buying, take the money.
          </p>
        </div>

        <div className="rounded-2xl bg-white px-5 py-3 text-right ring-1 ring-sand-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Taken today
          </p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">
            {money(taken)}
          </p>
          <p className="text-[11px] text-slate-400">
            {todaysCounterSales.length} sale
            {todaysCounterSales.length === 1 ? "" : "s"} at the counter
          </p>
        </div>
      </div>

      <TillClient products={ordered} settings={settings} />

      <p className="mt-6 text-center text-xs text-slate-400">
        Every sale here is a real order — it shows up in your{" "}
        <Link href="/vendor/orders" className="font-semibold text-ocean-700 hover:underline">
          orders
        </Link>{" "}
        and in your{" "}
        <Link href="/vendor" className="font-semibold text-ocean-700 hover:underline">
          dashboard
        </Link>{" "}
        alongside the website.
      </p>
    </div>
  );
}
