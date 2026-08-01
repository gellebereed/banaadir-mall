import Image from "next/image";
import Link from "next/link";
import BannerCarousel from "@/components/home/BannerCarousel";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import StoreCard from "@/components/StoreCard";
import {
  getBestsellers,
  getCategories,
  getFlashDeal,
  getFlashProducts,
  getMarketingSettings,
  getNewArrivals,
  getStores,
} from "@/lib/api";
import type { Category, MarketingSettings, Product, SectionKey, Store } from "@/lib/types";

/**
 * Home page. The admin controls the content and the ORDER of every section
 * from /admin/marketing — this file just renders whatever that layout says.
 * Rendered per request so marketing and seller edits show immediately.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, flashProducts, flash, bestsellers, newArrivals, stores, marketing] =
    await Promise.all([
      getCategories(),
      getFlashProducts(),
      getFlashDeal(),
      getBestsellers(),
      getNewArrivals(4),
      getStores(),
      getMarketingSettings(),
    ]);

  const officialBrands = stores.filter((s) => s.official);
  const localStores = stores.filter((s) => !s.official).slice(0, 4);
  const activeBanners = marketing.banners.filter((b) => b.active);
  const activeTiles = marketing.promoTiles.filter((t) => t.active);

  /** Every section the admin can place, keyed by its section id. */
  const sectionRenderers: Record<SectionKey, () => React.ReactNode> = {
    banners: () => (activeBanners.length > 0 ? <BannerCarousel banners={activeBanners} /> : null),
    promoTiles: () => (activeTiles.length > 0 ? <PromoTiles tiles={activeTiles} /> : null),
    categories: () => <CategoryRail categories={categories} />,
    brands: () => (officialBrands.length > 0 ? <OfficialBrands brands={officialBrands} /> : null),
    flash: () =>
      flashProducts.length > 0 ? (
        <FlashDeals deals={flashProducts} name={flash.name} endsAt={flash.endsAt} />
      ) : null,
    value: () => <ValueProps />,
    trending: () => <Bestsellers products={bestsellers} />,
    stores: () => (localStores.length > 0 ? <StoreSpotlight stores={localStores} /> : null),
    new: () => (newArrivals.length > 0 ? <NewArrivals products={newArrivals} /> : null),
  };

  return (
    <div>
      <Hero marketing={marketing} />
      {marketing.campaign.active && <CampaignBanner campaign={marketing.campaign} />}

      {marketing.sections
        .filter((s) => s.visible)
        .map((s) => (
          <div key={s.key}>{sectionRenderers[s.key]?.()}</div>
        ))}

      <SellerBanner />
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

function Hero({ marketing }: { marketing: MarketingSettings }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-ocean-950 via-ocean-800 to-ocean-600">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-mango-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-ocean-400/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-mango-300 ring-1 ring-white/20">
            {marketing.heroBadge}
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            {marketing.heroTitleTop}
            <br />
            <span className="bg-gradient-to-r from-mango-300 to-mango-500 bg-clip-text text-transparent">
              {marketing.heroTitleHighlight}
            </span>
          </h1>
          <p className="mt-4 max-w-md text-ocean-100 sm:text-lg">{marketing.heroSubtitle}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/products" className="btn-primary">
              Start Shopping
            </Link>
            <Link
              href="/sell"
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 px-6 py-3 font-semibold text-white transition hover:bg-white hover:text-ocean-900"
            >
              Open Your Store
            </Link>
          </div>
          <dl className="mt-9 flex gap-8">
            {[
              ["65+", "Products"],
              ["12", "Stores"],
              ["4", "Global brands"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="font-display text-2xl font-extrabold text-white">{value}</dd>
                <dd className="text-xs text-ocean-200">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto hidden h-96 w-full max-w-md lg:block">
          {[
            { icon: "🎧", label: "AuraPods Pro", price: "$49", cls: "left-0 top-6", delay: "0s" },
            { icon: "👗", label: "Amal Maxi Dress", price: "$39", cls: "right-0 top-0", delay: "0.8s" },
            { icon: "🍯", label: "Qasil Face Mask", price: "$14", cls: "left-8 bottom-8", delay: "1.6s" },
            { icon: "🐪", label: "Plush Camel", price: "$15", cls: "right-6 bottom-16", delay: "2.4s" },
          ].map((t) => (
            <div
              key={t.label}
              className={`animate-float absolute ${t.cls} flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-5 shadow-2xl`}
              style={{ animationDelay: t.delay }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand-100 text-2xl">
                {t.icon}
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-700">{t.label}</p>
                <p className="font-display font-bold text-ocean-800">{t.price}</p>
              </div>
            </div>
          ))}
          <div className="absolute inset-8 rounded-full bg-white/5 ring-1 ring-white/10" />
        </div>
      </div>
    </section>
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

/* ── Category rail ────────────────────────────────────────────────── */

function CategoryRail({ categories }: { categories: Category[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10">
      <div className="grid grid-cols-4 gap-3 sm:gap-4 lg:grid-cols-8">
        {categories.map((c) => (
          <Link key={c.slug} href={`/category/${c.slug}`} className="group flex flex-col items-center gap-2 text-center">
            <span
              className="flex aspect-square w-full max-w-20 items-center justify-center rounded-3xl text-3xl shadow-sm transition group-hover:scale-105 group-hover:shadow-md sm:text-4xl"
              style={{ background: `linear-gradient(135deg, ${c.art.from}, ${c.art.to})` }}
            >
              {c.icon}
            </span>
            <span className="text-xs font-semibold text-slate-700 group-hover:text-ocean-700">
              {c.name}
            </span>
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

/* ── Value props ──────────────────────────────────────────────────── */

function ValueProps() {
  const props = [
    { icon: "🚚", title: "Fast Delivery", text: "Same-day in Mogadishu, 2–4 days nationwide" },
    { icon: "📲", title: "Mobile Money", text: "EVC Plus, Zaad & eDahab accepted everywhere" },
    { icon: "🛡️", title: "Buyer Protection", text: "7-day returns and money-back guarantee" },
    { icon: "🏪", title: "Local Stores", text: "Every purchase supports a Somali business" },
  ];
  return (
    <section className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 pt-14 lg:grid-cols-4">
      {props.map((p) => (
        <div key={p.title} className="card flex items-start gap-3 p-4">
          <span className="text-2xl">{p.icon}</span>
          <div>
            <h3 className="text-sm font-bold text-ocean-950">{p.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{p.text}</p>
          </div>
        </div>
      ))}
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

/* ── Seller CTA banner ────────────────────────────────────────────── */

function SellerBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-ocean-900 to-ocean-700 px-6 py-10 sm:px-12">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-mango-500/30 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
              Have products to sell?
            </h2>
            <p className="mt-2 max-w-md text-sm text-ocean-100">
              Join Banaadir Mall and reach customers across Somalia. Free to
              start, dashboard included, get paid straight to your mobile money.
            </p>
          </div>
          <Link href="/sell" className="btn-primary shrink-0">
            Open Your Store — Free
          </Link>
        </div>
      </div>
    </section>
  );
}
