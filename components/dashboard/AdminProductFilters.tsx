"use client";

import Form from "next/form";
import Link from "next/link";

const SELECT =
  "h-10 w-full min-w-0 truncate rounded-xl border border-sand-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200";

/**
 * Filters for the admin product catalogue. A plain GET form, so the
 * filters live in the URL: Back from the editor (and Save) returns to the
 * same filtered list. Picking from a dropdown applies it at once; the
 * search applies on Enter.
 */
export default function AdminProductFilters({
  q,
  store,
  category,
  stock,
  stores,
  categories,
  active,
}: {
  q: string;
  store: string;
  category: string;
  stock: string;
  stores: { slug: string; name: string }[];
  categories: { slug: string; name: string; count: number }[];
  active: boolean;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <Form
      action="/admin/products"
      className="card mt-5 grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
    >
      <label className="min-w-0 sm:col-span-2 lg:col-span-1">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Search</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, reference or barcode…"
            className="input !py-2.5 !pl-11"
          />
        </span>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Store</span>
        <select name="store" defaultValue={store} onChange={submit} className={SELECT}>
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
        <select name="category" defaultValue={category} onChange={submit} className={SELECT}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Stock</span>
        <select name="stock" defaultValue={stock} onChange={submit} className={SELECT}>
          <option value="">Any stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </label>
      <div className="flex h-10 items-center gap-2">
        <button type="submit" className="btn-primary !px-4 !py-2 text-sm">
          Filter
        </button>
        {active && (
          <Link href="/admin/products" className="whitespace-nowrap text-xs font-bold text-ocean-700 hover:underline">
            Clear
          </Link>
        )}
      </div>
    </Form>
  );
}
