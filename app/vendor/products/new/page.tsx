import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createProduct } from "@/app/actions";
import ProductEditor from "@/components/dashboard/ProductEditor";
import { getEditorCategories, getSubcategories } from "@/lib/api";
import { may } from "@/lib/auth";
import { attributeSetsFor } from "@/lib/taxonomy-attributes";
import { aiMatchingAvailable } from "@/lib/taxonomy-ai";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Add Product" };

/**
 * Add-product form. Submitting really creates the product with its photos
 * and variants, and it appears in the storefront at once. The layout is
 * shared with the edit page — see ProductEditor.
 */
export default async function NewProductPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) redirect("/vendor");
  const [categories, subcategories] = await Promise.all([
    getEditorCategories(),
    getSubcategories(),
  ]);

  return (
    <ProductEditor
      mode="create"
      action={createProduct}
      storeSlug={storeSlug}
      categories={categories.map((c) => ({
        value: c.slug,
        label: c.name,
        icon: c.icon,
        depth: c.depth,
      }))}
      subcategories={subcategories}
      attributeSets={attributeSetsFor(categories)}
      aiSuggest={aiMatchingAvailable()}
      backHref="/vendor/products"
    />
  );
}
