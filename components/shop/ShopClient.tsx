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

import { useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { categories as seedCategories } from "@/lib/data/categories";
import type { Category, Product, Store } from "@/lib/types";

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
  categories: liveCategories,
  title,
  subtitle,
  initialSort = "featured",
  showCategoryFilter = true,
}: {
  products: Product[];
  /** Stores present in this result set, for the brand filter. */
  stores?: Store[];
  /**
   * The real category list. Falls back to the bundled seed only when a
   * caller hasn't passed one — filtering against the seed meant every
   * category created since launch was missing from the sidebar, so
   * products filed under one could not be filtered to at all.
   */
  categories?: Category[];
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

  const [gridCols, setGridCols] = useState<3 | 4 | 5>(4);
  const BATCH_SIZE = 16;
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // Reset visible count whenever filters or sort change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [sort, activeCategories, activeStores, activeSubcategory, priceBand, minRating, onSaleOnly]);

  const displayedProducts = useMemo(() => {
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount]);

  const hasMore = visibleCount < filtered.length;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 12, filtered.length));
        }
      },
      { rootMargin: "300px" }
    );

    const node = loadMoreRef.current;
    if (node) observer.observe(node);

    return () => {
      if (node) observer.unobserve(node);
    };
  }, [hasMore, filtered.length]);

  const categories = liveCategories?.length ? liveCategories : seedCategories;

  /**
   * What the chip row above the grid offers.
   *
   * Two different questions, depending on where you are:
   *
   *   · On a mixed list ("All Products", a search), the useful cut is by
   *     CATEGORY — a curated, consistently-named set.
   *   · Inside one category, every product shares it, so the useful cut is
   *     the finer sub-grouping.
   *
   * The old row always used sub-categories, which on All Products produced
   * "Accessories · Jacket · Polo Shirt · Shoes · Suits" — free text typed
   * by different sellers, mixing singular and plural, and covering only the
   * handful of products that happened to have one filled in.
   */
  const categoriesPresent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([slug, count]) => {
        const category = categories.find((c) => c.slug === slug);
        const parent = category?.parentSlug
          ? categories.find((c) => c.slug === category.parentSlug)
          : undefined;
        return {
          slug,
          count,
          name: category?.name ?? slug.replace(/-/g, " "),
          icon: category?.icon,
          // Which department it sits under, so a sidebar listing both
          // "Men's Fashion" and "Jackets" doesn't read as two unrelated
          // things at the same level.
          parentName: parent?.name,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products, categories]);

  const subcategories = useMemo(
    () =>
      [...new Set(products.map((p) => p.subcategory).filter((s): s is string => Boolean(s)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [products],
  );

  // More than one category in the results means the list is mixed.
  const chipMode: "category" | "subcategory" =
    categoriesPresent.length > 1 ? "category" : "subcategory";

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

  const gridClass =
    gridCols === 3
      ? "grid grid-cols-2 gap-3 self-start sm:gap-4 md:grid-cols-3 lg:grid-cols-3"
      : gridCols === 5
      ? "grid grid-cols-2 gap-3 self-start sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      : "grid grid-cols-2 gap-3 self-start sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold text-ocean-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {/* Quick cut across the results — by category on a mixed list, by
          sub-grouping once everything shares one category. */}
      {chipMode === "category" && categoriesPresent.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip
            active={activeCategories.length === 0}
            onClick={() => setActiveCategories([])}
            label="All"
            count={products.length}
          />
          {categoriesPresent.map((c) => (
            <Chip
              key={c.slug}
              active={activeCategories.length === 1 && activeCategories[0] === c.slug}
              // Chips are a quick single cut; the sidebar is where several
              // categories get combined. Selecting one here replaces rather
              // than adds, which is what a row of pills reads as.
              onClick={() =>
                setActiveCategories((prev) =>
                  prev.length === 1 && prev[0] === c.slug ? [] : [c.slug],
                )
              }
              label={c.icon ? `${c.icon} ${c.name}` : c.name}
              count={c.count}
            />
          ))}
        </div>
      )}

      {chipMode === "subcategory" && subcategories.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip
            active={activeSubcategory === null}
            onClick={() => setActiveSubcategory(null)}
            label="All"
            count={products.length}
          />
          {subcategories.map((sub) => (
            <Chip
              key={sub}
              active={activeSubcategory === sub}
              onClick={() => setActiveSubcategory(sub === activeSubcategory ? null : sub)}
              label={sub}
              count={products.filter((p) => p.subcategory === sub).length}
            />
          ))}
        </div>
      )}

      {/* Toolbar: result count, mobile filter toggle, grid view switcher, sort */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Showing <strong className="text-slate-800">{displayedProducts.length}</strong> of{" "}
          <strong className="text-slate-800">{filtered.length}</strong> products
        </p>

        <div className="flex items-center gap-2.5">
          {/* Grid View Columns Switcher */}
          <div className="hidden items-center gap-1 rounded-full border border-sand-200 bg-white p-1 sm:flex shadow-2xs">
            <span className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              View
            </span>
            {[
              { cols: 3, label: "3 Grid", icon: "⊞" },
              { cols: 4, label: "4 Grid", icon: "▦" },
              { cols: 5, label: "5 Grid", icon: "▧" },
            ].map((item) => (
              <button
                key={item.cols}
                type="button"
                onClick={() => setGridCols(item.cols as 3 | 4 | 5)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                  gridCols === item.cols
                    ? "bg-ocean-800 text-white shadow-xs"
                    : "text-slate-500 hover:bg-sand-100 hover:text-slate-800"
                }`}
                title={`${item.label} per row`}
              >
                {item.icon} <span className="hidden md:inline">{item.cols}</span>
              </button>
            ))}
          </div>

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
            className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-ocean-500 shadow-2xs"
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
        {/* Filter sidebar (always visible on desktop with independent scrolling) */}
        <aside className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
          <div className="card space-y-6 p-5 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:overscroll-contain rail-scroll">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold text-coral-600 hover:underline"
              >
                ✕ Clear all filters
              </button>
            )}

            {/* Only categories that actually have products here. Listing
                every category in the marketplace fills the sidebar with
                rows that return nothing when ticked. */}
            {showCategoryFilter && categoriesPresent.length > 1 && (
              <FilterGroup label="Category">
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {categoriesPresent.map((c) => (
                    <label
                      key={c.slug}
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"
                    >
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
                      <span className="min-w-0 flex-1 truncate">
                        {c.icon} {c.name}
                        {c.parentName && (
                          <span className="block text-[11px] text-slate-400">
                            in {c.parentName}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{c.count}</span>
                    </label>
                  ))}
                </div>
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

        {/* Product grid & Infinite Scroll */}
        {filtered.length > 0 ? (
          <div className="flex flex-col">
            <div className={gridClass}>
              {displayedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            {/* Infinite Scroll trigger element */}
            {hasMore ? (
              <div ref={loadMoreRef} className="my-8 flex flex-col items-center justify-center gap-2 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-ocean-800">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ocean-700 border-t-transparent" />
                  Loading more products…
                </div>
                <p className="text-xs text-slate-400">
                  Showing {displayedProducts.length} of {filtered.length} products
                </p>
              </div>
            ) : (
              <div className="my-8 text-center text-xs text-slate-400">
                ✓ You&apos;ve reached the end of the catalogue ({filtered.length} products)
              </div>
            )}
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

/** A filter pill. The count is what makes it worth tapping — or not. */
function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-ocean-700 text-white"
          : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
      )}
    </button>
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
