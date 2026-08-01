"use client";

/**
 * The shared catalog browser: filter sidebar + sort bar + product grid.
 * Used by /products, /category/[slug] and /search — the server page fetches
 * the base product list and this component handles all client-side
 * filtering and sorting.
 *
 * With a real backend, move the filtering into lib/api.ts (server-side
 * query params) and keep this component as pure UI.
 */

import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { categories } from "@/lib/data/categories";
import type { Product, Store } from "@/lib/types";

type SortKey = "featured" | "sold" | "price-asc" | "price-desc" | "rating" | "discount" | "new";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "sold", label: "Best Selling" },
  { key: "price-asc", label: "Price: Low to High" },
  { key: "price-desc", label: "Price: High to Low" },
  { key: "rating", label: "Top Rated" },
  { key: "discount", label: "Biggest Discount" },
  { key: "new", label: "Newest" },
];

const PRICE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "Under $20", min: 0, max: 20 },
  { label: "$20 – $50", min: 20, max: 50 },
  { label: "$50 – $100", min: 50, max: 100 },
  { label: "Over $100", min: 100, max: Infinity },
];

export default function ShopClient({
  products,
  stores = [],
  title,
  subtitle,
  initialSort = "featured",
  showCategoryFilter = true,
}: {
  products: Product[];
  /** Stores present in this result set, for the brand filter. */
  stores?: Store[];
  title: string;
  subtitle?: string;
  initialSort?: string;
  showCategoryFilter?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>(
    SORTS.some((s) => s.key === initialSort) ? (initialSort as SortKey) : "featured",
  );
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [activeStores, setActiveStores] = useState<string[]>([]);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [priceBand, setPriceBand] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Only offer brands that actually appear in these results.
  const availableStores = useMemo(() => {
    const present = new Set(products.map((p) => p.store));
    return stores
      .filter((s) => present.has(s.slug))
      .sort((a, b) => Number(b.official ?? false) - Number(a.official ?? false));
  }, [products, stores]);

  const filtered = useMemo(() => {
    let list = [...products];

    if (activeCategories.length > 0) {
      list = list.filter((p) => activeCategories.includes(p.category));
    }
    if (activeStores.length > 0) {
      list = list.filter((p) => activeStores.includes(p.store));
    }
    if (activeSubcategory) {
      list = list.filter((p) => p.subcategory === activeSubcategory);
    }
    if (priceBand !== null) {
      const band = PRICE_BANDS[priceBand];
      list = list.filter((p) => p.price >= band.min && p.price < band.max);
    }
    if (minRating !== null) {
      list = list.filter((p) => p.rating >= minRating);
    }
    if (onSaleOnly) {
      list = list.filter((p) => p.compareAt);
    }

    switch (sort) {
      case "sold":
        list.sort((a, b) => b.sold - a.sold);
        break;
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating);
        break;
      case "discount":
        list.sort(
          (a, b) =>
            (b.compareAt ? 1 - b.price / b.compareAt : 0) -
            (a.compareAt ? 1 - a.price / a.compareAt : 0),
        );
        break;
      case "new":
        list.sort((a, b) => (b.badge === "New" ? 1 : 0) - (a.badge === "New" ? 1 : 0));
        break;
    }
    return list;
  }, [products, sort, activeCategories, activeStores, activeSubcategory, priceBand, minRating, onSaleOnly]);

  /** Subcategories present in these results, for the chip row. */
  const subcategories = useMemo(
    () =>
      [...new Set(products.map((p) => p.subcategory).filter((s): s is string => Boolean(s)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [products],
  );

  const activeFilterCount =
    activeCategories.length +
    activeStores.length +
    (activeSubcategory ? 1 : 0) +
    (priceBand !== null ? 1 : 0) +
    (minRating !== null ? 1 : 0) +
    (onSaleOnly ? 1 : 0);

  function clearFilters() {
    setActiveCategories([]);
    setActiveStores([]);
    setActiveSubcategory(null);
    setPriceBand(null);
    setMinRating(null);
    setOnSaleOnly(false);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold text-ocean-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {/* Subcategory chips — sellers create these by typing one on a product */}
      {subcategories.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSubcategory(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeSubcategory === null
                ? "bg-ocean-700 text-white"
                : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
            }`}
          >
            All
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setActiveSubcategory(sub === activeSubcategory ? null : sub)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeSubcategory === sub
                  ? "bg-ocean-700 text-white"
                  : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar: result count, mobile filter toggle, sort */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <strong className="text-slate-800">{filtered.length}</strong> products
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 lg:hidden"
          >
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-ocean-500"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Filter sidebar (always visible on desktop, toggled on mobile) */}
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
          <div className="card space-y-6 p-5 lg:sticky lg:top-40">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold text-coral-600 hover:underline"
              >
                ✕ Clear all filters
              </button>
            )}

            {showCategoryFilter && (
              <FilterGroup label="Category">
                {categories.map((c) => (
                  <label key={c.slug} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={activeCategories.includes(c.slug)}
                      onChange={(e) =>
                        setActiveCategories((prev) =>
                          e.target.checked
                            ? [...prev, c.slug]
                            : prev.filter((s) => s !== c.slug),
                        )
                      }
                      className="h-4 w-4 accent-ocean-700"
                    />
                    {c.icon} {c.name}
                  </label>
                ))}
              </FilterGroup>
            )}

            {availableStores.length > 1 && (
              <FilterGroup label="Brand / Store">
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {availableStores.map((s) => (
                    <label key={s.slug} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={activeStores.includes(s.slug)}
                        onChange={(e) =>
                          setActiveStores((prev) =>
                            e.target.checked
                              ? [...prev, s.slug]
                              : prev.filter((slug) => slug !== s.slug),
                          )
                        }
                        className="h-4 w-4 accent-ocean-700"
                      />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.official && (
                        <span className="shrink-0 rounded bg-mango-100 px-1.5 text-[9px] font-bold text-mango-800">
                          BRAND
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </FilterGroup>
            )}

            <FilterGroup label="Price">
              {PRICE_BANDS.map((band, i) => (
                <label key={band.label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="radio"
                    name="price"
                    checked={priceBand === i}
                    onChange={() => setPriceBand(i)}
                    className="h-4 w-4 accent-ocean-700"
                  />
                  {band.label}
                </label>
              ))}
            </FilterGroup>

            <FilterGroup label="Rating">
              {[4.5, 4.0].map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="radio"
                    name="rating"
                    checked={minRating === r}
                    onChange={() => setMinRating(r)}
                    className="h-4 w-4 accent-ocean-700"
                  />
                  <span className="text-mango-400">★</span> {r}+ stars
                </label>
              ))}
            </FilterGroup>

            <FilterGroup label="Deals">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={onSaleOnly}
                  onChange={(e) => setOnSaleOnly(e.target.checked)}
                  className="h-4 w-4 accent-ocean-700"
                />
                On sale only
              </label>
            </FilterGroup>
          </div>
        </aside>

        {/* Product grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 self-start sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-3 self-start p-12 text-center">
            <span className="text-5xl">🔍</span>
            <p className="font-display text-lg font-bold text-ocean-950">
              No products match these filters
            </p>
            <button onClick={clearFilters} className="btn-secondary !py-2 text-sm">
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2.5 font-display text-sm font-bold uppercase tracking-wide text-ocean-950">
        {label}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}
