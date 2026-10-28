import Image from "next/image";
import Link from "next/link";
import HeroCarousel, { type HeroSlide } from "@/components/home/HeroCarousel";
import QuickNav from "@/components/home/QuickNav";
import FlashDealsRail from "@/components/home/FlashDealsRail";
import BudgetPicks, { type BudgetBand } from "@/components/home/BudgetPicks";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import RecoStack from "@/components/reco/RecoStack";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import StoreCard from "@/components/StoreCard";
import ProductImage from "@/components/ProductImage";
import CampaignTiles from "@/components/home/CampaignTiles";
import { campaignPath, isScheduledLive, SALE_CAMPAIGN_ID, shopDay } from "@/lib/campaign-utils";
import { PALETTES } from "@/lib/scenes";
import { getCampaigns, homeEligible, MAX_TILES, planHero, planTiles, type Campaign } from "@/lib/campaigns";
import { discountPct, money } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getLang, getT } from "@/lib/prefs-server";
import { localizeMarketing } from "@/lib/marketing-copy";
import { RAIL_CARD } from "@/lib/card-sizes";
import type { T } from "@/lib/i18n";
import {
  getBestsellers,
  getFlashDeal,
  getFlashProducts,
  getListedStores,
  getMarketingSettings,
  getMarketplaceProducts,
  getNewArrivals,
  getOrders,
  getShopperCategories,
} from "@/lib/api";
import type { MarketingSettings, Order, Product, SectionKey, Store } from "@/lib/types";
import type { Metadata } from "next";
import { siteOrigin } from "@/lib/request-origin";
import { jsonLd, organizationLd, websiteLd } from "@/lib/seo";

/**
 * Home page. The admin controls the content and the ORDER of every section
 * from /admin/marketing — this file just renders whatever that layout says.
 * Rendered per request so marketing and seller edits show immediately.
 */
export const dynamic = "force-dynamic";

// The root layout's title and description; the home page only names itself
// as the one address for "/" — not "/?ref=whatsapp" and the like.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [categories, flashProducts, flash, bestsellers, newArrivals, stores, rawMarketing, allProducts] =
    await Promise.all([
      getShopperCategories(),
      getFlashProducts(),
      getFlashDeal(),
      getBestsellers(),
      getNewArrivals(4),
      getListedStores(),
      getMarketingSettings(),
      getMarketplaceProducts(),
    ]);

  // Department artwork: the admin's chosen cover, or the best-selling
  // product's photo from inside that department. See categoryCovers().
  const [session, t, lang] = await Promise.all([getSession(), getT(), getLang()]);
  // The hero copy in the shopper's language — lib/marketing-copy.ts.
  const marketing = localizeMarketing(rawMarketing, lang);
  const myOrder = session?.role === "customer" ? await activeOrderFor(session.email) : null;
  // Capitalised: accounts created from an email address carry a
  // lower-case name ("ayaan"), which reads as a bug in a greeting.
  const rawFirst = session?.role === "customer" ? session.name?.trim().split(/\s+/)[0] : undefined;
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1) : undefined;

  const flashIds = new Set(flashProducts.map((p) => p.id));
  const deal = dealOfTheDay(allProducts, flashIds);
  // Trending already shows the overall best sellers; the budget rows skip
  // them so the two rows don't open with the same products.
  const trendingIds = new Set(bestsellers.map((p) => p.id));
  const budgetBands = budgetPicks(allProducts.filter((p) => !trendingIds.has(p.id)));

  const officialBrands = stores.filter((s) => s.official);
  const localStores = stores.filter((s) => !s.official).slice(0, 4);
  // The admin's switch AND their schedule: an Eid banner made last week
  // goes up on Eid by itself, and comes down after.
  const activeBanners = marketing.banners.filter((b) => isScheduledLive(b));
  const activeTiles = marketing.promoTiles.filter((t) => isScheduledLive(t)).slice(0, MAX_TILES);
  // What is running on the marketplace right now (lib/campaigns.ts) — the
  // hero and "Today's Campaigns" fill themselves from it.
  const campaigns = homeEligible(await getCampaigns(t), marketing);
  const campaignTiles = planTiles(marketing, campaigns, activeTiles.length);

  // Select 1 real product from each of 4 distinct stores for the Hero section
  const heroProducts: Product[] = [];
  const seenStores = new Set<string>();
  const targetStores = ["karaca-home", "us-polo-assn", "altinyildiz-classics", "ozdilek-home"];

  for (const slug of targetStores) {
    const p = allProducts.find((item) => item.store === slug);
    if (p) {
      heroProducts.push(p);
      seenStores.add(p.store);
    }
  }

  if (heroProducts.length < 4) {
    for (const p of allProducts) {
      if (!seenStores.has(p.store)) {
        heroProducts.push(p);
        seenStores.add(p.store);
        if (heroProducts.length === 4) break;
      }
    }
  }

  /*
   * ── The hero's slides ────────────────────────────────────────────────
   *
   * Slide one is the marketplace's own pitch, built from the copy the
   * admin writes in /admin/marketing. Then the admin's banners
   * (/admin/banners), then the campaigns running today — the flash sale
   * and when it ends, the site-wide sale, the strongest shop sales, a
   * shop's offer — each with real products at real prices, so every slide
   * is something a shopper can act on. Then what just landed and the
   * official brands, which are what get cut when the frame is full.
   *
   * The order is decided by planHero() (lib/campaigns.ts), which the
   * admin's preview of the hero calls too, so the two never disagree.
   * Nothing here is invented: a slide with no data behind it is simply not
   * planned. See the note at the top of HeroCarousel for why there is one
   * frame rather than a hero and a banner carousel.
   */
  const plan = planHero({
    marketing,
    bannerIds: activeBanners.map((b) => b.id),
    campaigns,
    hasNewArrivals: newArrivals.length > 0,
    officialBrandCount: officialBrands.length,
  });

  const campaignSlide = (c: Campaign): HeroSlide => {
    const shelf = <HeroShelf products={c.products.slice(0, 4)} />;
    const shopName = c.store?.name ?? "";
    switch (c.kind) {
      case "flash":
        return {
          id: "__flash__",
          href: c.path,
          eyebrow: t("hero.flash.eyebrow"),
          title: c.pct ? t("hero.flash.title", { pct: c.pct }) : c.name,
          subtitle: c.pct ? c.name : undefined,
          cta: t("hero.flash.cta"),
          below: c.endsAt ? (
            <span className="inline-flex rounded-full bg-white/95 px-3 py-1.5 shadow-sm">
              <CountdownTimer endsAt={c.endsAt} />
            </span>
          ) : undefined,
          from: c.from,
          to: c.to,
          visual: shelf,
        };
      case "sale":
        return {
          id: "__sale__",
          href: c.path,
          eyebrow: `🔥 ${c.name}`,
          title: c.headline,
          subtitle: t("hero.sale.sub", { n: c.stores.length }),
          cta: t("hero.sale.cta"),
          from: c.from,
          to: c.to,
          visual: shelf,
        };
      case "promotion":
        return {
          id: `__promo-${c.id}__`,
          href: c.path,
          eyebrow: t("hero.promo.eyebrow", { store: shopName }),
          title: c.headline,
          subtitle: c.endsAt ? `${c.name} · ${t("campaign.ends", { date: shopDay(c.endsAt) })}` : c.name,
          cta: t("hero.offer.cta", { store: shopName }),
          from: c.from,
          to: c.to,
          visual: shelf,
        };
      case "offer":
        return {
          id: "__offer__",
          href: c.path,
          eyebrow: t("hero.offer.eyebrow", { store: shopName }),
          title: c.headline,
          subtitle: t("hero.offer.sub"),
          cta: t("hero.offer.cta", { store: shopName }),
          from: c.from,
          to: c.to,
          visual: shelf,
        };
    }
  };

  const bannerById = new Map(activeBanners.map((b) => [b.id, b]));
  const heroSlides: HeroSlide[] = plan.flatMap((item): HeroSlide[] => {
    switch (item.type) {
      case "brand":
        return [
          {
            id: "__brand__",
            href: "/products",
            eyebrow: marketing.heroBadge,
            // The headline is written as two lines in the admin form; the hero
            // wraps it itself, so they are joined with a space rather than a
            // <br> that would break awkwardly on a narrow phone.
            title: [marketing.heroTitleTop, marketing.heroTitleHighlight].filter(Boolean).join(" "),
            subtitle: marketing.heroSubtitle,
            // Sellers have their own band lower down and in the footer; here a
            // second button only competed with shopping for every visitor.
            cta: t("home.startShopping"),
            ...PALETTES.ocean,
            brand: true,
          },
        ];
      case "banner": {
        const banner = bannerById.get(item.id);
        return banner
          ? [
              {
                id: banner.id,
                href: banner.link,
                title: banner.title,
                subtitle: banner.subtitle,
                cta: banner.cta,
                image: banner.image,
                mobileImage: banner.mobileImage,
                from: banner.from,
                to: banner.to,
                fit: banner.fit,
              },
            ]
          : [];
      }
      case "campaign":
        return [campaignSlide(item.campaign)];
      case "new":
        return [
          {
            id: "__new__",
            href: "/products?sort=new",
            eyebrow: t("hero.new.eyebrow"),
            title: t("section.new"),
            subtitle: t("section.new.sub"),
            cta: t("hero.new.cta"),
            ...PALETTES.lagoon,
            visual: <HeroShelf products={newArrivals.slice(0, 4)} />,
          },
        ];
      case "brands":
        return [
          {
            id: "__brands__",
            href: "/stores",
            eyebrow: t("hero.brands.eyebrow"),
            title: t("section.brands"),
            subtitle: t("section.brands.sub"),
            cta: t("hero.brands.cta"),
            ...PALETTES.indigo,
            visual: <BrandWall brands={officialBrands.slice(0, 4)} />,
          },
        ];
    }
  });

  /** Every section the admin can place, keyed by its section id. */
  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    // Banners are slides in the hero now, so this section renders nothing
    // of its own. Its visibility switch still governs whether they appear.
    banners: () => null,
    promoTiles: () => (
      <CampaignTiles
        title={t("section.campaigns")}
        subtitle={t("section.campaigns.sub")}
        tiles={activeTiles}
        campaigns={campaignTiles}
        labels={{
          until: (date) => t("tiles.until", { date }),
          endsSoon: t("tiles.endsSoon"),
          popular: t("tiles.popular"),
        }}
      />
    ),
    // Pinned under the hero instead (QuickNav / TrustStrip): their switches
    // still decide whether they show, their position no longer moves them.
    categories: () => null,
    brands: () => (officialBrands.length > 0 ? <OfficialBrands brands={officialBrands} t={t} /> : null),
    flash: () =>
      flashProducts.length > 0 ? (
        <FlashDealsRail deals={flashProducts} name={flash.name} endsAt={flash.endsAt} />
      ) : null,
    value: () => null,
    trending: () => <Bestsellers products={bestsellers} t={t} />,
    stores: () => (localStores.length > 0 ? <StoreSpotlight stores={localStores} t={t} /> : null),
    new: () => (newArrivals.length > 0 ? <NewArrivals products={newArrivals} t={t} /> : null),
  };

  const isVisible = (key: SectionKey) => marketing.sections.some((s) => s.key === key && s.visible);
  const showQuickNav = isVisible("categories");
  const showTrust = isVisible("value");
  // The pinned two are left out so the shelf windows below count real rows.
  const visibleSections = marketing.sections.filter(
    (s) => s.visible && s.key !== "categories" && s.key !== "value",
  );

  /**
   * Where the personalised rows land.
   *
   * The admin's arrangement is left exactly as they set it — this page has
   * always been theirs to order, and a recommender that quietly shoves a
   * campaign banner down the page is one the marketing team switches off.
   *
   * Instead the shelves are INTERLEAVED. The engine tags each one with a
   * slot ("top", "early", "mid", "late") and the page opens a window for
   * each slot at a different depth, so the storefront alternates between
   * what the marketplace is showing everyone and what it is showing you.
   * A single block of eight recommendation rows bolted to the bottom of the
   * page reads as an appendix; this reads as one shop.
   *
   * Every one of these <RecoStack>s shares a single server call — the fetch
   * layer de-duplicates by request key, and slot filtering is local.
   */
  const priority = ["banners", "promoTiles", "brands", "flash"];
  const lastPriorityIdx = visibleSections.reduce(
    (best, s, i) => (priority.includes(s.key) ? i : best),
    -1,
  );
  const lastIdx = visibleSections.length - 1;

  /** After the departments and brand stores — the first personal moment. */
  const earlyAt = lastPriorityIdx >= 0 ? lastPriorityIdx : Math.min(1, lastIdx);

  /**
   * Two of the marketplace's own sections later.
   *
   * Set to -1 when there is no room, which folds the middle shelves into
   * the closing block instead of stacking them straight onto the early
   * ones. Landing both windows on the same section is the case that
   * produced four consecutive recommendation rows.
   */
  const midAt = earlyAt + 2 <= lastIdx ? earlyAt + 2 : -1;

  /**
   * What the admin's own rails are already showing. Passed to the engine so
   * its shelves don't hand the shopper the same eight products a second
   * time under a different heading — which reads as a small catalogue, not
   * as two endorsements.
   */
  const alreadyOnPage = [
    ...bestsellers,
    ...newArrivals,
    ...flashProducts,
    ...(deal ? [deal.product] : []),
  ].map((p) => p.id);

  // Deal of the day follows the flash deals (one deals moment, not two far
  // apart); budget rows follow Trending. Each falls back to the first or
  // last visible section when the admin has hidden its anchor.
  const dealAfter = visibleSections.some((s) => s.key === "flash") && flashProducts.length > 0
    ? "flash"
    : visibleSections[0]?.key;
  const budgetAfter = visibleSections.some((s) => s.key === "trending")
    ? "trending"
    : visibleSections[visibleSections.length - 1]?.key;

  const origin = await siteOrigin();

  return (
    <div>
      {/* Who we are and the site search, for Google's result card. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationLd(origin))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(websiteLd(origin))} />
      {/* The page's one heading, for search engines and screen readers; the
          hero carousel below is what sighted shoppers read first. */}
      <h1 className="sr-only">Banaadir Mall — online shopping from trusted Somali stores</h1>
      {firstName && <WelcomeStrip name={firstName} order={myOrder} t={t} />}

      <HeroCarousel
        slides={heroSlides}
        brandDecoration={<HeroProductCards products={heroProducts} />}
      />
      {marketing.campaign.active && (marketing.campaign.stores?.length ?? 0) > 0 && (
        <CampaignBanner campaign={marketing.campaign} />
      )}

      {/* Why to buy here, in one line, before anything asks for a decision. */}
      {showTrust && <TrustStrip delivery={marketing.delivery} t={t} />}

      {/* The launcher: the one set of department shortcuts on the page, and
          on a phone part of the first screen. */}
      {showQuickNav && <QuickNav categories={categories} />}

      {/*
        The unfinished-business strip. For a returning shopper the most
        useful thing on the page is the product they were looking at when
        they were interrupted; with the compact phone hero it lands on the
        first screen. Renders nothing for a first-time visitor — and holds
        no placeholder, so their page doesn't jump when it turns out empty.
        (Above the hero was tried: that jump moved the whole page.)
      */}
      <RecoStack surface="home" useCartLines excludeIds={alreadyOnPage} slot="top" placeholder={false} />

      {visibleSections.map((section, index) => (
        <div key={section.key}>
          {sectionRenderers[section.key]?.()}
          {deal && section.key === dealAfter && <DealOfTheDay {...deal} t={t} />}
          {section.key === budgetAfter && <BudgetPicks bands={budgetBands} />}
          {index === earlyAt && (
            <RecoStack surface="home" useCartLines excludeIds={alreadyOnPage} slot="early" />
          )}
          {index === midAt && (
            <RecoStack surface="home" useCartLines excludeIds={alreadyOnPage} slot="mid" />
          )}
        </div>
      ))}

      {/* Discovery closes the page — the row you read when nothing above
          it caught you, which is exactly when a shop should widen out. */}
      {midAt === -1 && (
        <RecoStack surface="home" useCartLines excludeIds={alreadyOnPage} slot="mid" />
      )}
      <RecoStack surface="home" useCartLines excludeIds={alreadyOnPage} slot="late" />

    </div>
  );
}

/* ── Site-wide campaign banner (admin-controlled) ─────────────────── */

function CampaignBanner({ campaign }: { campaign: MarketingSettings["campaign"] }) {
  // Links to the sale's own page (/campaign/sale), where the participating
  // shops and their discounted products are — the strip used to announce
  // a sale and give a shopper nowhere to go to find it.
  return (
    <Link
      href={campaignPath({ id: SALE_CAMPAIGN_ID, kind: "sale" })}
      className="block bg-gradient-to-r from-coral-600 via-coral-500 to-mango-500 px-4 py-2.5 text-center text-sm font-bold text-white transition hover:brightness-105"
    >
      🔥 {campaign.name} — {campaign.pct}% off at participating shops, automatically
      applied at the till! <span className="underline underline-offset-2">Shop the sale →</span>
    </Link>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────── */

/**
 * A smart slide's products: on a phone, three cards spanning the full width
 * above the headline (they were 72px thumbnails huddled on the left); a row
 * on a tablet; a 2 × 2 with name and price on a computer. Photos are lazy —
 * the hero's first slide never waits on them.
 */
function HeroShelf({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:flex sm:gap-3 lg:ml-auto lg:grid lg:w-[26rem] lg:grid-cols-2 lg:gap-4">
      {products.map((p, i) => {
        const off = p.compareAt && p.compareAt > p.price ? discountPct(p.price, p.compareAt) : 0;
        return (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className={`group relative block min-w-0 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 transition hover:-translate-y-0.5 sm:w-24 sm:shrink-0 lg:w-auto lg:rounded-2xl ${
              i === 3 ? "hidden sm:block" : ""
            }`}
          >
            <ProductImage
              product={p}
              iconClass="text-3xl lg:text-5xl"
              sizes="(max-width: 639px) 33vw, (max-width: 1023px) 96px, 220px"
              className="aspect-[4/3] w-full sm:aspect-square lg:aspect-[4/3]"
            />
            {off > 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm lg:left-2 lg:top-2 lg:text-xs">
                −{off}%
              </span>
            )}
            <div className="px-2 py-1 lg:px-3 lg:py-2">
              <p className="hidden truncate text-xs font-semibold text-slate-700 group-hover:text-ocean-700 lg:block">{p.name}</p>
              <p className="truncate font-display text-xs font-extrabold text-ocean-950 lg:text-sm">
                {money(p.price)}
                {off > 0 && p.compareAt && (
                  <span className="ml-1 hidden font-sans text-[11px] font-medium text-slate-400 line-through lg:inline">
                    {money(p.compareAt)}
                  </span>
                )}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** The official brands' logos, on white tiles so every logo reads. */
function BrandWall({ brands }: { brands: Store[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:flex sm:gap-3 lg:ml-auto lg:grid lg:w-[26rem] lg:grid-cols-2 lg:gap-4">
      {brands.map((b, i) => (
        <Link
          key={b.slug}
          href={`/store/${b.slug}`}
          className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-black/5 transition hover:-translate-y-0.5 sm:w-24 sm:shrink-0 lg:w-auto lg:rounded-2xl lg:p-4 ${
            i === 3 ? "hidden sm:flex" : ""
          }`}
        >
          <StoreAvatar store={b} size={64} className="h-12 w-12 rounded-lg lg:h-16 lg:w-16 lg:rounded-xl" />
          <span className="w-full truncate text-center text-[10px] font-bold text-slate-700 lg:text-sm">{b.name}</span>
        </Link>
      ))}
    </div>
  );
}

function shortHeroTitle(name: string): string {
  if (!name) return "";
  // Remove duplicate words like "Slim Fit Slim Fit"
  const clean = name.replace(/\b(\w+)\s+\1\b/gi, "$1").trim();
  if (clean.toLowerCase().includes("hatır")) return "Hatır Coffee Maker";
  if (clean.toLowerCase().includes("polo")) return "Classic Polo Shirt";
  if (clean.toLowerCase().includes("suit")) return "Slim Fit Wool Suit";
  if (clean.toLowerCase().includes("towel") || clean.toLowerCase().includes("rose") || clean.toLowerCase().includes("duvet"))
    return "Rose Bamboo Duvet Set";

  const words = clean.split(/\s+/);
  return words.slice(0, 3).join(" ");
}

function shortStoreName(store: string): string {
  const s = store.toLowerCase();
  if (s.includes("karaca")) return "KARACA";
  if (s.includes("polo")) return "U.S. POLO";
  if (s.includes("altinyildiz")) return "ALTINYILDIZ";
  if (s.includes("ozdilek")) return "ÖZDILEK";
  return store.replace(/-/g, " ").toUpperCase();
}

/**
 * The floating product cards on the hero's brand slide.
 *
 * All that survives of the old standalone hero, and deliberately so: they
 * are real products at real prices, drifting over the gradient, which does
 * more for a marketplace's credibility than any stock photograph. They stay
 * `lg` and up — on a phone they would sit on top of the headline, which is
 * exactly why the reference app shows a photograph there instead.
 */
function HeroProductCards({ products }: { products: Product[] }) {
  const cardPositions = [
    { cls: "left-0 top-1", delay: "0s" },
    { cls: "right-0 top-16", delay: "0.8s" },
    { cls: "left-4 bottom-2", delay: "1.6s" },
    { cls: "right-0 bottom-20", delay: "2.4s" },
  ];

  return (
    <>
      {products.map((p, idx) => {
        const pos = cardPositions[idx % cardPositions.length];

        return (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className={`animate-float absolute ${pos.cls} group z-10 flex w-52 items-center gap-3 rounded-2xl bg-white/95 p-2.5 shadow-2xl ring-1 ring-black/10 backdrop-blur-md transition duration-300 hover:scale-105 hover:bg-white hover:ring-mango-400/80`}
            style={{ animationDelay: pos.delay }}
          >
            <ProductImage
              product={p}
              sizes="44px"
              className="h-11 w-11 shrink-0 rounded-xl border border-sand-200 object-cover shadow-xs"
            />
            <div className="min-w-0 flex-1">
              <span className="inline-block truncate rounded-full bg-sand-100 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-ocean-900">
                {shortStoreName(p.store)}
              </span>
              <p className="truncate text-xs font-bold text-slate-800 group-hover:text-ocean-700">
                {shortHeroTitle(p.name)}
              </p>
              <p className="font-display text-xs font-extrabold text-ocean-950">
                {money(p.price)}
              </p>
            </div>
          </Link>
        );
      })}
      <div className="absolute inset-12 rounded-full bg-white/5 ring-1 ring-white/10" />
    </>
  );
}

/* ── Official brand stores ────────────────────────────────────────── */

function OfficialBrands({ brands, t }: { brands: Store[]; t: T }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader
        title={t("section.brands")}
        subtitle={t("section.brands.sub")}
        href="/stores"
        linkLabel={t("section.viewAll")}
      />
      {/* One swipeable row on a phone (a 2×2 block was most of a screen). */}
      <div className="rail-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/store/${b.slug}`}
            className="group relative flex aspect-[4/5] w-[46%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-3.5 text-white shadow-md transition hover:-translate-y-1 hover:shadow-2xl sm:aspect-[4/3] sm:w-auto sm:p-5"
          >
            {b.banner ? (
              <Image
                src={b.banner}
                alt={b.name}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(135deg, ${b.art.from}, ${b.art.to})` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
            <div className="relative">
              <StoreAvatar store={b} size={44} className="h-11 w-11 rounded-xl text-xl shadow-lg ring-2 ring-white/70" />
              <h3 className="mt-2.5 font-display text-sm font-extrabold leading-snug sm:text-base">
                {b.name}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-white/80">{b.tagline}</p>
              <span className="mt-2.5 inline-block whitespace-nowrap rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold ring-1 ring-white/30 backdrop-blur">
                ★ {b.rating} · {t("brand.shopNow")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Flash deals ──────────────────────────────────────────────────── */

function FlashDeals({
  deals,
  name,
  endsAt,
}: {
  deals: Product[];
  name: string;
  endsAt: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <div className="rounded-3xl bg-gradient-to-r from-coral-500/10 via-mango-100 to-sand-100 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-ocean-950 sm:text-3xl">
              ⚡ {name}
            </h2>
            <CountdownTimer endsAt={endsAt || undefined} />
          </div>
          <Link href="/flash" className="text-sm font-semibold text-coral-600 hover:text-coral-700">
            See all deals →
          </Link>
        </div>
        <div className="flex snap-x items-stretch gap-4 overflow-x-auto pb-2 rail-scroll">
          {deals.map((p) => (
            <div key={p.id} className={`${RAIL_CARD} h-full flex-col`}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Signed-in welcome ────────────────────────────────────────────── */

const ACTIVE_STATUSES = new Set(["pending", "processing", "shipped"]);

/**
 * The customer's newest order still on its way, matched by EMAIL only. The
 * account page also matches by name for orders placed before sign-up, but
 * here that could put a stranger's parcel on someone's home page.
 */
async function activeOrderFor(email: string): Promise<Order | null> {
  const mine = email.trim().toLowerCase();
  const active = (await getOrders())
    .filter((o) => o.email?.trim().toLowerCase() === mine && ACTIVE_STATUSES.has(o.status))
    .sort((a, b) => b.date.localeCompare(a.date));
  return active[0] ?? null;
}

const ORDER_LINE = {
  pending: "home.order.pending",
  processing: "home.order.processing",
  shipped: "home.order.shipped",
} as const;

/** Name and the order in progress, above the hero — server-rendered, so it never shifts the page. */
function WelcomeStrip({ name, order, t }: { name: string; order: Order | null; t: T }) {
  return (
    <div className="border-b border-ocean-100 bg-ocean-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
        <span className="font-semibold text-ocean-950">{t("home.welcome", { name })}</span>
        {order ? (
          <Link
            href={`/track?id=${encodeURIComponent(order.id)}`}
            className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ocean-700 hover:underline"
          >
            <span aria-hidden>{order.status === "shipped" ? "🚚" : "📦"}</span>
            <span className="truncate">
              {t(ORDER_LINE[order.status as keyof typeof ORDER_LINE] ?? "home.order.pending", { id: order.id })}
            </span>
            <span aria-hidden>→</span>
          </Link>
        ) : (
          <Link href="/account" className="font-semibold text-ocean-700 hover:underline">
            {t("home.yourAccount")}
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Deal of the day ─────────────────────────────────────────────────── */

/** Somalia is UTC+3 all year: the deal changes at its midnight, not the server's. */
const SOMALIA_OFFSET_MS = 3 * 3_600_000;

/**
 * One product, big. The biggest real discounts in stock (not already in
 * the flash rail), rotating daily through the top seven so a regular sees
 * a new one each day. Nothing is discounted for the occasion — the price
 * is the product's own.
 */
function dealOfTheDay(products: Product[], exclude: Set<string>) {
  const candidates = products
    .filter((p) => p.compareAt && p.compareAt > p.price && p.stock > 0 && !exclude.has(p.id))
    .sort((a, b) => discountPct(b.price, b.compareAt!) - discountPct(a.price, a.compareAt!))
    .slice(0, 7);
  if (candidates.length === 0) return null;
  const day = Math.floor((Date.now() + SOMALIA_OFFSET_MS) / 86_400_000);
  const endsAt = new Date((day + 1) * 86_400_000 - SOMALIA_OFFSET_MS).toISOString();
  return { product: candidates[day % candidates.length], endsAt };
}

function DealOfTheDay({ product, endsAt, t }: { product: Product; endsAt: string; t: T }) {
  const pct = discountPct(product.price, product.compareAt!);
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <Link
        href={`/product/${product.slug}`}
        className="group grid overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-950 to-ocean-700 text-white shadow-lg ring-1 ring-black/5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <div className="relative aspect-[16/10] bg-white sm:aspect-auto sm:min-h-72">
          <ProductImage
            product={product}
            iconClass="text-8xl"
            sizes="(max-width: 640px) 100vw, 40vw"
            className="absolute inset-0 h-full w-full object-contain transition duration-500 group-hover:scale-105"
          />
          <span className="absolute left-4 top-4 rounded-full bg-coral-500 px-3 py-1 text-sm font-extrabold shadow">
            -{pct}%
          </span>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-mango-300">{t("deal.label")}</p>
          <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-4xl">{product.name}</h2>
          <p className="flex items-baseline gap-3">
            <span className="font-display text-4xl font-extrabold">{money(product.price)}</span>
            <span className="text-lg text-white/60 line-through">{money(product.compareAt!)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
            {/* The timer carries its own "Ends in" label. */}
            <CountdownTimer endsAt={endsAt} />
            {product.stock <= 20 && <span className="font-semibold text-mango-300">{t("deal.left", { n: product.stock })}</span>}
          </div>
          <span className="btn-primary mt-2 self-start">{t("deal.shop")}</span>
        </div>
      </Link>
    </section>
  );
}

/* ── Shop by budget ──────────────────────────────────────────────────── */

const BUDGETS = [10, 25, 50];

/**
 * Best sellers under each price, in stock. A band is dropped when it has
 * too few products to be worth a tab, or when it would show exactly the
 * same products as the cheaper band before it.
 */
function budgetPicks(products: Product[]): BudgetBand[] {
  const bands: BudgetBand[] = [];
  let previous = "";
  for (const max of BUDGETS) {
    const picks = products
      .filter((p) => p.price < max && p.stock > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10);
    const key = picks.map((p) => p.id).join();
    if (picks.length >= 4 && key !== previous) bands.push({ max, products: picks });
    previous = key;
  }
  return bands;
}

/* ── Trust strip ──────────────────────────────────────────────────── */

/**
 * The reasons to buy here, as one slim line under the hero. They used to
 * be four large cards further down, after the first deals — the strongest
 * arguments on the page, arriving after the shopper had already decided
 * whether to scroll. Swipes sideways on a phone rather than wrapping.
 */
function TrustStrip({ delivery, t }: { delivery: MarketingSettings["delivery"]; t: T }) {
  const items = [
    {
      icon: "🚚",
      text:
        delivery.freeThreshold > 0
          ? t("trust.freeOver", { amount: money(delivery.freeThreshold) })
          : delivery.estimate
            ? t("trust.delivery", { estimate: delivery.estimate })
            : t("trust.fast"),
    },
    { icon: "📲", text: "EVC Plus · Zaad · eDahab" },
    { icon: "💵", text: t("trust.cod") },
    { icon: "↩️", text: t("trust.returns") },
    { icon: "🏪", text: t("trust.local") },
  ];
  return (
    <section aria-label="Why shop with us" className="border-b border-sand-200 bg-white">
      <ul className="rail-scroll mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-2.5 text-xs font-semibold text-slate-600 sm:justify-between sm:text-sm">
        {items.map((item) => (
          <li key={item.text} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden>{item.icon}</span>
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Product rails ────────────────────────────────────────────────── */

/**
 * Product rows: one swipeable row on a phone, a grid from tablet up. As
 * grids, five product sections made the phone page about twelve screens
 * long; as rows each costs one card's height, and the 44% width leaves the
 * next card peeking in so the row reads as swipeable.
 */
const RAIL_GRID = "rail-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4";
const RAIL_ITEM = "flex w-[44%] shrink-0 snap-start md:w-auto";

function Bestsellers({ products, t }: { products: Product[]; t: T }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title={t("section.trending")} subtitle={t("section.trending.sub")} href="/products?sort=sold" linkLabel={t("section.viewAll")} />
      <div className={RAIL_GRID}>
        {products.map((p) => (
          <div key={p.id} className={RAIL_ITEM}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

function NewArrivals({ products, t }: { products: Product[]; t: T }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title={t("section.new")} subtitle={t("section.new.sub")} href="/products?sort=new" linkLabel={t("section.viewAll")} />
      <div className={RAIL_GRID}>
        {products.map((p) => (
          <div key={p.id} className={RAIL_ITEM}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

function StoreSpotlight({ stores, t }: { stores: Store[]; t: T }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title={t("section.stores")} subtitle={t("section.stores.sub")} href="/stores" linkLabel={t("section.viewAll")} />
      {/* Swipeable on a phone (four full-width cards were a screen and a
          half); a grid from tablet up. */}
      <div className="rail-scroll -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {stores.map((s) => (
          <div key={s.slug} className="w-[80%] shrink-0 snap-start sm:w-auto">
            <StoreCard store={s} />
          </div>
        ))}
      </div>
    </section>
  );
}

