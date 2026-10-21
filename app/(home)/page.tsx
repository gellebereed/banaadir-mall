import Image from "next/image";
import Link from "next/link";
import HeroCarousel, { type HeroSlide } from "@/components/home/HeroCarousel";
import QuickNav from "@/components/home/QuickNav";
import FlashDealsRail from "@/components/home/FlashDealsRail";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import RecoStack from "@/components/reco/RecoStack";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import StoreCard from "@/components/StoreCard";
import ProductImage from "@/components/ProductImage";
import { money } from "@/lib/format";
import {
  getBestsellers,
  getCategories,
  getFlashDeal,
  getFlashProducts,
  getListedStores,
  getMarketingSettings,
  getMarketplaceProducts,
  getNewArrivals,
} from "@/lib/api";
import type { MarketingSettings, Product, SectionKey, Store } from "@/lib/types";

/**
 * Home page. The admin controls the content and the ORDER of every section
 * from /admin/marketing — this file just renders whatever that layout says.
 * Rendered per request so marketing and seller edits show immediately.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, flashProducts, flash, bestsellers, newArrivals, stores, marketing, allProducts] =
    await Promise.all([
      getCategories(),
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
  const officialBrands = stores.filter((s) => s.official);
  const localStores = stores.filter((s) => !s.official).slice(0, 4);
  const activeBanners = marketing.banners.filter((b) => b.active);
  const activeTiles = marketing.promoTiles.filter((t) => t.active);

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
   * admin writes in /admin/marketing. The rest are their banners. They
   * share one frame — see the note at the top of HeroCarousel for why the
   * storefront no longer opens with two heroes in a row.
   *
   * The banners only join when the admin has the "banners" section switched
   * ON, so that toggle still means what it always meant.
   */
  const bannersVisible = marketing.sections.some(
    (section) => section.key === "banners" && section.visible,
  );

  const heroSlides: HeroSlide[] = [
    {
      id: "__brand__",
      href: "/products",
      eyebrow: marketing.heroBadge,
      // The headline is written as two lines in the admin form; the hero
      // wraps it itself, so they are joined with a space rather than a
      // <br> that would break awkwardly on a narrow phone.
      title: [marketing.heroTitleTop, marketing.heroTitleHighlight]
        .filter(Boolean)
        .join(" "),
      subtitle: marketing.heroSubtitle,
      // Sellers have their own band lower down and in the footer; here a
      // second button only competed with shopping for every visitor.
      cta: "Start Shopping",
      from: "#0c2b34",
      to: "#217987",
      brand: true,
    },
    ...(bannersVisible
      ? activeBanners.map((banner) => ({
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
        }))
      : []),
  ];

  /** Every section the admin can place, keyed by its section id. */
  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    // Banners are slides in the hero now, so this section renders nothing
    // of its own. Its visibility switch still governs whether they appear.
    banners: () => null,
    promoTiles: () => (activeTiles.length > 0 ? <PromoTiles tiles={activeTiles} /> : null),
    // Pinned under the hero instead (QuickNav / TrustStrip): their switches
    // still decide whether they show, their position no longer moves them.
    categories: () => null,
    brands: () => (officialBrands.length > 0 ? <OfficialBrands brands={officialBrands} /> : null),
    flash: () =>
      flashProducts.length > 0 ? (
        <FlashDealsRail deals={flashProducts} name={flash.name} endsAt={flash.endsAt} />
      ) : null,
    value: () => null,
    trending: () => <Bestsellers products={bestsellers} />,
    stores: () => (localStores.length > 0 ? <StoreSpotlight stores={localStores} /> : null),
    new: () => (newArrivals.length > 0 ? <NewArrivals products={newArrivals} /> : null),
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
  const alreadyOnPage = [...bestsellers, ...newArrivals, ...flashProducts].map((p) => p.id);

  return (
    <div>
      <HeroCarousel
        slides={heroSlides}
        brandDecoration={<HeroProductCards products={heroProducts} />}
      />
      {marketing.campaign.active && <CampaignBanner campaign={marketing.campaign} />}

      {/* Why to buy here, in one line, before anything asks for a decision. */}
      {showTrust && <TrustStrip delivery={marketing.delivery} />}

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
  return (
    <div className="bg-gradient-to-r from-coral-600 via-coral-500 to-mango-500 px-4 py-2.5 text-center text-sm font-bold text-white">
      🔥 {campaign.name} — {campaign.pct}% off everything, automatically
      applied at the till!
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────── */

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

/* ── Campaign tiles (admin-built) ─────────────────────────────────── */

function PromoTiles({ tiles }: { tiles: MarketingSettings["promoTiles"] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10">
      <SectionHeader title="Today's Campaigns" subtitle="Handpicked offers across the mall" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.id}
            href={t.link}
            className="group relative flex h-28 items-center gap-3 overflow-hidden rounded-2xl px-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            style={{ background: `linear-gradient(120deg, ${t.from}, ${t.to})` }}
          >
            {t.image && (
              <Image src={t.image} alt="" fill sizes="300px" className="object-cover opacity-90" />
            )}
            <div className="relative">
              <p className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
                {t.label}
              </p>
              <p className="text-xs font-semibold text-ocean-900/70">{t.sublabel}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Official brand stores ────────────────────────────────────────── */

function OfficialBrands({ brands }: { brands: Store[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader
        title="Official Brand Stores"
        subtitle="World-famous brands, franchised exclusively by Banaadir Mall"
        href="/stores"
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/store/${b.slug}`}
            className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl p-5 text-white shadow-md transition hover:-translate-y-1 hover:shadow-2xl sm:aspect-[4/3]"
          >
            {b.banner ? (
              <Image
                src={b.banner}
                alt=""
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
              <span className="mt-2.5 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold ring-1 ring-white/30 backdrop-blur">
                ★ {b.rating} · Shop now →
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
            <div key={p.id} className="flex h-full w-44 shrink-0 flex-col snap-start sm:w-52">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Trust strip ──────────────────────────────────────────────────── */

/**
 * The reasons to buy here, as one slim line under the hero. They used to
 * be four large cards further down, after the first deals — the strongest
 * arguments on the page, arriving after the shopper had already decided
 * whether to scroll. Swipes sideways on a phone rather than wrapping.
 */
function TrustStrip({ delivery }: { delivery: MarketingSettings["delivery"] }) {
  const items = [
    {
      icon: "🚚",
      text:
        delivery.freeThreshold > 0
          ? `Free delivery over ${money(delivery.freeThreshold)}`
          : delivery.estimate
            ? `Delivery ${delivery.estimate}`
            : "Fast delivery",
    },
    { icon: "📲", text: "EVC Plus · Zaad · eDahab" },
    { icon: "💵", text: "Cash on delivery" },
    { icon: "↩️", text: "7-day returns" },
    { icon: "🏪", text: "Trusted Somali stores" },
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

function Bestsellers({ products }: { products: Product[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title="Trending Now" subtitle="What everyone is buying this week" href="/products?sort=sold" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function NewArrivals({ products }: { products: Product[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title="Just Landed" subtitle="Fresh finds from our stores" href="/products?sort=new" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function StoreSpotlight({ stores }: { stores: Store[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title="Featured Stores" subtitle="Trusted sellers with top ratings" href="/stores" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stores.map((s) => (
          <StoreCard key={s.slug} store={s} />
        ))}
      </div>
    </section>
  );
}

