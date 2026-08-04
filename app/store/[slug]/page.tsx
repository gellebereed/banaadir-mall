import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import Rating from "@/components/Rating";
import StoreAvatar from "@/components/StoreAvatar";
import { getProductsByStore, getStore, getStores } from "@/lib/api";
import { compact } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

// Rendered per request so store status and product edits show immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStore((await params).slug);
  return { title: store?.name ?? "Store" };
}

/** Public store profile: banner, stats and the store's full catalog. */
export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const store = await getStore(slug);
  if (!store || store.status !== "active") notFound();

  const products = await getProductsByStore(slug);

  const featuredProducts = products.filter((p) => p.featured);

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
            <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-ocean-950">
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
      </div>
    </div>
  );
}
