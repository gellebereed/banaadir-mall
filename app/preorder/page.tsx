import type { Metadata } from "next";
import Link from "next/link";
import { ArrivalClock, PreorderTile } from "@/components/home/PreorderShowcase";
import ShareButton from "@/components/ShareButton";
import { getListedStores, getPreorderProducts, getStore } from "@/lib/api";
import { getLang, getT } from "@/lib/prefs-server";
import { arrivalDate, daysUntilArrival } from "@/lib/preorder";
import { totalStock } from "@/lib/product-utils";
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
  const [{ store, products }, t, lang, stores] = await Promise.all([
    load(searchParams),
    getT(),
    getLang(),
    getListedStores(),
  ]);
  const storeNames = Object.fromEntries(stores.map((s) => [s.slug, s.name]));

  // One group per arrival date; the list is already sorted soonest first.
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const day = product.preorder?.arrivesAt ?? "";
    groups.set(day, [...(groups.get(day) ?? []), product]);
  }

  const path = store ? `/preorder?store=${store.slug}` : "/preorder";
  const title = store ? t("pre.page.storeTitle", { store: store.name }) : t("pre.page.title");

  // The same three facts the home showcase leads with — all from the
  // shops' own data (lib/preorder.ts), nothing invented for urgency.
  const soonest = products[0]?.preorder?.arrivesAt ?? "";
  const overdue = soonest ? daysUntilArrival(soonest) < 0 : true;
  const piecesLeft = products.reduce((n, p) => n + totalStock(p), 0);
  const maxEarly = Math.max(0, ...products.map((p) => p.preorder?.earlyPct ?? 0));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* ── The stage: the same dark, lit panel as the home page's showcase ── */}
      <section className="relative isolate overflow-hidden rounded-[28px] bg-ocean-950 text-white shadow-xl shadow-ocean-950/25">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-mango-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 -z-10 h-96 w-96 rounded-full bg-coral-500/25 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />

        <div className="p-5 sm:p-10">
          <div className="flex items-start justify-between gap-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-mango-400/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-mango-300 ring-1 ring-mango-300/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mango-300 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-mango-300" />
              </span>
              {t("pre.home.eyebrow")}
            </p>
            {products.length > 0 && (
              <div className="shrink-0 rounded-full bg-white text-ocean-950">
                <ShareButton path={path} title={title} text={`${title} — Banaadir Mall`} label={t("share.title")} />
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">{t("pre.home.sub")}</p>
              {products.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                  {soonest && (
                    <li className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                      📦 {overdue ? t("pre.anyDay") : t("pre.arrives", { date: arrivalDate(soonest, lang) })}
                    </li>
                  )}
                  <li className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                    ✨ {t("pre.home.styles", { n: products.length })}
                  </li>
                  {piecesLeft > 0 && (
                    <li className="rounded-full bg-coral-500/20 px-3 py-1.5 text-coral-100 ring-1 ring-coral-400/40">
                      🔥 {t("pre.home.pieces", { n: piecesLeft })}
                    </li>
                  )}
                  {maxEarly > 0 && (
                    <li className="rounded-full bg-mango-400 px-3 py-1.5 text-ocean-950">
                      💰 {t("pre.home.upTo", { pct: maxEarly })}
                    </li>
                  )}
                </ul>
              )}
            </div>
            {soonest && !overdue && (
              <ArrivalClock arrivesAt={soonest} label={maxEarly > 0 ? t("pre.home.earlyEndsIn") : t("pre.home.landsIn")} />
            )}
          </div>

          {/* How it works — the three promises a pre-order makes, said once, up front. */}
          {products.length > 0 && (
            <div className="mt-7 border-t border-white/10 pt-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">{t("pre.page.how")}</p>
              <ol className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  [t("pre.home.step1"), t("pre.b.choice")],
                  [t("pre.home.step2"), t("pre.b.first")],
                  [t("pre.home.step3"), t("pre.b.track")],
                ].map(([head, body], i) => (
                  <li key={head} className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10 sm:flex-row sm:gap-3 sm:p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mango-400 text-sm font-extrabold text-ocean-950">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold leading-tight sm:text-sm">{head}</span>
                      {/* The detail only where there is room; on a phone the products come first. */}
                      <span className="mt-0.5 hidden text-xs leading-snug text-white/65 sm:block">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {products.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 p-14 text-center">
          <span className="text-5xl">📦</span>
          <p className="max-w-md text-sm text-slate-500">{t("pre.page.empty")}</p>
          <Link href={store ? `/store/${store.slug}` : "/products"} className="btn-primary mt-2">
            {store ? t("store.visit") : t("nav.allProducts")}
          </Link>
        </div>
      ) : (
        [...groups.entries()].map(([day, items]) => {
          const days = daysUntilArrival(day);
          const when =
            days < 0 ? t("pre.anyDay") : days === 0 ? t("pre.today") : days === 1 ? t("pre.tomorrow") : t("pre.daysToGo", { n: days });
          return (
            <section key={day} className="mt-10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="font-display text-xl font-extrabold text-ocean-950 sm:text-2xl">
                  📦 {t("pre.arrives", { date: arrivalDate(day, lang) })}
                </h2>
                <span className="rounded-full bg-mango-100 px-2.5 py-1 text-xs font-extrabold text-mango-800 ring-1 ring-mango-200">
                  ⏳ {when}
                </span>
                <span className="text-xs font-semibold text-slate-400">{t("pre.home.styles", { n: items.length })}</span>
                <span className="hidden h-px flex-1 bg-sand-200 sm:block" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {items.map((p) => (
                  <div key={p.id} className="flex">
                    <PreorderTile product={p} storeName={storeNames[p.store]} onLight />
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* From one shop's page, the way to the rest of what is coming. */}
      {store && (
        <p className="mt-10 text-center">
          <Link href="/preorder" className="inline-flex rounded-full bg-ocean-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ocean-800">
            {t("pre.page.all")}
          </Link>
        </p>
      )}
    </div>
  );
}
