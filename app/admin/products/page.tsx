import type { Metadata } from "next";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { getBaseProducts, getStores } from "@/lib/api";
import { sellableUnits } from "@/lib/odoo/mapping";
import { compact, money } from "@/lib/format";

export const metadata: Metadata = { title: "Products" };

/**
 * Admin product catalog across all stores — every product is editable.
 * Shows base (undiscounted) prices, matching what the edit form saves.
 */
export default async function AdminProductsPage() {
  const [products, stores] = await Promise.all([getBaseProducts(), getStores()]);
  const storeName = (slug: string) =>
    stores.find((s) => s.slug === slug)?.name ?? slug;

  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStock = products.filter((p) => p.stock <= 15);

  // Marketplace-wide Odoo readiness: how much of the catalogue can be
  // matched automatically when the two systems are connected, versus how
  // much someone will have to identify by hand.
  const units = products.flatMap(sellableUnits);
  const scannable = units.filter((u) => u.barcode).length;
  const referenced = units.filter((u) => u.reference).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Products</h1>
      <p className="mt-1 text-sm text-slate-500">
        {products.length} products · {totalStock.toLocaleString()} units in stock ·{" "}
        <span className={lowStock.length ? "font-semibold text-coral-600" : ""}>
          {lowStock.length} low stock
        </span>
      </p>
      <p className="mt-1 text-sm text-slate-500">
        🏷️ {units.length} sellable units · {scannable} with a barcode ·{" "}
        {referenced} with an internal reference
        {units.length > 0 && (
          <span className={scannable === units.length ? "text-emerald-600" : "text-mango-700"}>
            {" "}
            ({Math.round((scannable / units.length) * 100)}% scannable)
          </span>
        )}
      </p>

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">Reference</th>
              <th className="px-5 py-3">Store</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Price</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Sold</th>
              <th className="px-5 py-3">Rating</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                <td className="max-w-72 px-5 py-3.5">
                  <Link href={`/product/${p.slug}`} className="flex items-center gap-3 hover:text-ocean-700">
                    <ProductImage
                      product={p}
                      iconClass="text-lg"
                      className="h-10 w-10 shrink-0 rounded-lg"
                      sizes="40px"
                    />
                    <span className={`truncate font-semibold ${p.hidden ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {p.name}
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-mono text-xs text-slate-600">
                    {p.internalReference ?? <span className="text-slate-300">—</span>}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {p.barcode ?? <span className="text-slate-300">—</span>}
                  </p>
                </td>
                <td className="px-5 py-3.5 text-slate-500">{storeName(p.store)}</td>
                <td className="px-5 py-3.5 text-slate-500 capitalize">
                  {p.category.replace("-", " ")}
                </td>
                <td className="px-5 py-3.5 font-semibold">
                  {money(p.price)}
                  {p.compareAt && (
                    <span className="ml-1.5 text-xs text-slate-400 line-through">
                      {money(p.compareAt)}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={p.stock <= 15 ? "font-bold text-coral-600" : "text-slate-600"}>
                    {p.stock}
                    {p.stock <= 15 && " ⚠"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{compact(p.sold)}</td>
                <td className="px-5 py-3.5 text-slate-600">★ {p.rating}</td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/vendor/products/${p.id}/edit`}
                    className="text-xs font-bold text-ocean-700 hover:underline"
                  >
                    Edit →
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
