import { sceneBackground } from "@/lib/scenes";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import ProductImage from "@/components/ProductImage";
import ShareButton from "@/components/ShareButton";
import StoreAvatar from "@/components/StoreAvatar";
import { campaignCardPath, campaignPath, shopDay } from "@/lib/campaign-utils";
import { getCampaign, type Campaign } from "@/lib/campaigns";
import { getT } from "@/lib/prefs-server";
import { primaryImage } from "@/lib/product-utils";
import { metaDescription, openGraph } from "@/lib/seo";
import type { Product, Store } from "@/lib/types";

// Campaigns are switched on, off and rescheduled from the dashboards.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ store?: string }>;
};

/** Most a page shows; a sale across many shops can cover thousands. */
const MAX_PRODUCTS = 60;

/** The shop sharing the site-wide sale, when the link came from one. */
function sharerOf(campaign: Campaign, slug?: string): Store | undefined {
  return slug ? campaign.stores.find((s) => s.slug === slug) : undefined;
}

function describe(campaign: Campaign, sharer?: Store): string {
  const who = campaign.store?.name ?? sharer?.name;
  const until = campaign.endsAt ? ` Until ${shopDay(campaign.endsAt)}.` : "";
  if (campaign.kind === "sale" && !who) {
    return `${campaign.headline} at ${campaign.stores.length} shops on Banaadir Mall — ${campaign.name}.${until}`;
  }
  return `${campaign.headline} at ${who} on Banaadir Mall — ${campaign.name}.${until} Pay with EVC Plus, Zaad, eDahab or cash on delivery.`;
}

/**
 * The link preview is most of the point of this page: it is what a shop's
 * customers see in WhatsApp before they decide to tap. Title leads with the
 * offer, the picture is the campaign card, and both carry the sharing
 * shop's name when the link came from one.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { store }] = await Promise.all([params, searchParams]);
  const campaign = await getCampaign(id);
  if (!campaign) return { title: "Campaign" };
  const sharer = sharerOf(campaign, store);
  const who = campaign.store?.name ?? sharer?.name;
  const title = who ? `${campaign.headline} at ${who} — ${campaign.name}` : `${campaign.headline} — ${campaign.name}`;
  const description = metaDescription(describe(campaign, sharer));
  const image = { url: campaignCardPath(campaign, sharer?.slug), width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    alternates: { canonical: campaignPath(campaign) },
    openGraph: openGraph({ title, description, url: campaignPath(campaign, sharer?.slug), images: [image] }),
    // The root layout names the site card for X; a campaign has its own.
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * A campaign's public page — where every shared campaign link lands.
 *
 * The site-wide sale and shops' price promotions live here; flash deals
 * and shop offers already had pages and are sent to them. A page for a
 * campaign that has ended still answers (with the shop's door open)
 * rather than a 404: the link will go on being tapped in old WhatsApp
 * chats for weeks, and "page not found" teaches people not to tap the
 * next one.
 */
export default async function CampaignPage({ params, searchParams }: Props) {
  const [{ id }, { store: storeParam }, t] = await Promise.all([params, searchParams, getT()]);
  const campaign = await getCampaign(id, t);
  if (!campaign) notFound();
  if (campaign.kind === "flash" || campaign.kind === "offer") redirect(campaign.path);

  const sharer = sharerOf(campaign, storeParam);
  const lead = campaign.store ?? sharer;
  const running = campaign.status === "live";
  const products = campaign.products.slice(0, MAX_PRODUCTS);
  const mine = sharer ? products.filter((p) => p.store === sharer.slug) : [];
  const others = sharer ? products.filter((p) => p.store !== sharer.slug) : products;
  // Photos first; a shop without any still gets its products' artwork.
  const showcase = [...(mine.length ? mine : products)]
    .sort((a, b) => Number(Boolean(primaryImage(b))) - Number(Boolean(primaryImage(a))))
    .slice(0, 4);
  const kindLabel = t(`campaign.kind.${campaign.kind}` as Parameters<typeof t>[0]);
  const shareText = lead
    ? `${campaign.headline} at ${lead.name} — ${campaign.name}`
    : `${campaign.headline} — ${campaign.name} on Banaadir Mall`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* ── The offer ──────────────────────────────────────────────── */}
      <section
        className="relative isolate overflow-hidden rounded-3xl text-white shadow-lg"
        style={{ background: sceneBackground(campaign.from, campaign.to) }}
      >
        <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-40 left-1/3 -z-10 h-80 w-80 rounded-full bg-black/10" />

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_26rem] lg:items-center lg:p-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
                {kindLabel}
              </span>
              {!running && (
                <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  {campaign.status === "scheduled" ? t("campaign.soon.title") : t("section.ended")}
                </span>
              )}
            </div>

            {lead && (
              <Link
                href={`/store/${lead.slug}`}
                className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/15 py-1.5 pl-1.5 pr-4 ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
              >
                <StoreAvatar store={lead} size={40} className="h-10 w-10 rounded-xl text-lg ring-2 ring-white/70" />
                <span className="font-display text-base font-extrabold">{lead.name}</span>
              </Link>
            )}

            <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-tight drop-shadow-sm sm:text-7xl">
              {campaign.headline}
            </h1>
            <p className="mt-2 font-display text-xl font-bold text-white/90 sm:text-2xl">{campaign.name}</p>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90">
              {running && campaign.endsAt && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                  {t("campaign.endsIn")} <CountdownTimer endsAt={campaign.endsAt} />
                </span>
              )}
              {campaign.status === "scheduled" && campaign.startsAt && (
                <span className="rounded-full bg-white/20 px-3 py-1.5 font-semibold">
                  {t("campaign.starts", { date: shopDay(campaign.startsAt) })}
                </span>
              )}
              {campaign.kind === "sale" && campaign.stores.length > 0 && (
                <span className="font-semibold">
                  {campaign.stores.length === 1
                    ? t("campaign.shop")
                    : t("campaign.shops", { n: campaign.stores.length })}
                </span>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {running && products.length > 0 ? (
                <a
                  href="#products"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-extrabold text-ocean-950 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {t("campaign.cta")} ↓
                </a>
              ) : (
                <Link
                  href={lead ? `/store/${lead.slug}` : "/products"}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-extrabold text-ocean-950 shadow-md transition hover:-translate-y-0.5"
                >
                  {lead ? t("campaign.visitShop", { store: lead.name }) : t("campaign.browse")} →
                </Link>
              )}
              <ShareButton
                path={campaignPath(campaign, sharer?.slug)}
                title={campaign.name}
                text={shareText}
                label={t("campaign.share")}
              />
            </div>
          </div>

          {showcase.length > 0 && (
            <div className="hidden grid-cols-2 gap-3 lg:grid">
              {showcase.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  className={`group relative aspect-square overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 transition hover:-translate-y-1 ${
                    i % 2 === 1 ? "translate-y-4" : ""
                  }`}
                >
                  <ProductImage product={p} sizes="200px" className="h-full w-full transition duration-500 group-hover:scale-105" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Not running: say so, kindly ───────────────────────────── */}
      {!running && (
        <div className="mt-6 rounded-3xl bg-sand-50 p-6 text-center ring-1 ring-sand-200 sm:p-8">
          <p className="font-display text-lg font-extrabold text-ocean-950">
            {campaign.status === "scheduled" ? t("campaign.soon.title") : t("campaign.ended.title")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {campaign.status === "scheduled" ? t("campaign.soon.body") : t("campaign.ended.body")}
          </p>
        </div>
      )}

      {/* ── Shops in the site-wide sale ───────────────────────────── */}
      {running && campaign.kind === "sale" && campaign.stores.length > 1 && (
        <div className="rail-scroll -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link
            href={campaignPath(campaign)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              !sharer ? "bg-ocean-950 text-white" : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
            }`}
          >
            All shops
          </Link>
          {campaign.stores.map((s) => (
            <Link
              key={s.slug}
              href={campaignPath(campaign, s.slug)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-bold transition ${
                sharer?.slug === s.slug
                  ? "bg-ocean-950 text-white"
                  : "bg-white text-slate-700 ring-1 ring-sand-200 hover:ring-ocean-300"
              }`}
            >
              <StoreAvatar store={s} size={28} className="h-7 w-7 rounded-full text-sm" />
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {/* ── The products ──────────────────────────────────────────── */}
      {running && (
        <div id="products" className="scroll-mt-24">
          {products.length === 0 ? (
            <p className="mt-8 rounded-2xl bg-sand-50 px-4 py-10 text-center text-sm text-slate-500">{t("campaign.empty")}</p>
          ) : (
            <>
              {mine.length > 0 && <Grid title={t("campaign.fromShop", { store: sharer!.name })} products={mine} />}
              {others.length > 0 && (
                <Grid
                  title={
                    mine.length > 0
                      ? t("campaign.moreShops")
                      : t("campaign.products", { n: campaign.products.length })
                  }
                  products={others}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Grid({ title, products }: { title: string; products: Product[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 font-display text-lg font-extrabold text-ocean-950">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
