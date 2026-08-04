import type { Metadata } from "next";
import Link from "next/link";
import { toggleProductHidden } from "@/app/actions";
import ProductImage from "@/components/ProductImage";
import { getBaseProductsByStore, getDiscountMap } from "@/lib/api";
import { sellableUnits } from "@/lib/odoo/mapping";
import { hasVariants, totalStock } from "@/lib/product-utils";
import { can } from "@/lib/auth";
import { compact, money } from "@/lib/format";
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
  const [products, discounts] = await Promise.all([
    getBaseProductsByStore(storeSlug),
    getDiscountMap(storeSlug),
  ]);
  const mayEdit = can(session, "products");
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

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">Reference / Barcode</th>
              <th className="px-5 py-3">Price</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Sold</th>
              <th className="px-5 py-3">Visibility</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                <td className="max-w-72 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <ProductImage
                      product={p}
                      iconClass="text-lg"
                      className="h-10 w-10 shrink-0 rounded-lg"
                      sizes="40px"
                    />
                    <div className="min-w-0">
                      <p className={`truncate font-semibold ${p.hidden ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {p.name}
                      </p>
                      {(p.images?.length ?? 0) === 0 && (
                        <p className="text-[11px] font-semibold text-mango-600">
                          ⚠ No photos yet
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                {/*
                  The identity column. "Not set" is deliberately visible
                  rather than blank — an uncoded product is the one that will
                  need reconciling by hand when Odoo is connected, and it can
                  only be fixed while someone still knows what it is.
                */}
                <td className="px-5 py-3.5">
                  {p.internalReference ? (
                    <p className="font-mono text-xs font-semibold text-slate-700">
                      {p.internalReference}
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-mango-600">No reference</p>
                  )}
                  {codedUnits(p) > 0 ? (
                    <p className="font-mono text-[11px] text-slate-400">
                      {p.barcode ??
                        `${codedUnits(p)}/${sellableUnits(p).length} variants coded`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400">No barcode</p>
                  )}
                </td>
                <td className="px-5 py-3.5 font-semibold">
                  {money(p.price)}
                  {p.compareAt && (
                    <span className="ml-1.5 text-xs text-slate-400 line-through">
                      {money(p.compareAt)}
                    </span>
                  )}
                  {discounts[p.id] && (
                    <span className="ml-1.5 rounded-full bg-coral-100 px-1.5 py-0.5 text-[10px] font-bold text-coral-600">
                      −{discounts[p.id]}%
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={totalStock(p) <= 15 ? "font-bold text-coral-600" : "text-slate-600"}>
                    {totalStock(p)}
                    {totalStock(p) <= 15 && " ⚠"}
                  </span>
                  {hasVariants(p) && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      ({p.variants!.length} variants)
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-slate-600">{compact(p.sold)}</td>
                <td className="px-5 py-3.5">
                  {mayEdit ? (
                    <form action={toggleProductHidden.bind(null, p.id)}>
                      <button
                        title={p.hidden ? "Click to show on storefront" : "Click to hide from storefront"}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                          p.hidden
                            ? "bg-sand-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
                            : "bg-emerald-100 text-emerald-700 hover:bg-sand-100 hover:text-slate-500"
                        }`}
                      >
                        {p.hidden ? "Hidden" : "Live"}
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">{p.hidden ? "Hidden" : "Live"}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {mayEdit && (
                    <Link
                      href={`/vendor/products/${p.id}/edit`}
                      className="mr-3 text-xs font-bold text-ocean-700 hover:underline"
                    >
                      Edit
                    </Link>
                  )}
                  <Link
                    href={`/product/${p.slug}`}
                    className="text-xs font-bold text-slate-400 hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
