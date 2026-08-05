import type { Metadata } from "next";
import Link from "next/link";
import ImportWizard from "@/components/dashboard/ImportWizard";
import { getCategoriesFlat } from "@/lib/api";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Import products" };

/**
 * Bulk product import from a supplier spreadsheet.
 *
 * The category list is resolved here rather than in the wizard so the
 * "file everything under" picker shows the tree as the storefront has it —
 * indented, and including hidden categories, which are still valid parents.
 */
export default async function ImportProductsPage() {
  const { session } = await requireVendor();

  // Matched by the same check in ./actions.ts. This one only saves the
  // person a wasted upload — the action is what actually enforces it.
  if (!may(session, "products.import") || !may(session, "costs.view")) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <span className="text-4xl">🔒</span>
        <h1 className="mt-3 font-display text-xl font-extrabold text-ocean-950">
          You cannot import supplier files
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Importing works from supplier cost prices, so it needs both the
          import and the &ldquo;see cost price &amp; profit&rdquo; permissions.
          Ask the store owner if you need them.
        </p>
        <Link href="/vendor/products" className="btn-primary mt-6 inline-block">
          Back to products
        </Link>
      </div>
    );
  }

  const categories = await getCategoriesFlat(true);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            Import products
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Turn a supplier invoice or packing list into products, with their
            colours, sizes, barcodes and stock. Nothing is saved until you have
            seen exactly what will happen.
          </p>
        </div>
        <Link href="/vendor/products" className="btn-secondary !px-4 !py-2 text-sm">
          Back to products
        </Link>
      </div>

      <div className="mt-6">
        <ImportWizard
          categories={categories.map((category) => ({
            slug: category.slug,
            name: category.name,
            depth: category.depth,
          }))}
        />
      </div>
    </div>
  );
}
