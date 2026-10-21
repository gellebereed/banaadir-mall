import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import ShareButton from "@/components/ShareButton";
import Rating from "@/components/Rating";
import StoreAvatar from "@/components/StoreAvatar";
import { getProductsByStore, getStore, getStores } from "@/lib/api";
import { getCollections } from "@/lib/collections";
import { compact } from "@/lib/format";
import { metaDescription, openGraph } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
  /** `c` = the collection tab being viewed (lib/collections.ts). */
  searchParams: Promise<{ c?: string }>;
}

// Rendered per request so store status and product edits show immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStore((await params).slug);
  if (!store) notFound();
  const description = metaDescription(
    store.tagline,
    `Shop ${store.name} on Banaadir Mall — delivered across Somalia.`,
  );
  // The store's own banner makes the best preview; without one the site's
  // default card (app/opengraph-image.tsx) is used.
  const banner = store.banner?.startsWith("http") ? store.banner : undefined;
  return {
    title: store.name,
    description,
    alternates: { canonical: `/store/${store.slug}` },
    openGraph: openGraph({
      title: `${store.name} on Banaadir Mall`,
      description,
      url: `/store/${store.slug}`,
      ...(banner ? { images: [{ url: banner }] } : {}),
    }),
  };
}

/** Public store profile: banner, stats and the store's full catalog. */
export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { c: activeSlug } = await searchParams;
  const store = await getStore(slug);
  if (!store || store.status !== "active") notFound();

  const [products, allCollections] = await Promise.all([getProductsByStore(slug), getCollections(slug)]);

  const featuredProducts = products.filter((p) => p.featured);

  // Each collection with the products still for sale in it, in the
  // seller's order. A deleted or hidden product just drops out; an
  // emptied collection gets no tab rather than an empty page.
  const byId = new Map(products.map((p) => [p.id, p]));
  const collections = allCollections
    .map((c) => ({ ...c, items: c.productIds.map((id) => byId.get(id)).filter((p) => p !== undefined) }))
    .filter((c) => c.items.length > 0);
  const active = collections.find((c) => c.slug === activeSlug);

  return (
    <div>
      {/* Banner — uploaded image, or the store's gradient */}
      {store.banner ? (
        <div className="relative h-40 sm:h-52">
          <Image src={store.banner} alt="" fill sizes="100vw" priority className="object-cover" />
        </div>
      ) : (
        <div
          className="h-40 sm:h-52"
          style={{
            background: `linear-gradient(120deg, ${store.art.from}, ${store.art.to})`,
          }}
        />
      )}

      <div className="mx-auto max-w-7xl px-4">
        {/* Store head */}
        <div className="card relative -mt-14 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <StoreAvatar
            store={store}
            size={80}
            className="h-20 w-20 shrink-0 rounded-3xl border-4 border-white text-4xl shadow-md"
          />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 pr-12 font-display text-2xl font-extrabold text-ocean-950 sm:pr-0">
              {store.name}
              {store.official && (
                <span className="rounded-full bg-mango-100 px-2 py-0.5 text-xs font-bold text-mango-800">
                  ★ Official Brand
                </span>
              )}
              {store.verified && (
                <span
                  title="Verified store"
                  className="rounded-full bg-ocean-100 px-2 py-0.5 text-xs font-bold text-ocean-700"
                >
                  ✔ Verified
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500">{store.tagline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <Rating value={store.rating} count={store.reviewCount} />
              <span>📍 {store.city}</span>
              <span>Since {store.joinedYear}</span>
            </div>
          </div>
          {/* Top-right on phones; beside the counts from sm up. */}
          <div className="absolute right-4 top-4 sm:static sm:order-last">
            <ShareButton
              path={`/store/${store.slug}`}
              title={store.name}
              text={`Shop ${store.name} on Banaadir Mall${store.tagline ? ` — ${store.tagline}` : ""}`}
              label="Share this store"
            />
          </div>
          <div className="flex shrink-0 gap-6 sm:flex-col sm:gap-2 sm:text-right">
            <div>
              <p className="font-display text-xl font-extrabold text-ocean-950">
                {compact(store.followers)}
              </p>
              <p className="text-xs text-slate-400">Followers</p>
            </div>
            <div>
              <p className="font-display text-xl font-extrabold text-ocean-950">
                {products.length}
              </p>
              <p className="text-xs text-slate-400">Products</p>
            </div>
          </div>
        </div>

        {/* The store's own collections, as tabs. */}
        {collections.length > 0 && (
          <nav aria-label="Collections" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {[{ slug: "", name: "All products", count: products.length }, ...collections.map((c) => ({ slug: c.slug, name: c.name, count: c.items.length }))].map(
              (tab) => {
                const selected = (active?.slug ?? "") === tab.slug;
                return (
                  <Link
                    key={tab.slug || "all"}
                    href={tab.slug ? `/store/${slug}?c=${tab.slug}` : `/store/${slug}`}
                    scroll={false}
                    aria-current={selected ? "page" : undefined}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selected
                        ? "bg-ocean-800 text-white"
                        : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
                    }`}
                  >
                    {tab.name} <span className={selected ? "text-white/70" : "text-slate-400"}>{tab.count}</span>
                  </Link>
                );
              },
            )}
          </nav>
        )}

        {active ? (
          <>
            <h2 className="mb-1 mt-8 font-display text-2xl font-bold text-ocean-950">{active.name}</h2>
            {active.description && <p className="mb-5 text-sm text-slate-500">{active.description}</p>}
            <div className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 ${active.description ? "" : "mt-5"}`}>
              {active.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Featured Store Favorites Section */}
            {featuredProducts.length > 0 && (
              <div className="mt-8 rounded-3xl bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-sand-50 p-6 border border-amber-200/80 shadow-xs">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-mango-500 text-white font-extrabold text-sm shadow-xs">
                    ⭐
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-ocean-950">
                      Store Favorites &amp; Top Picks
                    </h2>
                    <p className="text-xs text-slate-500">Hand-selected items pinned by {store.name}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {featuredProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            )}

            {/* All Products */}
            <h2 className="mb-5 mt-10 font-display text-2xl font-bold text-ocean-950">
              All Products from {store.name}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
