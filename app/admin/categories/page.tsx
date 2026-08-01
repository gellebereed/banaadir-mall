import type { Metadata } from "next";
import CategoryManagerClient from "@/components/dashboard/CategoryManagerClient";
import { getCategories } from "@/lib/api";

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
  const categories = await getCategories(true);

  return <CategoryManagerClient initialCategories={categories} />;
}
