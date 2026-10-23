import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import StoreAvatar from "@/components/StoreAvatar";
import { getOffers, getProducts, getStore } from "@/lib/api";
import { money } from "@/lib/format";
import { offerReaches, rankPicks } from "@/lib/offer-picks";
import { isOfferLive, offerHeadline, offerTerms } from "@/lib/offers";
import { getT } from "@/lib/prefs-server";
import type { Offer } from "@/lib/types";

// Offers are switched on and off from the seller's dashboard.
export const dynamic = "force-dynamic";

/** Live, and public — a coupon offer has no page: its code is the way in. */
async function publicOffer(id: string): Promise<Offer | undefined> {
  const offer = (await getOffers()).find((o) => o.id === id);
  return offer && isOfferLive(offer) && !offer.code ? offer : undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offer = await publicOffer((await params).id);
  return { title: offer?.name ?? "Offer" };
}

/**
 * Every product an offer can be completed with.
 *
 * Where the cart's "See all qualifying items" and the product page's offer
 * box lead. The shop's whole catalogue used to stand in for this, so a
 * shopper chasing "Buy 1, get the next for $1" had to check every item's
 * price against the rule themselves. `?upTo=` (from the cart) keeps only
 * items cheap enough to be the discounted one.
 */
export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upTo?: string }>;
}) {
  const [{ id }, { upTo: rawUpTo }, t] = await Promise.all([params, searchParams, getT()]);
  const offer = await publicOffer(id);
  if (!offer) notFound();

  const [store, products] = await Promise.all([getStore(offer.store), getProducts()]);
  const upTo = Number(rawUpTo) > 0 ? Number(rawUpTo) : undefined;
  const reached = rankPicks(products.filter((p) => offerReaches(offer, p)));
  const shown = upTo ? reached.filter((p) => p.price <= upTo + 0.005) : reached;
  const terms = offerTerms(offer, t);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-to-r from-emerald-100 via-mango-100 to-sand-100 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {store && (
              <Link href={`/store/${store.slug}`} className="inline-flex items-center gap-2 text-sm font-bold text-ocean-800 hover:underline">
                <StoreAvatar store={store} size={28} className="h-7 w-7 rounded-lg text-sm" />
                {store.name}
              </Link>
            )}
            <h1 className="mt-2 font-display text-3xl font-extrabold text-ocean-950 sm:text-4xl">
              🎁 {offerHeadline(offer, t, money)}
            </h1>
            {terms.length > 0 && <p className="mt-1 text-sm text-slate-600">{terms.join(" · ")}</p>}
            {upTo && (
              <p className="mt-2 text-sm font-semibold text-emerald-800">
                {t("offerPage.upTo", { upTo: money(upTo) })}{" "}
                <Link href={`/offer/${offer.id}`} className="font-bold text-ocean-700 underline underline-offset-2">
                  {t("offerPage.showAll")}
                </Link>
              </p>
            )}
          </div>
          {offer.endsAt && (
            <div className="rounded-2xl bg-white/70 px-5 py-3">
              <CountdownTimer endsAt={offer.endsAt} />
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-sm text-slate-500">
        {t("offerPage.count", { n: shown.length })} ·{" "}
        <Link href="/cart" className="font-bold text-ocean-700 hover:underline">
          {t("offerPage.backToCart")} →
        </Link>
      </p>

      {shown.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="card mt-4 p-10 text-center text-sm text-slate-500">{t("offerPage.none")}</div>
      )}
    </div>
  );
}
