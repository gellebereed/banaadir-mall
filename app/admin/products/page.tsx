import type { Metadata } from "next";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import AdminProductFilters from "@/components/dashboard/AdminProductFilters";
import { getBaseProducts, getCategories, getStores } from "@/lib/api";
import { sellableUnits } from "@/lib/odoo/mapping";
import { compact, money } from "@/lib/format";

export const metadata: Metadata = { title: "Products" };

/**
 * Admin product catalog across all stores — every product is editable.
 * Shows base (undiscounted) prices, matching what the edit form saves.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const param = (key: string) => {
    const value = params[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const filters = { q: param("q"), store: param("store"), category: param("category"), stock: param("stock") };

  const [products, stores, categoryList] = await Promise.all([
    getBaseProducts(),
    getStores(),
    getCategories(true),
  ]);
  const storeName = (slug: string) =>
    stores.find((s) => s.slug === slug)?.name ?? slug;
  const categoryNames = new Map(categoryList.map((c) => [c.slug, c.name]));

  // Categories that actually hold products, biggest first — the same
  // order the seller's list uses.
  const categoryCounts = new Map<string, number>();
  for (const p of products) {
    if (p.category) categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
  }
  const categoryOptions = [...categoryCounts.entries()]
    .map(([slug, count]) => ({ slug, count, name: categoryNames.get(slug) ?? slug }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const q = filters.q.toLowerCase();
  const shown = products.filter((p) => {
    if (filters.store && p.store !== filters.store) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.stock === "low" && !(p.stock > 0 && p.stock <= 15)) return false;
    if (filters.stock === "out" && p.stock > 0) return false;
    if (q) {
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        Boolean(p.internalReference?.toLowerCase().includes(q)) ||
        Boolean(p.barcode?.toLowerCase().includes(q))
      );
    }
    return true;
  });
  const filtersActive = Object.values(filters).some(Boolean);

  // This list, filters and all — the editor comes back here.
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value) as [string, string][],
  ).toString();
  const editQuery = query ? `?from=${encodeURIComponent(`/admin/products?${query}`)}` : "";

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

      <AdminProductFilters
        key={query}
        {...filters}
        stores={stores.map((s) => ({ slug: s.slug, name: s.name }))}
        categories={categoryOptions}
        active={filtersActive}
      />
      {filtersActive && (
        <p className="mt-3 px-1 text-xs text-slate-500">
          <strong className="text-slate-700">{shown.length.toLocaleString()}</strong> of{" "}
          {products.length.toLocaleString()} products match
        </p>
      )}

      <div className="card mt-3 overflow-x-auto">
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-500">
                  Nothing matches these filters.{" "}
                  <Link href="/admin/products" className="font-bold text-ocean-700 hover:underline">
                    Clear filters
                  </Link>
                </td>
              </tr>
            )}
            {shown.map((p) => (
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
                  {categoryNames.get(p.category) ?? p.category.replace("-", " ")}
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
                    href={`/vendor/products/${p.id}/edit${editQuery}`}
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
