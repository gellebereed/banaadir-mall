"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { batchUpdateProducts, toggleProductFeatured, toggleProductHidden } from "@/app/actions";
import { compact, money } from "@/lib/format";
import { sellableUnits } from "@/lib/odoo/mapping";
import { hasVariants, totalStock } from "@/lib/product-utils";
import type { Product } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MY PRODUCTS — find a product fast, fix it in place, act on many at once.
 * ─────────────────────────────────────────────────────────────────────────
 * ── What changed and why ─────────────────────────────────────────────────
 * - Health at a glance: four tiles (live, low stock, out of stock, no
 *   photos) that double as filters — the question "what needs me today?"
 *   is one tap, not a scan of 34 pages.
 * - Price and stock are edited IN the row. Changing a price used to mean
 *   open the editor, scroll, save, come back, find your place again.
 * - Bulk price/stock take their value from an input in the bulk bar, not
 *   from a browser prompt() that blocked the page and lost focus.
 * - Bulk stock skips products with variants (and says so). It used to
 *   write the product-level number, which variant products ignore — the
 *   seller saw "Successfully updated" and nothing changed.
 * - Phones get cards instead of a sideways-scrolling table; a grid view
 *   shows photos large, for catalogues that are mostly about the images.
 * ─────────────────────────────────────────────────────────────────────────
 */

const LOW_STOCK = 15;

type TabId = "all" | "live" | "hidden" | "featured" | "low_stock" | "out_of_stock" | "no_photos";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "hidden", label: "Hidden" },
  { id: "featured", label: "Featured" },
  { id: "low_stock", label: "Low stock" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "no_photos", label: "No photos" },
];

function matchesTab(p: Product, tab: TabId): boolean {
  const stock = totalStock(p);
  switch (tab) {
    case "live":
      return !p.hidden;
    case "hidden":
      return Boolean(p.hidden);
    case "featured":
      return Boolean(p.featured);
    case "low_stock":
      return stock > 0 && stock <= LOW_STOCK;
    case "out_of_stock":
      return stock <= 0;
    case "no_photos":
      return (p.images?.length ?? 0) === 0;
    default:
      return true;
  }
}

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

function hasBarcode(product: Product): boolean {
  return sellableUnits(product).some((u) => u.barcode);
}

const VIEW_KEY = "banaadir_products_view";

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
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "grid">("list");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Remembered per browser; a convenience, so failures are ignored.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
    } catch {}
  }, []);
  function changeView(next: "list" | "grid") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  }

  // "/" focuses search, as in most admin tools.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const subcategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.subcategory).filter(Boolean))) as string[],
    [products],
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");

  const tabCounts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, products.filter((p) => matchesTab(p, t.id)).length])),
    [products],
  ) as Record<TabId, number>;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (!matchesTab(p, activeTab)) return false;
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (selectedSubcategory !== "all" && p.subcategory !== selectedSubcategory) return false;

      // Matched against every code a seller might type, including the
      // variant codes, which is what is on a scanner label.
      if (q) {
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
    if (sortBy === "sold_desc") return [...list].sort((a, b) => b.sold - a.sold);
    if (sortBy === "name_asc") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "oldest") return [...list].sort((a, b) => editedAt(a) - editedAt(b));

    /*
     * Default: most recently edited first. The product you just changed is
     * the one you are most likely to want next — to check it, to fix a
     * typo, to add its photo.
     */
    return [...list].sort((a, b) => editedAt(b) - editedAt(a));
  }, [products, activeTab, selectedCategory, selectedSubcategory, searchQuery, sortBy]);

  /*
   * PAGINATION. Rendering 1,688 rows put ~20,000 DOM nodes on the page.
   * The bulk bar still works across the WHOLE filtered set — see "select
   * all matching" — so paging costs nothing operationally.
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Any change to what is being filtered puts you back on page one.
  useEffect(() => {
    setPage(1);
  }, [activeTab, selectedCategory, selectedSubcategory, searchQuery, sortBy]);

  const filtersActive =
    activeTab !== "all" ||
    selectedCategory !== "all" ||
    selectedSubcategory !== "all" ||
    searchQuery.trim() !== "";

  function clearFilters() {
    setActiveTab("all");
    setSelectedCategory("all");
    setSelectedSubcategory("all");
    setSearchQuery("");
  }

  // ── Selection ─────────────────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredIds = filtered.map((p) => p.id);
  const visibleIds = visible.map((p) => p.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
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

  // Leaving the selection leaves any half-armed delete.
  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedIds]);

  // ── Bulk actions ──────────────────────────────────────────────────────
  function runBatch(
    action: "hide" | "show" | "feature" | "unfeature" | "delete" | "price" | "stock",
    value?: number,
  ) {
    let ids = selectedIds;
    let skipped = 0;
    if (action === "stock") {
      const byId = new Map(products.map((p) => [p.id, p]));
      const simple = ids.filter((id) => !hasVariants(byId.get(id)!));
      skipped = ids.length - simple.length;
      ids = simple;
      if (ids.length === 0) {
        setStatusMessage({
          ok: false,
          text: "All selected products have variants — set their stock per variant in the editor.",
        });
        return;
      }
    }

    startTransition(async () => {
      const res = await batchUpdateProducts(ids, action, value);
      setStatusMessage({
        ok: res.ok,
        text:
          res.message +
          (skipped
            ? ` ${skipped} product${skipped === 1 ? " has" : "s have"} variants and ${
                skipped === 1 ? "was" : "were"
              } skipped — set stock per variant in the editor.`
            : ""),
      });
      if (res.ok && action === "delete") setSelectedIds([]);
      if (res.ok && action === "price") setBulkPrice("");
      if (res.ok && action === "stock") setBulkStock("");
    });
  }

  const bulkPriceValue = Number(bulkPrice);
  const bulkStockValue = Number(bulkStock);
  const bulkPriceValid = bulkPrice.trim() !== "" && Number.isFinite(bulkPriceValue) && bulkPriceValue > 0;
  const bulkStockValid =
    bulkStock.trim() !== "" && Number.isInteger(bulkStockValue) && bulkStockValue >= 0;

  // ── Health tiles ──────────────────────────────────────────────────────
  const tiles: { tab: TabId; label: string; value: number; tone: string; hint: string }[] = [
    { tab: "live", label: "Live in shop", value: tabCounts.live, tone: "text-emerald-700", hint: `${tabCounts.hidden} hidden` },
    { tab: "low_stock", label: "Low stock", value: tabCounts.low_stock, tone: "text-mango-700", hint: `${LOW_STOCK} or fewer left` },
    { tab: "out_of_stock", label: "Out of stock", value: tabCounts.out_of_stock, tone: "text-coral-600", hint: "Can't be bought" },
    { tab: "no_photos", label: "No photos", value: tabCounts.no_photos, tone: "text-slate-700", hint: "Sell far worse" },
  ];

  return (
    <div className="mt-5 space-y-4">
      {/* ── Health tiles ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const active = activeTab === tile.tab;
          return (
            <button
              key={tile.tab}
              type="button"
              onClick={() => setActiveTab(active ? "all" : tile.tab)}
              aria-pressed={active}
              className={`card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                active ? "!border-ocean-500 ring-2 ring-ocean-200" : ""
              }`}
            >
              <p className="text-xs font-semibold text-slate-500">{tile.label}</p>
              <p className={`mt-1 font-display text-2xl font-extrabold ${tile.value ? tile.tone : "text-slate-300"}`}>
                {tile.value.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">{tile.hint}</p>
            </button>
          );
        })}
      </div>

      {/* ── Search & filters ───────────────────────────────────────── */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, SKU or barcode…"
            aria-label="Search products"
            className="input !pl-11 !pr-12"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-sand-200 bg-sand-50 px-1.5 text-[10px] font-semibold text-slate-400 sm:block">
            /
          </kbd>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Filter by status">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-ocean-900 text-white"
                      : "bg-sand-100 text-slate-600 hover:bg-sand-200 hover:text-ocean-900"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      isActive ? "bg-white/20 text-white" : "bg-white text-slate-500"
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.length > 1 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Category"
                className="max-w-52 rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-ocean-500"
              >
                <option value="all">All categories</option>
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
                aria-label="Subcategory"
                className="max-w-44 rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-ocean-500"
              >
                <option value="all">All subcategories</option>
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
              aria-label="Sort"
              className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-ocean-500"
            >
              <option value="default">Recently edited</option>
              <option value="oldest">Least recently edited</option>
              <option value="sold_desc">Best selling</option>
              <option value="name_asc">Name A–Z</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="stock_asc">Stock: low → high</option>
              <option value="stock_desc">Stock: high → low</option>
            </select>
            <div className="flex rounded-xl border border-sand-200 bg-white p-0.5" role="group" aria-label="View">
              {(["list", "grid"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  aria-pressed={view === v}
                  title={v === "list" ? "List view" : "Grid view"}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    view === v ? "bg-ocean-900 text-white" : "text-slate-500 hover:text-ocean-900"
                  }`}
                >
                  {v === "list" ? "☰" : "▦"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bulk bar ───────────────────────────────────────────────── */}
      {mayEdit && selectedIds.length > 0 && (
        <div className="sticky top-20 z-30 space-y-3 rounded-2xl bg-ocean-950 p-3.5 text-white shadow-xl ring-1 ring-white/10 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-ocean-800 px-1.5 font-mono text-xs font-bold text-mango-400">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold">selected</span>
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
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-ocean-300 underline hover:text-white"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BulkButton disabled={isPending} onClick={() => runBatch("show")} className="bg-emerald-600 hover:bg-emerald-500">
              Make live
            </BulkButton>
            <BulkButton disabled={isPending} onClick={() => runBatch("hide")}>
              Hide
            </BulkButton>
            <BulkButton disabled={isPending} onClick={() => runBatch("feature")}>
              ★ Feature
            </BulkButton>
            <BulkButton disabled={isPending} onClick={() => runBatch("unfeature")}>
              Unfeature
            </BulkButton>

            <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" />

            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (bulkPriceValid) runBatch("price", bulkPriceValue);
              }}
            >
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                placeholder="Price $"
                aria-label="New price for selected products"
                className="w-24 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-mango-400"
              />
              <BulkButton type="submit" disabled={isPending || !bulkPriceValid}>
                Set
              </BulkButton>
            </form>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (bulkStockValid) runBatch("stock", bulkStockValue);
              }}
            >
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={bulkStock}
                onChange={(e) => setBulkStock(e.target.value)}
                placeholder="Stock"
                aria-label="New stock for selected products"
                className="w-20 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-mango-400"
              />
              <BulkButton type="submit" disabled={isPending || !bulkStockValid}>
                Set
              </BulkButton>
            </form>

            <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" />

            {/* Two clicks, no browser dialog: the second one is the confirm. */}
            <BulkButton
              disabled={isPending}
              onClick={() => (confirmDelete ? runBatch("delete") : setConfirmDelete(true))}
              className={confirmDelete ? "bg-rose-600 hover:bg-rose-500" : "hover:bg-rose-600"}
            >
              {confirmDelete ? `Confirm delete ${selectedIds.length}?` : "Delete"}
            </BulkButton>
            {isPending && <span className="text-xs text-ocean-300 animate-pulse">Working…</span>}
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs font-semibold ${
            statusMessage.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>
            {statusMessage.ok ? "✓ " : "⚠ "}
            {statusMessage.text}
          </span>
          <button type="button" onClick={() => setStatusMessage(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <span className="text-4xl">{products.length === 0 ? "📦" : "🔍"}</span>
          <p className="mt-3 font-display text-lg font-bold text-ocean-950">
            {products.length === 0 ? "No products yet" : "Nothing matches these filters"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {products.length === 0
              ? "Add your first product, or import a whole catalogue from a spreadsheet."
              : "Try a different search, or clear the filters to see everything."}
          </p>
          {products.length === 0 && mayEdit ? (
            <Link href="/vendor/products/new" className="btn-primary mt-5 !py-2.5 text-sm">
              + Add your first product
            </Link>
          ) : (
            filtersActive && (
              <button type="button" onClick={clearFilters} className="btn-secondary mt-5 !py-2 text-sm">
                Clear filters
              </button>
            )
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((p) => (
            <ProductTile
              key={p.id}
              product={p}
              discount={discounts[p.id]}
              mayEdit={mayEdit}
              selected={selectedSet.has(p.id)}
              onToggle={() => toggleSelectOne(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Header — desktop only; phones get stacked cards. */}
          <div className="hidden grid-cols-[32px_minmax(0,2.4fr)_minmax(0,1fr)_110px_110px_70px_120px] items-center gap-4 border-b border-sand-200 bg-sand-50/80 px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 md:grid">
            {mayEdit ? (
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 cursor-pointer rounded accent-ocean-700"
                aria-label="Select all on this page"
              />
            ) : (
              <span />
            )}
            <span>Product</span>
            <span>Status</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Sold</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-sand-100">
            {visible.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                categoryName={categoryNames[p.category] ?? p.category}
                discount={discounts[p.id]}
                mayEdit={mayEdit}
                selected={selectedSet.has(p.id)}
                onToggle={() => toggleSelectOne(p.id)}
                onResult={setStatusMessage}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ── Pager ──────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-xs text-slate-500">
            Showing{" "}
            <strong className="text-slate-700">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}
            </strong>{" "}
            of <strong className="text-slate-700">{filtered.length.toLocaleString()}</strong>
            {filtered.length !== products.length && (
              <>
                {" "}
                (filtered from {products.length.toLocaleString()}){" "}
                <button type="button" onClick={clearFilters} className="font-bold text-ocean-700 hover:underline">
                  Clear filters
                </button>
              </>
            )}
          </p>

          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PagerButton onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>
                ←
              </PagerButton>
              {pageNumbers(currentPage, pageCount).map((n, i) =>
                n === null ? (
                  <span key={`gap${i}`} className="px-1 text-xs text-slate-400">
                    …
                  </span>
                ) : (
                  <PagerButton key={n} onClick={() => setPage(n)} active={n === currentPage}>
                    {n}
                  </PagerButton>
                ),
              )}
              <PagerButton onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>
                →
              </PagerButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 1 … 4 5 [6] 7 8 … 34 */
function pageNumbers(current: number, count: number): (number | null)[] {
  const pages = new Set([1, count, current - 1, current, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function PagerButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-ocean-900 text-white" : "border border-sand-200 bg-white text-slate-700 hover:bg-sand-100"
      }`}
    >
      {children}
    </button>
  );
}

function BulkButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "hover:bg-ocean-700",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-ocean-800 px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function StockBadge({ stock }: { stock: number }) {
  const tone =
    stock <= 0
      ? "bg-coral-100 text-coral-700"
      : stock <= LOW_STOCK
        ? "bg-mango-100 text-mango-800"
        : "bg-emerald-50 text-emerald-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
      {stock <= 0 ? "Out" : stock.toLocaleString()}
    </span>
  );
}

/** Live/Hidden and Featured toggles — real forms, so they work without JS. */
function StatusToggles({ product: p, mayEdit }: { product: Product; mayEdit: boolean }) {
  if (!mayEdit) {
    return (
      <span className="text-xs text-slate-500">
        {p.hidden ? "Hidden" : "Live"}
        {p.featured ? " · ★" : ""}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <form action={toggleProductHidden.bind(null, p.id)}>
        <button
          type="submit"
          title={p.hidden ? "Hidden — click to put it in the shop" : "Live — click to hide it from the shop"}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            p.hidden
              ? "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
              : "bg-emerald-50 text-emerald-700 hover:bg-slate-100 hover:text-slate-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${p.hidden ? "bg-slate-400" : "bg-emerald-500"}`} />
          {p.hidden ? "Hidden" : "Live"}
        </button>
      </form>
      <form action={toggleProductFeatured.bind(null, p.id)}>
        <button
          type="submit"
          title={p.featured ? "Featured on your brand page — click to remove" : "Feature on your brand page"}
          aria-label={p.featured ? "Unfeature" : "Feature"}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition ${
            p.featured ? "bg-mango-100 text-mango-600" : "text-slate-300 hover:bg-mango-50 hover:text-mango-500"
          }`}
        >
          {p.featured ? "★" : "☆"}
        </button>
      </form>
    </div>
  );
}

/**
 * A number that becomes an input on click, and saves on Enter or blur.
 * Escape puts it back. Used for price and (simple products') stock.
 */
function QuickEdit({
  productId,
  kind,
  value,
  display,
  onResult,
}: {
  productId: string;
  kind: "price" | "stock";
  value: number;
  display: React.ReactNode;
  onResult: (result: { ok: boolean; text: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saved, setSaved] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fresh server data wins over the optimistic value.
  useEffect(() => {
    setSaved(null);
  }, [value]);

  function commit() {
    setEditing(false);
    const next = Number(draft);
    const valid = kind === "price" ? Number.isFinite(next) && next > 0 : Number.isInteger(next) && next >= 0;
    if (!valid || next === (saved ?? value)) {
      setDraft(String(saved ?? value));
      return;
    }
    setSaved(next);
    startTransition(async () => {
      const res = await batchUpdateProducts([productId], kind, next);
      if (!res.ok) {
        setSaved(null);
        onResult({ ok: false, text: res.message });
      }
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={kind === "price" ? "0.01" : "0"}
        step={kind === "price" ? "0.01" : "1"}
        inputMode={kind === "price" ? "decimal" : "numeric"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(saved ?? value));
            setEditing(false);
          }
        }}
        aria-label={kind === "price" ? "Price" : "Stock"}
        className="w-24 rounded-lg border border-ocean-400 bg-white px-2 py-1 text-sm outline-none ring-2 ring-ocean-100"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(saved ?? value));
        setEditing(true);
      }}
      title={`Click to change the ${kind}`}
      className={`group/qe inline-flex items-center gap-1 rounded-lg px-1.5 py-1 -mx-1.5 transition hover:bg-sand-100 ${
        isPending ? "opacity-50" : ""
      }`}
    >
      {saved !== null ? (kind === "price" ? money(saved) : <StockBadge stock={saved} />) : display}
      <span className="text-[10px] text-slate-300 opacity-0 transition group-hover/qe:opacity-100">✎</span>
    </button>
  );
}

function ProductRow({
  product: p,
  categoryName,
  discount,
  mayEdit,
  selected,
  onToggle,
  onResult,
}: {
  product: Product;
  categoryName: string;
  discount?: number;
  mayEdit: boolean;
  selected: boolean;
  onToggle: () => void;
  onResult: (result: { ok: boolean; text: string }) => void;
}) {
  const stock = totalStock(p);
  const variants = hasVariants(p);
  const noPhotos = (p.images?.length ?? 0) === 0;
  const edited = timeAgo(p.updatedAt);

  const price = (
    <span className="whitespace-nowrap text-sm font-semibold text-slate-900">
      {money(p.price)}
      {p.compareAt && p.compareAt > p.price && (
        <span className="ml-1 text-xs font-normal text-slate-400 line-through">{money(p.compareAt)}</span>
      )}
    </span>
  );

  return (
    <li
      className={`grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[32px_minmax(0,2.4fr)_minmax(0,1fr)_110px_110px_70px_120px] md:items-center md:gap-4 ${
        selected ? "bg-ocean-50/60" : "hover:bg-sand-50/60"
      }`}
    >
      <div className="pt-3 md:pt-0">
        {mayEdit && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${p.name}`}
            className="h-4 w-4 cursor-pointer rounded accent-ocean-700"
          />
        )}
      </div>

      {/* Product */}
      <div className="flex min-w-0 items-center gap-3">
        <Link href={mayEdit ? `/vendor/products/${p.id}/edit` : `/product/${p.slug}`} className="shrink-0">
          <ProductImage
            product={p}
            iconClass="text-xl"
            className="h-12 w-12 rounded-xl border border-sand-200"
            sizes="48px"
          />
        </Link>
        <div className="min-w-0">
          <Link
            href={mayEdit ? `/vendor/products/${p.id}/edit` : `/product/${p.slug}`}
            className={`block truncate text-sm font-semibold hover:text-ocean-700 ${
              p.hidden ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {p.name}
          </Link>
          <p className="truncate text-[11px] text-slate-400">
            {[
              categoryName,
              variants ? `${p.variants!.length} variants` : null,
              p.internalReference,
              edited ? `edited ${edited}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(noPhotos || !hasBarcode(p) || discount) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {discount ? (
                <span className="rounded-full bg-coral-100 px-1.5 py-0.5 text-[10px] font-bold text-coral-600">
                  −{discount}% promo
                </span>
              ) : null}
              {noPhotos && (
                <span className="rounded-full bg-mango-50 px-1.5 py-0.5 text-[10px] font-bold text-mango-700">
                  No photos
                </span>
              )}
              {!hasBarcode(p) && (
                <span className="rounded-full bg-sand-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  No barcode
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: the rest wraps under the product, in one compact line. */}
      <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:contents">
        <div className="md:order-none">
          <StatusToggles product={p} mayEdit={mayEdit} />
        </div>

        <div>
          {mayEdit ? (
            <QuickEdit productId={p.id} kind="price" value={p.price} display={price} onResult={onResult} />
          ) : (
            price
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {mayEdit && !variants ? (
            <QuickEdit
              productId={p.id}
              kind="stock"
              value={stock}
              display={<StockBadge stock={stock} />}
              onResult={onResult}
            />
          ) : (
            <span title={variants ? "Sum of all variants — edit per variant" : undefined}>
              <StockBadge stock={stock} />
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500">
          <span className="md:hidden">Sold </span>
          {compact(p.sold)}
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0 md:justify-end">
          {mayEdit && (
            <Link
              href={`/vendor/products/${p.id}/edit`}
              className="rounded-full border border-sand-200 bg-white px-3 py-1 text-xs font-bold text-ocean-800 transition hover:border-ocean-400"
            >
              Edit
            </Link>
          )}
          <Link
            href={`/product/${p.slug}`}
            target="_blank"
            title="View in shop"
            aria-label="View in shop"
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-slate-400 transition hover:bg-sand-100 hover:text-ocean-700"
          >
            ↗
          </Link>
        </div>
      </div>
    </li>
  );
}

function ProductTile({
  product: p,
  discount,
  mayEdit,
  selected,
  onToggle,
}: {
  product: Product;
  discount?: number;
  mayEdit: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const stock = totalStock(p);
  return (
    <div
      className={`card group relative overflow-hidden transition hover:shadow-md ${
        selected ? "!border-ocean-500 ring-2 ring-ocean-200" : ""
      }`}
    >
      <Link href={mayEdit ? `/vendor/products/${p.id}/edit` : `/product/${p.slug}`} className="block">
        <ProductImage
          product={p}
          iconClass="text-4xl"
          className={`aspect-square w-full ${p.hidden ? "opacity-50" : ""}`}
          sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 50vw"
        />
      </Link>
      {mayEdit && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${p.name}`}
          className="absolute left-2 top-2 h-5 w-5 cursor-pointer rounded accent-ocean-700"
        />
      )}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
        {p.hidden && (
          <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white">Hidden</span>
        )}
        {p.featured && (
          <span className="rounded-full bg-mango-500 px-2 py-0.5 text-[10px] font-bold text-white">★ Featured</span>
        )}
        {discount ? (
          <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[10px] font-bold text-white">−{discount}%</span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ocean-950">{money(p.price)}</span>
          <StockBadge stock={stock} />
        </div>
      </div>
    </div>
  );
}
