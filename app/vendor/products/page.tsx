import type { Metadata } from "next";
import Link from "next/link";
import VendorProductsTable from "@/components/dashboard/VendorProductsTable";
import { getBaseProductsByStore, getCategories, getDiscountMap } from "@/lib/api";
import { sellableUnits } from "@/lib/odoo/mapping";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Products" };

/** How many of a product's sellable units carry a barcode. */
function codedUnits(product: Product): number {
  return sellableUnits(product).filter((u) => u.barcode).length;
}

/** Seller product management: edit, hide/show, add. */
export default async function VendorProductsPage() {
  const { session, storeSlug } = await requireVendor();
  // Base prices, so sellers always see and edit their own numbers rather
  // than the temporarily discounted ones customers are charged.
  const [products, discounts, categories] = await Promise.all([
    getBaseProductsByStore(storeSlug),
    getDiscountMap(storeSlug),
    // Hidden ones included: a product can sit in a category the shopper
    // cannot browse to, and the seller still needs to filter by it.
    getCategories(true),
  ]);
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const mayEdit = may(session, "products.edit");
  const discountedCount = Object.keys(discounts).length;

  // Catalogue readiness. Every unit without a barcode is one a stocktake
  // can't scan and one the Odoo sync will have to match by hand, so the
  // number is worth showing before it grows.
  const units = products.flatMap(sellableUnits);
  const unitsWithoutBarcode = units.filter((u) => !u.barcode).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            My Products ({products.length})
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Edit prices, stock and sales. Hidden products stay here but leave
            the storefront.
          </p>
        </div>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/vendor/products/import"
              className="btn-secondary !px-4 !py-2 text-sm"
            >
              ⬆ Import from file
            </Link>
            <Link href="/vendor/products/new" className="btn-primary !px-4 !py-2 text-sm">
              + Add Product
            </Link>
          </div>
        )}
      </div>

      {discountedCount > 0 && (
        <p className="mt-4 rounded-xl bg-coral-100/50 px-4 py-3 text-sm text-coral-700">
          🏷️ A discount is active on <strong>{discountedCount}</strong> of your
          products — these are your normal prices, customers pay less on the
          ones marked below.{" "}
          <Link href="/vendor/promotions" className="font-bold underline">
            Manage promotions
          </Link>
        </p>
      )}

      {unitsWithoutBarcode > 0 && mayEdit && (
        <p className="mt-4 rounded-xl bg-ocean-50 px-4 py-3 text-sm text-ocean-900">
          🏷️ <strong>{unitsWithoutBarcode}</strong> of your{" "}
          <strong>{units.length}</strong> sellable items have no barcode yet.
          Adding them now means stock can be scanned instead of counted by
          hand — and matched automatically when the shop is connected to Odoo.
        </p>
      )}

      {!mayEdit && (
        <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-800">
          👁️ Your account has view-only access to products. Ask a manager for
          the <strong>products</strong> role to make changes.
        </p>
      )}

      {/* Interactive Products Table with Batch Edit, Filters, Search & Favorites */}
      <VendorProductsTable
        products={products}
        discounts={discounts}
        mayEdit={mayEdit}
        categoryNames={categoryNames}
      />
    </div>
  );
}
