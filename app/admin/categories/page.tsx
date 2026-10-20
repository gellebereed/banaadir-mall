import type { Metadata } from "next";
import CategoryManagerClient from "@/components/dashboard/CategoryManagerClient";
import CategoryTidyPanel from "@/components/dashboard/CategoryTidyPanel";
import HoldingQueue, { type HeldGroup } from "@/components/dashboard/HoldingQueue";
import { getAllStores, getBaseProducts, getCategories, getCategoriesFlat } from "@/lib/api";
import { HOLDING_SLUG, suggestCategory } from "@/lib/category-mappings";
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

  const proposals = proposeTidy(
    categories.filter((c) => c.slug !== HOLDING_SLUG),
    productCounts,
  );

  // ── The "Needs a category" queue, grouped by store + supplier grouping ──
  const stores = await getAllStores();
  const storeName = new Map(stores.map((s) => [s.slug, s.name]));
  const held = new Map<string, HeldGroup>();
  for (const p of products) {
    if (p.category !== HOLDING_SLUG) continue;
    const grouping = p.supplier?.grouping ?? "";
    const key = `${p.store}::${grouping}`;
    const group =
      held.get(key) ??
      ({
        key,
        store: p.store,
        storeName: storeName.get(p.store) ?? p.store,
        grouping,
        count: 0,
        samples: [],
        suggestion: grouping ? suggestCategory(grouping, categories) : undefined,
      } as HeldGroup);
    group.count++;
    if (group.samples.length < 3) group.samples.push(p.name);
    held.set(key, group);
  }
  const heldGroups = [...held.values()].sort((a, b) => b.count - a.count);
  const fileOptions = flat
    .filter((c) => c.slug !== HOLDING_SLUG)
    .map((c) => ({ value: c.slug, label: c.name, icon: c.icon, depth: c.depth }));

  return (
    <div>
      <HoldingQueue groups={heldGroups} options={fileOptions} />
      <CategoryTidyPanel proposals={proposals} />
      <CategoryManagerClient initialCategories={flat} />
    </div>
  );
}
