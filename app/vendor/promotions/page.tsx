import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteOffer, deletePromotion, includeSaleItemsInOffer, toggleOffer, togglePromotion } from "@/app/actions";
import MarketplaceOptIn from "@/components/dashboard/MarketplaceOptIn";
import OfferBuilder from "@/components/dashboard/OfferBuilder";
import PromotionForm from "@/components/dashboard/PromotionForm";
import {
  getAllProductsByStore,
  getBaseProductsByStore,
  getCategories,
  getDiscountMap,
  getMarketingSettings,
  getOffersByStore,
  getOrdersByStore,
  getPromotionsByStore,
  isPromotionLive,
} from "@/lib/api";
import { isOfferLive, offerCoverage, offerHeadline, offerTerms, offerUsageFrom } from "@/lib/offers";
import { getT } from "@/lib/prefs-server";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";
import type { Offer, Promotion } from "@/lib/types";

export const metadata: Metadata = { title: "Promotions" };

// Promotions change pricing across the storefront, so never serve a cached
// view of them here.
export const dynamic = "force-dynamic";

/** Human status for a promotion, including scheduled and expired states. */
function promoStatus(promo: Promotion | Offer): { label: string; tone: string } {
  const now = new Date();
  if (!promo.active) return { label: "Paused", tone: "bg-sand-100 text-slate-500" };
  if (promo.startsAt && new Date(promo.startsAt) > now) {
    return { label: "Scheduled", tone: "bg-sky-100 text-sky-700" };
  }
  if (promo.endsAt && new Date(promo.endsAt) < now) {
    return { label: "Expired", tone: "bg-slate-200 text-slate-600" };
  }
  return { label: "Live", tone: "bg-emerald-100 text-emerald-700" };
}

export default async function VendorPromotionsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "promotions.manage")) redirect("/vendor");

  const [promotions, products, categories, discounts, offers, pricedProducts, marketing, orders, t] = await Promise.all([
    getPromotionsByStore(storeSlug),
    getBaseProductsByStore(storeSlug),
    getCategories(),
    getDiscountMap(storeSlug),
    getOffersByStore(storeSlug),
    getAllProductsByStore(storeSlug),
    getMarketingSettings(),
    getOrdersByStore(storeSlug),
    getT(),
  ]);

  // How each offer has done: orders it appeared in, and what it gave away.
  const offerResults = new Map<string, { orders: number; saved: number }>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const seen = new Set<string>();
    for (const item of order.items) {
      if (!item.offer || item.listPrice === undefined || item.price === undefined) continue;
      const result = offerResults.get(item.offer) ?? { orders: 0, saved: 0 };
      if (!seen.has(item.offer)) {
        result.orders += 1;
        seen.add(item.offer);
      }
      result.saved += (item.listPrice - item.price) * item.qty;
      offerResults.set(item.offer, result);
    }
  }
  // By id — exact, and what limits and budgets are counted by.
  const usageById = offerUsageFrom(orders);
  const promoJoined = (marketing.promo.stores ?? []).includes(storeSlug);
  const campaignJoined = (marketing.campaign.stores ?? []).includes(storeSlug);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const discountedCount = Object.keys(discounts).length;
  const liveCount = promotions.filter((p) => isPromotionLive(p)).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Promotions &amp; offers</h1>
      <p className="mt-1 text-sm text-slate-500">
        Deals your shop runs and pays for: cart offers like &ldquo;buy one, get
        the next for $1&rdquo;, price discounts, and the marketplace&apos;s own
        sales — which only touch your items if you join them.
      </p>

      {/* ── Shop offers ─────────────────────────────────────────────── */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🎁 New shop offer</h2>
        <p className="mt-1 text-xs text-slate-500">
          Offers work out in the customer&apos;s cart, at checkout and at your counter. One offer
          per item — when two could apply, the customer automatically gets the better one.
        </p>
        <OfferBuilder products={pricedProducts} categories={categories} />
      </div>

      {offers.length > 0 && (
        <div className="mt-5 space-y-3">
          {offers.map((offer) => {
            const status = offer.usedUpAt
              ? { label: "Used up", tone: "bg-amber-100 text-amber-800" }
              : promoStatus(offer);
            const live = isOfferLive(offer);
            const targeted = offer.productIds?.length ?? 0;
            const byId = usageById[offer.id];
            const coverage = offerCoverage(offer, pricedProducts);
            const result = byId ? { orders: byId.uses, saved: byId.saved } : offerResults.get(offer.name);
            return (
              <div key={offer.id} className="card flex flex-wrap items-center gap-4 p-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${
                    live ? "bg-emerald-500 text-white" : "bg-sand-100 text-slate-400"
                  }`}
                  aria-hidden
                >
                  🎁
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                    {offer.name}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>
                      {status.label}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {offerHeadline(offer, t, money)}
                    {offerTerms(offer, t).map((term) => ` · ${term}`)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {targeted === 0
                      ? "Entire store"
                      : targeted <= 3
                        ? offer.productIds!.map(productName).join(", ")
                        : `${targeted} selected products`}
                    {offer.startsAt && ` · from ${shortDate(offer.startsAt.slice(0, 10))}`}
                    {offer.endsAt && ` · until ${shortDate(offer.endsAt.slice(0, 10))}`}
                    {result
                      ? ` · used in ${result.orders} order${result.orders === 1 ? "" : "s"}, customers saved ${money(result.saved)}`
                      : " · not used yet"}
                  </p>
                  {(offer.code || offer.maxUses || offer.budget) && (
                    <p className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold">
                      {offer.code && (
                        <span className="rounded-full bg-ocean-50 px-2 py-0.5 text-ocean-800 ring-1 ring-ocean-200">
                          🔒 Code {offer.code}
                        </span>
                      )}
                      {offer.maxUses && (
                        <span className="rounded-full bg-sand-100 px-2 py-0.5 text-slate-600">
                          {result?.orders ?? 0} / {offer.maxUses} orders
                        </span>
                      )}
                      {offer.budget && (
                        <span className="rounded-full bg-sand-100 px-2 py-0.5 text-slate-600">
                          {money(result?.saved ?? 0)} of {money(offer.budget)} budget
                        </span>
                      )}
                    </p>
                  )}
                  {/* Where customers will (and won't) see it — an offer that
                      reaches no product is otherwise invisible to everyone. */}
                  {coverage.eligible === 0 && coverage.onSaleSkipped > 0 ? (
                    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                      <p className="font-semibold">
                        ⚠ Customers can&apos;t see this offer: all {coverage.onSaleSkipped} product
                        {coverage.onSaleSkipped === 1 ? "" : "s"} it covers already have a &ldquo;was&rdquo;
                        price, and it is set to full-price items only.
                      </p>
                      <form action={includeSaleItemsInOffer.bind(null, offer.id)} className="mt-1.5">
                        <button className="rounded-full bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700">
                          Count sale items too
                        </button>
                      </form>
                    </div>
                  ) : coverage.eligible === 0 ? (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      ⚠ This offer covers none of your visible products.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {offer.code
                        ? `Coupon-only: applies to ${coverage.eligible} product${coverage.eligible === 1 ? "" : "s"} when the code is entered — no public badge, by design.`
                        : `Shows on ${coverage.eligible} of your ${coverage.total} products`}
                      {coverage.onSaleSkipped > 0 && ` · ${coverage.onSaleSkipped} skipped (already on sale)`}
                      {!live && !offer.code && " — once it is live"}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={toggleOffer.bind(null, offer.id)}>
                    <button
                      className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                        offer.active
                          ? "bg-sand-100 text-slate-600 hover:bg-sand-200"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      }`}
                    >
                      {offer.active ? "Pause" : "Activate"}
                    </button>
                  </form>
                  <form action={deleteOffer.bind(null, offer.id)}>
                    <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Marketplace deals: opt in ───────────────────────────────── */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🏬 Marketplace deals</h2>
        <p className="mt-1 text-xs text-slate-500">
          Run by Banaadir Mall, paid by the shops that join. Leave any time.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MarketplaceOptIn
            kind="promo"
            joined={promoJoined}
            available={Boolean(marketing.promo.code) && marketing.promo.pct > 0}
            title={marketing.promo.code ? `Promo code ${marketing.promo.code}` : "Promo code"}
            detail={
              marketing.promo.code
                ? `${marketing.promo.pct}% off your items when a customer enters ${marketing.promo.code} — on items no shop offer already discounts.`
                : "No promo code is running right now."
            }
          />
          <MarketplaceOptIn
            kind="campaign"
            joined={campaignJoined}
            available={marketing.campaign.active}
            title={marketing.campaign.name || "Site-wide sale"}
            detail={
              marketing.campaign.active
                ? `${marketing.campaign.pct}% off all your products while it runs, with the sale badge.`
                : "No site-wide sale is running right now."
            }
          />
        </div>
      </div>

      <h2 className="mt-10 font-display text-lg font-bold text-ocean-950">🏷️ Price discounts</h2>
      <p className="mt-1 text-sm text-slate-500">
        Discount your whole store or just the products you choose. Customers
        see the sale price and the crossed-out original everywhere, instantly.
      </p>

      {/* What is actually discounted right now — the real source of truth */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Running now</p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">{liveCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Products discounted</p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">
            {discountedCount}
            <span className="text-sm font-semibold text-slate-400"> / {products.length}</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Biggest discount</p>
          <p className="font-display text-2xl font-extrabold text-coral-600">
            {discountedCount > 0 ? `${Math.max(...Object.values(discounts))}%` : "—"}
          </p>
        </div>
      </div>

      {/* Create */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🏷️ New promotion</h2>
        <PromotionForm products={products} categories={categories} />
        <p className="mt-3 text-xs text-slate-400">
          If several promotions cover the same product, the biggest discount
          applies. For a permanent sale price on one product, edit that product
          instead.
        </p>
      </div>

      {/* List */}
      <div className="mt-5 space-y-3">
        {promotions.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No promotions yet — launch your first one above. 🚀
          </div>
        )}
        {promotions.map((promo) => {
          const targeted = promo.productIds?.length ?? 0;
          const status = promoStatus(promo);
          const live = isPromotionLive(promo);
          return (
            <div key={promo.id} className="card flex flex-wrap items-center gap-4 p-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold ${
                  live ? "bg-coral-500 text-white" : "bg-sand-100 text-slate-400"
                }`}
              >
                -{promo.pct}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  {promo.name}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>
                    {status.label}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {targeted === 0
                    ? "Entire store"
                    : targeted <= 3
                      ? promo.productIds!.map(productName).join(", ")
                      : `${targeted} selected products`}
                  {promo.startsAt && ` · from ${shortDate(promo.startsAt.slice(0, 10))}`}
                  {promo.endsAt && ` · until ${shortDate(promo.endsAt.slice(0, 10))}`}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={togglePromotion.bind(null, promo.id)}>
                  <button
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                      promo.active
                        ? "bg-sand-100 text-slate-600 hover:bg-sand-200"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    {promo.active ? "Pause" : "Activate"}
                  </button>
                </form>
                <form action={deletePromotion.bind(null, promo.id)}>
                  <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {/* Exactly which products are discounted, and to what */}
      {discountedCount > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold text-ocean-950">
            Currently discounted ({discountedCount})
          </h2>
          <div className="card divide-y divide-sand-100">
            {products
              .filter((p) => discounts[p.id])
              .map((p) => {
                const pct = discounts[p.id];
                const newPrice = Math.round(p.price * (1 - pct / 100) * 100) / 100;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {p.name}
                    </span>
                    <span className="text-slate-400 line-through">{money(p.price)}</span>
                    <span className="font-bold text-coral-600">{money(newPrice)}</span>
                    <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-bold text-coral-600">
                      −{pct}%
                    </span>
                    <Link
                      href={`/product/${p.slug}`}
                      className="text-xs font-bold text-ocean-700 hover:underline"
                    >
                      View →
                    </Link>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
