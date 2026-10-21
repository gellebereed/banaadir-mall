import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductView from "@/components/product/ProductView";
import ReviewsSection from "@/components/product/ReviewsSection";
import BundleBox from "@/components/reco/BundleBox";
import RecoStack from "@/components/reco/RecoStack";
import TrackProductView from "@/components/reco/TrackProductView";
import StoreAvatar from "@/components/StoreAvatar";
import StorySection from "@/components/story/StorySection";
import {
  getCategory,
  getProduct,
  getReviews,
  getStore,
  getStoriesForProduct,
} from "@/lib/api";
import { compact, money } from "@/lib/format";
import { primaryImage } from "@/lib/product-utils";
import { requestOrigin } from "@/lib/request-origin";
import { jsonLd, metaDescription, openGraph } from "@/lib/seo";
import { getSession } from "@/lib/session";
import { describeAttributes } from "@/lib/taxonomy-attributes";

interface Props {
  params: Promise<{ slug: string }>;
}

// Rendered per request so seller price/stock edits, photos and promotions
// (data/db.json) show immediately instead of being frozen at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const store = await getStore(product.store);
  const description = metaDescription(
    product.description,
    `${product.name} from ${store?.name ?? "a trusted store"} on Banaadir Mall.`,
  );
  return {
    title: product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    // The card drawn by ./opengraph-image.tsx (photo, name, price, store);
    // the title carries the price too — that is what gets a link tapped.
    openGraph: openGraph({
      title: `${product.name} — ${money(product.price)}`,
      description,
      url: `/product/${product.slug}`,
      images: [{ url: `/product/${product.slug}/opengraph-image`, width: 1200, height: 630, alt: product.name }],
    }),
    other: {
      "product:price:amount": product.price.toFixed(2),
      "product:price:currency": "USD",
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [store, category, reviews, stories, session] = await Promise.all([
    getStore(product.store),
    getCategory(product.category),
    getReviews(product),
    getStoriesForProduct(product),
    getSession(),
  ]);

  /*
   * schema.org Product: what lets Google show the price, stock and rating
   * stars under the result instead of a bare link.
   */
  const origin = await requestOrigin();
  const photo = primaryImage(product);
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: metaDescription(product.description, product.name),
    image: photo ? [photo.startsWith("http") ? photo : `${origin}${photo}`] : [`${origin}/product/${product.slug}/opengraph-image`],
    sku: product.internalReference || product.id,
    ...(product.barcode ? { gtin: product.barcode } : {}),
    ...(category ? { category: category.name } : {}),
    brand: { "@type": "Brand", name: store?.name ?? "Banaadir Mall" },
    offers: {
      "@type": "Offer",
      url: `${origin}/product/${product.slug}`,
      priceCurrency: "USD",
      price: product.price.toFixed(2),
      availability:
        product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: store?.name ?? "Banaadir Mall" },
    },
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  };

  return (
    <div className="pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(productLd)} />
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
      <ProductView product={product} details={describeAttributes(product.attributes)}>
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

      {/* Reviews — with customers' photos, and the form to write one. */}
      <ReviewsSection
        productId={product.id}
        reviews={reviews}
        rating={product.rating}
        reviewCount={product.reviewCount}
        signedIn={Boolean(session)}
      />
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
