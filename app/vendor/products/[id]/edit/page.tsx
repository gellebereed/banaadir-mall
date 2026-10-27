import PendingButton from "@/components/dashboard/PendingButton";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { deleteProduct, updateProduct } from "@/app/actions";
import ProductEditor from "@/components/dashboard/ProductEditor";
import { getBaseProduct, getCategoriesFlat, getDiscountMap, getSubcategories } from "@/lib/api";
import { may } from "@/lib/auth";
import { productsReturnPath } from "@/lib/product-utils";
import { attributeSetsFor } from "@/lib/taxonomy-attributes";
import { aiMatchingAvailable } from "@/lib/taxonomy-ai";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Edit Product" };

/**
 * Full product editor — photos, pricing, stock, variants with their own
 * stock, price, codes and photos, plus all copy. Used by sellers (own
 * products) and admins (any product). Layout shared with Add — see
 * ProductEditor.
 */
export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) redirect("/vendor");

  const { id } = await params;
  // getBaseProduct (not getProduct): the form must edit the seller's own
  // prices, never the temporarily discounted ones a promotion produces.
  const [product, categories, subcategories] = await Promise.all([
    getBaseProduct(id),
    getCategoriesFlat(),
    getSubcategories(),
  ]);
  if (!product) notFound();
  if (session.role !== "admin" && product.store !== storeSlug) notFound();

  const discounts = await getDiscountMap(product.store);
  // The list this product was opened from, filters and all — Back, Save
  // and Delete all return there instead of to an unfiltered list.
  const backHref = productsReturnPath(
    (await searchParams).from,
    session.role === "admin" ? "/admin/products" : "/vendor/products",
  );

  return (
    <ProductEditor
      mode="edit"
      action={updateProduct}
      storeSlug={storeSlug}
      product={product}
      discountPct={discounts[product.id] ?? 0}
      categories={categories.map((c) => ({
        value: c.slug,
        label: c.name,
        icon: c.icon,
        depth: c.depth,
      }))}
      subcategories={subcategories}
      attributeSets={attributeSetsFor(categories)}
      aiSuggest={aiMatchingAvailable()}
      backHref={backHref}
      returnTo={backHref}
      previewHref={`/product/${product.slug}`}
      dangerZone={
        <div className="flex flex-col gap-3 rounded-2xl border border-coral-100 bg-coral-100/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-coral-700">Delete this product</p>
            <p className="text-xs text-slate-500">
              Removes it from the marketplace permanently. To take it down for a while, set it
              to Hidden instead.
            </p>
          </div>
          <form action={deleteProduct.bind(null, product.id, backHref)}>
            <PendingButton className="rounded-full border border-coral-500 px-4 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
              Delete product
            </PendingButton>
          </form>
        </div>
      }
    />
  );
}
