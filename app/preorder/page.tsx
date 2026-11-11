import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import ShareButton from "@/components/ShareButton";
import { getPreorderProducts, getStore } from "@/lib/api";
import { getLang, getT } from "@/lib/prefs-server";
import { arrivalDate } from "@/lib/preorder";
import { openGraph } from "@/lib/seo";
import type { Product } from "@/lib/types";

/**
 * COMING SOON — everything that can be reserved before it lands.
 *
 * Two audiences, one page:
 *
 *   /preorder                 the whole mall's incoming stock, for browsers
 *   /preorder?store=us-polo   one shop's — THE LINK A SELLER SENDS. A shop
 *                             with a shipment on the way pastes this into
 *                             its WhatsApp broadcast, and its regulars land
 *                             on a page that is only about that shipment.
 *
 * Grouped by arrival date, soonest first, because "when" is the first
 * question about anything that is not here yet.
 */

// A pre-order opening, filling up or landing has to show at once.
export const dynamic = "force-dynamic";

type Search = Promise<{ store?: string }>;

async function load(searchParams: Search) {
  const { store: slug } = await searchParams;
  const store = slug ? await getStore(slug) : undefined;
  // An unknown shop in the link falls back to the whole mall, not an empty page.
  const products = await getPreorderProducts(store?.slug);
  return { store, products };
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { store, products } = await load(searchParams);
  const title = store ? `Coming soon at ${store.name} — pre-order now` : "Coming soon — pre-order now";
  const first = products[0];
  const description = first?.preorder
    ? `${products.length === 1 ? first.name : `${first.name} and ${products.length - 1} more`} — reserve before it lands. Arriving ${arrivalDate(first.preorder.arrivesAt)}.`
    : "New stock on its way to Banaadir Mall. Reserve yours before it reaches the shelves.";
  const url = store ? `/preorder?store=${store.slug}` : "/preorder";
  // The first product's own photo: a link in a WhatsApp chat is judged by its picture.
  const photo = first?.images?.[0];
  const images = photo ? [{ url: photo, alt: first.name }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: await openGraph({ title, description, url, images }),
    twitter: { card: "summary_large_image", title, description, ...(photo ? { images: [photo] } : {}) },
  };
}

export default async function PreorderPage({ searchParams }: { searchParams: Search }) {
  const [{ store, products }, t, lang] = await Promise.all([load(searchParams), getT(), getLang()]);

  // One group per arrival date; the list is already sorted soonest first.
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const day = product.preorder?.arrivesAt ?? "";
    groups.set(day, [...(groups.get(day) ?? []), product]);
  }

  const path = store ? `/preorder?store=${store.slug}` : "/preorder";
  const title = store ? t("pre.page.storeTitle", { store: store.name }) : t("pre.page.title");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-950 via-ocean-900 to-ocean-700 p-6 text-white sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-mango-300">
              📦 {t("pre.eyebrow")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">{t("pre.page.sub")}</p>
            {products.length > 0 && (
              <p className="mt-4 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15">
                {t("pre.page.count", { n: products.length })}
              </p>
            )}
          </div>
          {products.length > 0 && (
            <div className="shrink-0 rounded-full bg-white text-ocean-950">
              <ShareButton path={path} title={title} text={`${title} — Banaadir Mall`} label={t("share.title")} />
            </div>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 p-14 text-center">
          <span className="text-5xl">📦</span>
          <p className="max-w-md text-sm text-slate-500">{t("pre.page.empty")}</p>
          <Link href={store ? `/store/${store.slug}` : "/products"} className="btn-primary mt-2">
            {store ? t("store.visit") : t("nav.allProducts")}
          </Link>
        </div>
      ) : (
        [...groups.entries()].map(([day, items]) => (
          <section key={day} className="mt-8">
            <h2 className="flex items-baseline gap-3 font-display text-xl font-extrabold text-ocean-950">
              {t("pre.arrives", { date: arrivalDate(day, lang) })}
              <span className="h-px flex-1 bg-sand-200" />
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* From one shop's page, the way to the rest of what is coming. */}
      {store && (
        <p className="mt-10 text-center">
          <Link href="/preorder" className="text-sm font-bold text-ocean-700 hover:underline">
            {t("pre.page.all")}
          </Link>
        </p>
      )}
    </div>
  );
}
