import type { Metadata } from "next";
import CategoryManagerClient from "@/components/dashboard/CategoryManagerClient";
import CategoryTidyPanel from "@/components/dashboard/CategoryTidyPanel";
import { getBaseProducts, getCategories, getCategoriesFlat } from "@/lib/api";
import { proposeTidy } from "@/lib/category-tidy";

export const metadata: Metadata = {
  title: "Categories",
};

export const dynamic = "force-dynamic";

/**
 * Admin Category Management page.
 * Allows marketplace admins to add new categories, edit names/icons,
 * toggle visibility (hide/show on storefront navbar), or delete categories.
 *
 * The tidy-up panel sits above the table: a supplier import files its own
 * groupings straight under a department, and the resulting strays are what
 * make the storefront menu unreadable. Suggestions only — see
 * lib/category-tidy.ts.
 */
export default async function AdminCategoriesPage() {
  // Flattened in TREE order — each parent immediately followed by its
  // children — so the indentation in the table lines up with the hierarchy.
  const [categories, flat, products] = await Promise.all([
    getCategories(true),
    getCategoriesFlat(true),
    getBaseProducts(),
  ]);

  // How many products would move if a category were merged away. Counted
  // here rather than in the matcher so the engine stays free of data access.
  const productCounts = new Map<string, number>();
  for (const product of products) {
    productCounts.set(product.category, (productCounts.get(product.category) ?? 0) + 1);
  }

  const proposals = proposeTidy(categories, productCounts);

  return (
    <div>
      <CategoryTidyPanel proposals={proposals} />
      <CategoryManagerClient initialCategories={flat} />
    </div>
  );
}
