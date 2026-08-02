import type { Metadata } from "next";
import CategoryManagerClient from "@/components/dashboard/CategoryManagerClient";
import { getCategoriesFlat } from "@/lib/api";

export const metadata: Metadata = {
  title: "Categories",
};

export const dynamic = "force-dynamic";

/**
 * Admin Category Management page.
 * Allows marketplace admins to add new categories, edit names/icons,
 * toggle visibility (hide/show on storefront navbar), or delete categories.
 */
export default async function AdminCategoriesPage() {
  // Flattened in TREE order — each parent immediately followed by its
  // children — so the indentation in the table lines up with the hierarchy.
  const categories = await getCategoriesFlat(true);

  return <CategoryManagerClient initialCategories={categories} />;
}
