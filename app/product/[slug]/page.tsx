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
  getMarketingSettings,
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
import { getT } from "@/lib/prefs-server";
import { normalizeWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";

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
      images: [{ url: `/product/${product.slug}/opengraph-image?v=2`, width: 1200, height: 630, alt: product.name }],
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

  const [store, category, reviews, stories, session, marketing, t] = await Promise.all([
    getStore(product.store),
    getCategory(product.category),
    getReviews(product),
    getStoriesForProduct(product),
    getSession(),
    getMarketingSettings(),
    getT(),
  ]);

  /*
   * schema.org Product: what lets Google show the price, stock and rating
   * stars under the result instead of a bare link.
   */
  const origin = await requestOrigin();
  const sellerNumber = normalizeWhatsAppNumber(store?.whatsapp);
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
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:pt-8">
      {/* Breadcrumbs */}
      {/* One line that never runs past the screen: the product name takes
          whatever is left and truncates. (A fixed 50vw for it pushed a 320px
          phone's page sideways — sticky buy bar included.) On a phone the
          "Home" step goes; the header logo already does that job. */}
      <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center whitespace-nowrap text-sm text-slate-400 sm:mb-5">
        <Link href="/" className="hidden hover:text-ocean-700 sm:inline">Home</Link>
        <span className="mx-2 hidden sm:inline">/</span>
        <Link href={`/category/${product.category}`} className="shrink-0 hover:text-ocean-700">
          {category?.name}
        </Link>
        <span className="mx-2 shrink-0">/</span>
        <span className="min-w-0 truncate text-slate-600 sm:max-w-md">{product.name}</span>
      </nav>

      {/* Gallery + buy box (client) with the store card passed through */}
      <ProductView product={product} details={describeAttributes(product.attributes)} delivery={marketing.delivery}>
        {store && (
          <div className="card mt-5 p-4">
            <Link href={`/store/${store.slug}`} className="group flex items-center gap-4">
              <StoreAvatar store={store} size={48} className="h-12 w-12 shrink-0 rounded-xl text-2xl" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-ocean-950 group-hover:text-ocean-700">
                  {store.name} {store.verified && <span className="text-ocean-500">✔</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {store.reviewCount > 0 && `★ ${store.rating.toFixed(1)} · `}
                  {t("store.followers", { n: compact(store.followers) })} · {store.city}
                </p>
              </div>
            </Link>
            {/*
              Ask before buying — the way people here do. The shop's own
              WhatsApp when it has one, else the marketplace's support line
              (only when that is configured — the fallback is a placeholder).
            */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={`/store/${store.slug}`}
                className="flex items-center justify-center rounded-full border border-ocean-700 px-3 py-2 text-xs font-bold text-ocean-700 hover:bg-ocean-50"
              >
                {t("store.visit")}
              </Link>
              {(sellerNumber || process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP) && (
                <a
                  href={whatsappLink(
                    sellerNumber || process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP!,
                    `${t("store.chatMessage", { store: store.name, product: product.name })}\n${origin}/product/${product.slug}`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2 text-xs font-bold text-white hover:brightness-95"
                >
                  💬 {t("store.chat")}
                </a>
              )}
            </div>
          </div>
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
