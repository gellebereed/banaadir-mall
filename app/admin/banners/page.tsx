import { sceneBackground } from "@/lib/scenes";
import type { Metadata } from "next";
import Link from "next/link";
import BannerManager, { BannerArt } from "@/components/dashboard/banners/BannerManager";
import CampaignFeedPanel, { type CampaignRow } from "@/components/dashboard/banners/CampaignFeedPanel";
import type { LinkOption } from "@/components/dashboard/banners/LinkField";
import TileManager from "@/components/dashboard/banners/TileManager";
import CampaignTiles from "@/components/home/CampaignTiles";
import { getCategories, getListedStores, getMarketingSettings, getNewArrivals, isListedOnMarketplace } from "@/lib/api";
import { campaignCardPath, campaignFeed, isScheduledLive } from "@/lib/campaign-utils";
import { getCampaigns, homeEligible, MAX_HERO_SLIDES, MAX_TILES, planHero, planTiles, type Campaign, type HeroPlanItem } from "@/lib/campaigns";

export const metadata: Metadata = { title: "Home banners" };

// Campaigns start and stop by the clock; this page must show the moment.
export const dynamic = "force-dynamic";

/**
 * HOME BANNERS — the top of the storefront, in one place.
 *
 * The admin could edit banners before, but in a section of the long
 * Marketing page, without schedules or a preview — and the half of the
 * hero that the code filled by itself (flash deals, a shop's offer) was
 * invisible from any admin screen, so the home page did things nobody had
 * asked it to and nobody could find where to change. This page shows the
 * hero exactly as planned (planHero, the same function the home page
 * calls), the admin's banners, every campaign that can fill the hero and
 * the "Today's Campaigns" tiles by itself — with a switch and a veto —
 * and the admin's own tiles.
 */
export default async function AdminBannersPage() {
  const [m, all, categories, stores, newArrivals] = await Promise.all([
    getMarketingSettings(),
    getCampaigns(),
    getCategories(),
    getListedStores(),
    getNewArrivals(4),
  ]);

  const feed = campaignFeed(m);
  const eligible = homeEligible(all, m);
  const liveBanners = m.banners.filter((b) => isScheduledLive(b));
  const liveTiles = m.promoTiles.filter((t) => isScheduledLive(t)).slice(0, MAX_TILES);
  const officialBrands = stores.filter((s) => s.official);
  const plan = planHero({
    marketing: m,
    bannerIds: liveBanners.map((b) => b.id),
    campaigns: eligible,
    hasNewArrivals: newArrivals.length > 0,
    officialBrandCount: officialBrands.length,
  });
  const tileCampaigns = planTiles(m, eligible, liveTiles.length);

  const inHero = new Set(plan.flatMap((p) => (p.type === "campaign" ? [p.campaign.id] : [])));
  const inTiles = new Set(tileCampaigns.map((c) => c.id));
  const bannersOn = m.sections.some((s) => s.key === "banners" && s.visible);
  const tilesOn = m.sections.some((s) => s.key === "promoTiles" && s.visible);

  const rows: CampaignRow[] = all.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    headline: c.headline,
    status: c.status,
    storeName: c.store?.name,
    shopCount: c.stores.length,
    productCount: c.products.length,
    path: c.path,
    cardPath: campaignCardPath(c),
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    placements: [...(inHero.has(c.id) ? ["hero" as const] : []), ...(inTiles.has(c.id) && tilesOn ? ["tile" as const] : [])],
    reason: whyNotShown(c, feed.hidden, inHero.has(c.id) || inTiles.has(c.id)),
    hidden: feed.hidden.includes(c.id),
  }));

  const links: LinkOption[] = [
    ...all
      .filter((c) => c.status === "live" || c.status === "scheduled")
      .map((c) => ({
        group: "Campaigns",
        label: `${c.headline} · ${c.store?.name ?? c.name}${c.status === "scheduled" ? " (scheduled)" : ""}`,
        href: c.path,
      })),
    { group: "Pages", label: "All products", href: "/products" },
    { group: "Pages", label: "Biggest discounts", href: "/products?sort=discount" },
    { group: "Pages", label: "New arrivals", href: "/products?sort=new" },
    { group: "Pages", label: "Flash deals", href: "/flash" },
    { group: "Pages", label: "All shops", href: "/stores" },
    ...categories
      .filter((c) => !c.parentSlug)
      .map((c) => ({ group: "Departments", label: c.name, href: `/category/${c.slug}` })),
    ...stores.map((s) => ({ group: "Shops", label: s.name, href: `/store/${s.slug}` })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Home banners</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The top of the home page: your banners, the campaigns that fill it by themselves, and the
            &ldquo;Today&apos;s Campaigns&rdquo; tiles. Changes go live the moment you save.
          </p>
        </div>
        <Link href="/" target="_blank" className="btn-primary !px-4 !py-2 text-sm">
          View storefront ↗
        </Link>
      </div>

      {/* ── What shoppers see now ────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-ocean-950">Now on the home page</h2>
            <p className="mt-1 text-xs text-slate-500">
              The hero&apos;s slides, in the order shoppers see them. Up to {MAX_HERO_SLIDES}; the automatic
              ones at the end give way first.
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            {plan.length} slide{plan.length === 1 ? "" : "s"}
          </p>
        </div>
        {!bannersOn && m.banners.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            Your banners are switched off in the{" "}
            <Link href="/admin/marketing" className="underline">
              home page layout
            </Link>{" "}
            (the &ldquo;banners&rdquo; section), so none of them are showing.
          </p>
        )}
        <ol className="rail-scroll -mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6">
          {plan.map((item, i) => (
            <li key={planKey(item)} className="w-52 shrink-0 sm:w-60">
              <LineupCard item={item} index={i} marketing={m} banners={liveBanners} />
            </li>
          ))}
        </ol>
      </section>

      {/* ── Banners ──────────────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Your banners</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          Artwork you upload for a sale, a shop or a season. They follow the welcome slide, in this order —
          use ▲▼ to move one. Schedule a banner to go up and come down by itself.
        </p>
        <BannerManager banners={m.banners} links={links} />
      </section>

      {/* ── Campaigns ────────────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Campaigns</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          Everything on offer across the mall right now — the site-wide sale, flash deals, and the sales and
          offers shops run from their own dashboards. Each has a page and a link anyone can share.
        </p>
        <CampaignFeedPanel hero={feed.hero} tiles={feed.tiles} campaigns={rows} />
      </section>

      {/* ── Today's Campaigns ────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Today&apos;s Campaigns</h2>
        <p className="mt-1 text-xs text-slate-500">
          The strip of offers under the hero: your tiles first, then the running campaigns
          {feed.tiles ? "" : " (switched off above)"}.
        </p>
        {!tilesOn && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            This strip is switched off in the{" "}
            <Link href="/admin/marketing" className="underline">
              home page layout
            </Link>
            .
          </p>
        )}
        <div className="mt-4 rounded-2xl bg-sand-50 p-3 sm:p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">What shoppers see</p>
          {liveTiles.length + tileCampaigns.length > 0 ? (
            <CampaignTiles title="" tiles={liveTiles} campaigns={tileCampaigns} bare />
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">Nothing to show — the strip is hidden until there is.</p>
          )}
        </div>
        <h3 className="mt-6 mb-3 text-sm font-bold text-ocean-950">Your tiles</h3>
        <TileManager tiles={m.promoTiles} links={links} />
      </section>
    </div>
  );
}

/** One line on why a campaign is not on the home page, or nothing. */
function whyNotShown(c: Campaign, hidden: string[], shown: boolean): string | undefined {
  if (shown || c.status !== "live") return undefined;
  if (hidden.includes(c.id)) return "Hidden by you";
  if (c.products.length === 0) return "No products in it yet";
  if (c.store && !isListedOnMarketplace(c.store)) return "Shop is off the marketplace";
  return "Waiting for a free slot";
}

function planKey(item: HeroPlanItem): string {
  if (item.type === "banner") return `banner-${item.id}`;
  if (item.type === "campaign") return `campaign-${item.campaign.id}`;
  return item.type;
}

function LineupCard({
  item,
  index,
  marketing,
  banners,
}: {
  item: HeroPlanItem;
  index: number;
  marketing: Awaited<ReturnType<typeof getMarketingSettings>>;
  banners: Awaited<ReturnType<typeof getMarketingSettings>>["banners"];
}) {
  const tag = (text: string, tone: string) => (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{text}</span>
  );

  let art: React.ReactNode;
  let label: string;
  let kind: React.ReactNode;

  if (item.type === "banner") {
    const banner = banners.find((b) => b.id === item.id)!;
    art = <BannerArt banner={banner} frame="desktop" small />;
    label = banner.title || "Image-only banner";
    kind = tag("Your banner", "bg-ocean-100 text-ocean-800");
  } else {
    const look =
      item.type === "brand"
        ? { from: "#0c2b34", to: "#217987", big: marketing.heroTitleTop || "Welcome", small: marketing.heroBadge }
        : item.type === "campaign"
          ? { from: item.campaign.from, to: item.campaign.to, big: item.campaign.headline, small: item.campaign.store?.name ?? item.campaign.name }
          : item.type === "new"
            ? { from: "#3b2208", to: "#b5761a", big: "Just landed", small: "New arrivals" }
            : { from: "#161a38", to: "#3b4790", big: "Official brands", small: "Brand stores" };
    art = (
      <div
        className="flex aspect-[8/3] w-full flex-col justify-center rounded-xl px-3 text-white"
        style={{ background: sceneBackground(look.from, look.to) }}
      >
        <p className="truncate font-display text-sm font-extrabold">{look.big}</p>
        <p className="truncate text-[10px] text-white/80">{look.small}</p>
      </div>
    );
    label =
      item.type === "brand"
        ? "Welcome slide"
        : item.type === "campaign"
          ? item.campaign.name
          : item.type === "new"
            ? "New arrivals"
            : "Official brands";
    kind =
      item.type === "brand"
        ? tag("Always first", "bg-sand-100 text-slate-600")
        : tag("Automatic", "bg-emerald-100 text-emerald-700");
  }

  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-2">
      <div className="relative">
        {art}
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[10px] font-extrabold text-ocean-950 shadow">
          {index + 1}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <p className="truncate text-xs font-semibold text-slate-700">{label}</p>
        {kind}
      </div>
    </div>
  );
}
