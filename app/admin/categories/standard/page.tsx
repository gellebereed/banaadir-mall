import type { Metadata } from "next";
import Link from "next/link";
import StandardLinker, { type LinkerRow } from "@/components/dashboard/StandardLinker";
import { getBaseProducts, getCategoriesFlat } from "@/lib/api";
import { HOLDING_SLUG } from "@/lib/category-holding";
import { standardNode, TAXONOMY_RELEASE } from "@/lib/taxonomy";
import { aiMatchingAvailable } from "@/lib/taxonomy-ai";

export const metadata: Metadata = {
  title: "Standard categories",
};

export const dynamic = "force-dynamic";

/**
 * Link every Banaadir category to the node of the standard taxonomy it
 * means. Suggestions come from Claude when ANTHROPIC_API_KEY is set (word
 * matching otherwise); nothing is linked until the admin approves it.
 */
export default async function StandardCategoriesPage() {
  const [flat, products] = await Promise.all([getCategoriesFlat(true), getBaseProducts()]);

  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  const rows: LinkerRow[] = flat
    .filter((c) => c.slug !== HOLDING_SLUG)
    .map((c) => {
      const node = standardNode(c.standardId);
      return {
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        depth: c.depth,
        products: counts.get(c.slug) ?? 0,
        linked: node ? { id: node.id, path: node.path } : null,
      };
    });

  return (
    <div className="space-y-6">
      <div className="card p-6 sm:p-8">
        <Link href="/admin/categories" className="text-sm font-semibold text-ocean-700 hover:underline">
          ← Categories
        </Link>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-ocean-950">🧭 Standard categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Each category is linked to what it means in a shared product taxonomy
          (Shopify&apos;s open standard, release {TAXONOMY_RELEASE}). Your menu keeps
          its own names and shape — the link is what keeps &ldquo;Dirac&rdquo; from one
          store and &ldquo;Dresses&rdquo; from another the same kind of thing, and what
          filters and automatic categorisation will build on.
        </p>
      </div>
      <StandardLinker rows={rows} aiAvailable={aiMatchingAvailable()} />
    </div>
  );
}
