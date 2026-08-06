"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { batchUpdateProducts, toggleProductFeatured, toggleProductHidden } from "@/app/actions";
import { compact, money } from "@/lib/format";
import { sellableUnits } from "@/lib/odoo/mapping";
import { hasVariants, totalStock } from "@/lib/product-utils";
import type { Product } from "@/lib/types";

function codedUnits(product: Product): number {
  return sellableUnits(product).filter((u) => u.barcode).length;
}

const TABS: { id: string; label: string; icon: string }[] = [
  { id: "all", label: "All Products", icon: "📦" },
  { id: "live", label: "Live", icon: "🟢" },
  { id: "hidden", label: "Hidden", icon: "👁️" },
  { id: "featured", label: "Favorites / Featured", icon: "⭐" },
  { id: "low_stock", label: "Low Stock", icon: "⚠" },
  { id: "no_photos", label: "No Photos", icon: "📸" },
];

/** Rows shown at once. An imported catalogue is thousands of products. */
const PAGE_SIZE = 50;

/**
 * When this product was last touched, as a sortable number.
 *
 * 0 for anything with no timestamp — a catalogue that predates the
 * `updated_at` migration sorts to the bottom rather than jumbling itself
 * randomly among the rows that do have one.
 */
function editedAt(product: Product): number {
  const value = product.updatedAt ? Date.parse(product.updatedAt) : NaN;
  return Number.isFinite(value) ? value : 0;
}

/** "3 minutes ago" — how recent an edit reads at a glance. */
function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function VendorProductsTable({
  products,
  discounts,
  mayEdit,
  categoryNames = {},
}: {
  products: Product[];
  discounts: Record<string, number>;
  mayEdit: boolean;
  /** category slug → display name, so the filter reads like the shop does. */
  categoryNames?: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [page, setPage] = useState(1);

  /*
   * CATEGORY is the filter this list was missing.
   *
   * Only `subcategory` was filterable, and an imported catalogue does not
   * set it — so on 1,688 kitchenware products the one dropdown on the page
   * was empty, while the 100 real groupings (Cake Pans, Coffee Cups, Pots)
   * had no filter at all. Categories are listed with their product counts
   * and sorted by size, so the big ones are reachable first.
   */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([slug, count]) => ({ slug, count, name: categoryNames[slug] ?? slug }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products, categoryNames]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Subcategories present in dataset
  const subcategories = Array.from(
    new Set(products.map((p) => p.subcategory).filter(Boolean)),
  ) as string[];
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");

  const countByTab = (tabId: string) => {
    if (tabId === "all") return products.length;
    if (tabId === "live") return products.filter((p) => !p.hidden).length;
    if (tabId === "hidden") return products.filter((p) => p.hidden).length;
    if (tabId === "featured") return products.filter((p) => p.featured).length;
    if (tabId === "low_stock") return products.filter((p) => totalStock(p) <= 15).length;
    if (tabId === "no_photos") return products.filter((p) => (p.images?.length ?? 0) === 0).length;
    return 0;
  };

  // Filter products
  const filtered = useMemo(() => {
    const list = products.filter((p) => {
      // 1. Tab filter
      if (activeTab === "live" && p.hidden) return false;
      if (activeTab === "hidden" && !p.hidden) return false;
      if (activeTab === "featured" && !p.featured) return false;
      if (activeTab === "low_stock" && totalStock(p) > 15) return false;
      if (activeTab === "no_photos" && (p.images?.length ?? 0) > 0) return false;

      // 2. Category / subcategory
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (selectedSubcategory !== "all" && p.subcategory !== selectedSubcategory) return false;

      // 3. Search query — matched against every code a seller might type,
      // including the variant codes, which is what is on a scanner label.
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.internalReference && p.internalReference.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.subcategory && p.subcategory.toLowerCase().includes(q)) ||
          (p.variants ?? []).some(
            (v) =>
              (v.sku && v.sku.toLowerCase().includes(q)) ||
              (v.barcode && v.barcode.toLowerCase().includes(q)),
          )
        );
      }
      return true;
    });

    if (sortBy === "price_asc") return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "price_desc") return [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "stock_asc") return [...list].sort((a, b) => totalStock(a) - totalStock(b));
    if (sortBy === "stock_desc") return [...list].sort((a, b) => totalStock(b) - totalStock(a));
    if (sortBy === "name_asc") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "oldest") return [...list].sort((a, b) => editedAt(a) - editedAt(b));

    /*
     * Default: most recently edited first.
     *
     * The list used to arrive in whatever order the database returned,
     * which after a 1,688-row import is effectively arbitrary. The product
     * you just changed is the one you are most likely to want next — to
     * check it, to fix a typo, to add its photo — and hunting for it
     * through 34 pages is not a search anyone should have to run.
     */
    return [...list].sort((a, b) => editedAt(b) - editedAt(a));
  }, [products, activeTab, selectedCategory, selectedSubcategory, searchQuery, sortBy]);

  /*
   * PAGINATION.
   *
   * Rendering 1,688 rows put ~20,000 DOM nodes on the page: every keystroke
   * in the search box re-rendered all of them, and the browser scrolled
   * like treacle. The batch toolbar still works across the WHOLE filtered
   * set, not just this page — see "select all matching" below — so paging
   * costs nothing operationally.
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Any change to what is being filtered puts you back on page one —
  // otherwise a search returning 3 results while you sit on page 12 shows
  // an empty table.
  useEffect(() => {
    setPage(1);
  }, [activeTab, selectedCategory, selectedSubcategory, searchQuery, sortBy]);

  // Selection handlers. "All" means every row that matches the filters,
  // across pages — the checkbox in the header covers this page only.
  const allFilteredIds = filtered.map((p) => p.id);
  const visibleIds = visible.map((p) => p.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const selectedBeyondPage = selectedIds.length > visibleIds.length;

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  // Batch actions
  function handleBatchAction(action: "hide" | "show" | "feature" | "unfeature" | "delete" | "price" | "stock") {
    if (selectedIds.length === 0) return;

    let value: number | undefined = undefined;

    if (action === "price") {
      const input = prompt(`Enter new price in USD for ${selectedIds.length} selected products:`);
      if (input === null) return;
      const parsed = parseFloat(input);
      if (isNaN(parsed) || parsed < 0) {
        alert("Please enter a valid positive price.");
        return;
      }
      value = parsed;
    }

    if (action === "stock") {
      const input = prompt(`Enter new stock quantity for ${selectedIds.length} selected products:`);
      if (input === null) return;
      const parsed = parseInt(input, 10);
      if (isNaN(parsed) || parsed < 0) {
        alert("Please enter a valid non-negative integer for stock.");
        return;
      }
      value = parsed;
    }

    if (action === "delete") {
      if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} selected products?`)) {
        return;
      }
    }

    startTransition(async () => {
      const res = await batchUpdateProducts(selectedIds, action, value);
      setStatusMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        if (action === "delete") setSelectedIds([]);
      }
    });
  }

  return (
    <div className="mt-5 space-y-4">
      {/* ── Status Tabs Bar ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-sand-100/70 p-1.5 border border-sand-200">
          {TABS.map((tab) => {
            const count = countByTab(tab.id);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  isActive
                    ? "bg-white text-ocean-950 shadow-xs ring-1 ring-black/5"
                    : "text-slate-600 hover:bg-white/60 hover:text-ocean-900"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive ? "bg-ocean-100 text-ocean-800 font-bold" : "bg-sand-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Controls: Search, Category, Subcategory & Sort ───────── */}
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 1 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="max-w-52 rounded-xl border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All categories ({products.length})</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name} ({category.count})
                </option>
              ))}
            </select>
          )}

          {subcategories.length > 0 && (
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="rounded-xl border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All Subcategories</option>
              {subcategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="default">Sort: Recently edited</option>
            <option value="oldest">Least recently edited</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="stock_asc">Stock: Low to High</option>
            <option value="stock_desc">Stock: High to Low</option>
          </select>

          <div className="relative shrink-0 sm:w-60">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, SKU, barcode…"
              className="input !py-1.5 text-xs pl-8"
            />
            <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
          </div>
        </div>
      </div>

      {/* ── Floating Batch Action Toolbar ──────────────────────────── */}
      {mayEdit && selectedIds.length > 0 && (
        <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ocean-950 p-3.5 text-white shadow-xl ring-1 ring-white/10 animate-fade-up">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ocean-800 font-mono text-xs font-bold text-mango-400">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedIds.length === 1 ? "1 product" : `${selectedIds.length} products`} selected
            </span>
            {/*
              Batch actions have to be able to reach the whole result set.
              Publishing 1,688 imported products 50 at a time is not a
              workflow anyone would finish.
            */}
            {!selectedBeyondPage && filtered.length > visibleIds.length && (
              <button
                type="button"
                onClick={() => setSelectedIds(allFilteredIds)}
                className="text-xs font-bold text-mango-400 underline hover:text-mango-300"
              >
                Select all {filtered.length} matching
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("show")}
              className="rounded-lg bg-emerald-600/90 px-3 py-1 text-xs font-bold transition hover:bg-emerald-600 disabled:opacity-50"
            >
              🟢 Make Live
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("hide")}
              className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold transition hover:bg-slate-700 disabled:opacity-50"
            >
              👁️ Hide
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("feature")}
              className="rounded-lg bg-mango-500/90 px-3 py-1 text-xs font-bold text-ocean-950 transition hover:bg-mango-500 disabled:opacity-50"
            >
              ⭐ Feature on Brand Page
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("unfeature")}
              className="rounded-lg bg-ocean-800 px-3 py-1 text-xs font-bold transition hover:bg-ocean-700 disabled:opacity-50"
            >
              ☆ Unfeature
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("price")}
              className="rounded-lg bg-ocean-800 px-3 py-1 text-xs font-bold transition hover:bg-ocean-700 disabled:opacity-50"
            >
              💲 Set Price
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("stock")}
              className="rounded-lg bg-ocean-800 px-3 py-1 text-xs font-bold transition hover:bg-ocean-700 disabled:opacity-50"
            >
              🏷️ Set Stock
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleBatchAction("delete")}
              className="rounded-lg bg-rose-600/90 px-3 py-1 text-xs font-bold transition hover:bg-rose-600 disabled:opacity-50"
            >
              🗑️ Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="ml-2 text-xs text-ocean-300 hover:text-white underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`rounded-xl p-3 text-xs font-bold flex items-center justify-between ${
            statusMessage.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{statusMessage.ok ? "✓ " : "⚠ "}{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* ── Main Products Table ────────────────────────────────────── */}
      <div className="card overflow-hidden border border-sand-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50/80 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {mayEdit && (
                  <th className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-ocean-700 rounded cursor-pointer"
                      title="Select all products"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Reference / Barcode</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Storefront &amp; Favorites</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={mayEdit ? 8 : 7} className="px-4 py-10 text-center text-slate-400">
                    <span className="text-2xl block mb-1">🔍</span>
                    No products found matching your filter.
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors align-middle ${
                        isSelected
                          ? "bg-ocean-50/60"
                          : p.featured
                            ? "bg-amber-50/20 hover:bg-amber-50/40"
                            : "hover:bg-sand-50/60"
                      }`}
                    >
                      {mayEdit && (
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(p.id)}
                            className="h-4 w-4 accent-ocean-700 rounded cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Product Name & Artwork */}
                      <td className="max-w-72 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            product={p}
                            iconClass="text-lg"
                            className="h-10 w-10 shrink-0 rounded-lg border border-sand-200"
                            sizes="40px"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p
                                className={`truncate font-semibold ${
                                  p.hidden ? "text-slate-400 line-through" : "text-slate-900"
                                }`}
                              >
                                {p.name}
                              </p>
                              {p.featured && (
                                <span
                                  title="Pinned as Storefront Favorite"
                                  className="shrink-0 text-mango-500 font-extrabold text-xs"
                                >
                                  ⭐
                                </span>
                              )}
                            </div>
                            {(p.images?.length ?? 0) === 0 && (
                              <p className="text-[10px] font-bold text-mango-600 flex items-center gap-1">
                                ⚠ No photos yet
                              </p>
                            )}
                            {/* Makes the default sort legible — a list
                                ordered by something invisible reads as
                                unordered. */}
                            {timeAgo(p.updatedAt) && (
                              <p className="text-[10px] text-slate-400">
                                Edited {timeAgo(p.updatedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Reference / Barcode */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.internalReference ? (
                          <p className="font-mono text-xs font-semibold text-slate-700">
                            {p.internalReference}
                          </p>
                        ) : (
                          <p className="text-[10px] font-bold text-amber-700">No reference</p>
                        )}
                        {codedUnits(p) > 0 ? (
                          <p className="font-mono text-[10px] text-slate-400">
                            {p.barcode ?? `${codedUnits(p)}/${sellableUnits(p).length} variants coded`}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400">No barcode</p>
                        )}
                      </td>

                      {/* Selling Price */}
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {money(p.price)}
                        {p.compareAt && (
                          <span className="ml-1.5 text-xs text-slate-400 line-through">
                            {money(p.compareAt)}
                          </span>
                        )}
                        {discounts[p.id] && (
                          <span className="ml-1.5 rounded-full bg-coral-100 px-1.5 py-0.5 text-[10px] font-extrabold text-coral-600">
                            −{discounts[p.id]}%
                          </span>
                        )}
                      </td>

                      {/* Stock Quantity */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={totalStock(p) <= 15 ? "font-bold text-coral-600" : "text-slate-700"}>
                          {totalStock(p)}
                          {totalStock(p) <= 15 && " ⚠"}
                        </span>
                        {hasVariants(p) && (
                          <span className="ml-1 text-[10px] text-slate-400">
                            ({p.variants!.length} variants)
                          </span>
                        )}
                      </td>

                      {/* Units Sold */}
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {compact(p.sold)}
                      </td>

                      {/* Visibility & Storefront Favorite Toggles */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {mayEdit ? (
                            <>
                              {/* Live vs Hidden Toggle */}
                              <form action={toggleProductHidden.bind(null, p.id)}>
                                <button
                                  type="submit"
                                  title={
                                    p.hidden
                                      ? "Click to show on storefront"
                                      : "Click to hide from storefront"
                                  }
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold transition-all shadow-2xs ${
                                    p.hidden
                                      ? "bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-800"
                                      : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300/80 hover:bg-slate-100 hover:text-slate-600"
                                  }`}
                                >
                                  {p.hidden ? "Hidden" : "🟢 Live"}
                                </button>
                              </form>

                              {/* Star / Storefront Favorite Toggle */}
                              <form action={toggleProductFeatured.bind(null, p.id)}>
                                <button
                                  type="submit"
                                  title={
                                    p.featured
                                      ? "Remove from Brand Page Favorites"
                                      : "Pin to Brand Page Favorites"
                                  }
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold transition-all shadow-2xs ${
                                    p.featured
                                      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-slate-100 hover:text-slate-600"
                                      : "bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-900"
                                  }`}
                                >
                                  <span>{p.featured ? "⭐ Favorite" : "☆ Pin"}</span>
                                </button>
                              </form>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {p.hidden ? "Hidden" : "Live"}
                              {p.featured ? " · ⭐ Favorite" : ""}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Edit / View Links */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pager ──────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 bg-sand-50/60 px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing{" "}
              <strong className="text-slate-700">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </strong>{" "}
              of <strong className="text-slate-700">{filtered.length}</strong>
              {filtered.length !== products.length && ` (filtered from ${products.length})`}
            </p>

            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
