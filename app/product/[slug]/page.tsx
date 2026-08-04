import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductView from "@/components/product/ProductView";
import BundleBox from "@/components/reco/BundleBox";
import RecoStack from "@/components/reco/RecoStack";
import TrackProductView from "@/components/reco/TrackProductView";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import StorySection from "@/components/story/StorySection";
import {
  getCategory,
  getProduct,
  getReviews,
  getStore,
  getStoriesForProduct,
} from "@/lib/api";
import { compact, shortDate } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

// Rendered per request so seller price/stock edits, photos and promotions
// (data/db.json) show immediately instead of being frozen at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  return {
    title: product?.name ?? "Product",
    description: product?.description,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [store, category, reviews, stories] = await Promise.all([
    getStore(product.store),
    getCategory(product.category),
    getReviews(product),
    getStoriesForProduct(product),
  ]);

  return (
    <div className="pb-8">
      {/* Records the visit and how long it held attention — the two
          strongest honest signals the recommender has. */}
      <TrackProductView productId={product.id} />

      {/*
        The buy box and reviews sit in the page column; the guide and the
        recommendation shelves are full-bleed below it, because their tinted
        bands only read as a change of surface when they run edge to edge.
        Nesting them inside a max-width container turns each one into a
        coloured rectangle floating in the middle of the page.
      */}
      <div className="mx-auto max-w-7xl px-4 pt-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-slate-400">
        <Link href="/" className="hover:text-ocean-700">Home</Link>
        <span className="mx-2">/</span>
        <Link href={`/category/${product.category}`} className="hover:text-ocean-700">
          {category?.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{product.name}</span>
      </nav>

      {/* Gallery + buy box (client) with the store card passed through */}
      <ProductView product={product}>
        {store && (
          <Link
            href={`/store/${store.slug}`}
            className="card mt-6 flex items-center gap-4 p-4 transition hover:shadow-md"
          >
            <StoreAvatar store={store} size={48} className="h-12 w-12 shrink-0 rounded-xl text-2xl" />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ocean-950">
                {store.name} {store.verified && <span className="text-ocean-500">✔</span>}
              </p>
              <p className="text-xs text-slate-500">
                ★ {store.rating} · {compact(store.followers)} followers · {store.city}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-ocean-700 px-4 py-1.5 text-xs font-bold text-ocean-700">
              Visit Store
            </span>
          </Link>
        )}
      </ProductView>

      {/* Frequently bought together — only renders when real orders back
          it up (lib/reco/psychology.ts, buildBundle). */}
      <BundleBox seedId={product.id} />

      {/* Reviews */}
      <section className="mt-14">
        <SectionHeader
          title="Customer Reviews"
          subtitle={`${product.reviewCount.toLocaleString()} verified reviews · ${product.rating.toFixed(1)} average`}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {reviews.map((r, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">{r.author}</p>
                <span className="text-xs text-slate-400">{shortDate(r.date)}</span>
              </div>
              <p className="mt-1 text-sm text-mango-400" aria-label={`${r.rating} stars`}>
                {"★".repeat(r.rating)}
              </p>
              <p className="mt-2 text-sm text-slate-600">{r.text}</p>
            </div>
          ))}
        </div>
      </section>
      </div>

      {/* The episode: how it works, how to look after it, what it looks
          like in someone's home. Renders nothing when nobody has written
          one for this product. */}
      <StorySection stories={stories} />

      {/*
        Recommendations. This replaced a flat "first four products in the
        same category" list, which showed every shopper the same four items
        on every product in that category and never changed.
      */}
      <RecoStack surface="product" seedId={product.id} />
    </div>
  );
}
