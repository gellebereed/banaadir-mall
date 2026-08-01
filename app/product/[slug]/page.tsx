import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductView from "@/components/product/ProductView";
import ProductCard from "@/components/ProductCard";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import {
  getCategory,
  getProduct,
  getRelatedProducts,
  getReviews,
  getStore,
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

  const [store, category, related, reviews] = await Promise.all([
    getStore(product.store),
    getCategory(product.category),
    getRelatedProducts(product),
    getReviews(product),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
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

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title="You May Also Like"
            href={`/category/${product.category}`}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
