"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE PRODUCT LIST — filters, sort and grid for /products, /category and
 *  /search. The server page passes the products; everything here runs in
 *  the browser.
 * ─────────────────────────────────────────────────────────────────────────
 * What makes it work like a big shop's list rather than a form:
 *
 *  · Live counts. Every option shows how many products you would get
 *    GIVEN YOUR OTHER CHOICES (each group is counted with every other
 *    group applied, not itself), and options that would return nothing are
 *    greyed out. "Electronics 5" means five, not "five before you picked a
 *    brand".
 *
 *  · One scroll. The old sidebar put the category and brand lists in their
 *    own small scroll boxes inside a scrolling panel, so most rows — and
 *    their counts — were hidden until you found the inner scrollbar. Lists
 *    now show their top rows and expand in place, with a search box once
 *    they are long.
 *
 *  · On a phone, filters and sort open as full panels with a "Show 22
 *    products" button, and a floating Filter · Sort pill follows you down
 *    the page.
 *
 *  · The address bar is the state. Filters and sort are written to the
 *    URL, so the back button, a refresh and a shared link all land on the
 *    same list.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ProductCard from "@/components/ProductCard";
import { money } from "@/lib/format";
import { categories as seedCategories } from "@/lib/data/categories";
import CategoryChips from "./CategoryChips";
import Sheet from "./Sheet";
import { useReco } from "@/components/reco/RecoProvider";
import { usePrefs } from "@/components/prefs/PrefsProvider";
import { colorSwatch } from "@/lib/product-utils";
import { hasHistory } from "@/lib/reco/profile";
import { deriveTaste, tasteScore } from "@/lib/reco/taste";
import type { MessageKey, T } from "@/lib/i18n";
import type { FacetData } from "@/lib/taxonomy-attributes";
import type { Category, Product, Store } from "@/lib/types";

type SortKey = "featured" | "sold" | "price-asc" | "price-desc" | "rating" | "discount" | "new";
const SORTS: SortKey[] = ["featured", "sold", "price-asc", "price-desc", "rating", "discount", "new"];
const isSort = (v: unknown): v is SortKey => SORTS.includes(v as SortKey);

/** Quick price buttons — "under X", exclusive. */
const UNDER = [10, 25, 50, 100];
const RATINGS = [4, 3];
const BATCH = 16;

interface Filters {
  cats: string[];
  stores: string[];
  sub: string | null;
  /** Quick "under $X" (exclusive). */
  under: number | null;
  /** Typed range (inclusive). */
  min: number | null;
  max: number | null;
  rating: number | null;
  sale: boolean;
  /** attribute handle → ticked value keys. OR within one, AND across them. */
  attrs: Record<string, string[]>;
}

const EMPTY: Filters = { cats: [], stores: [], sub: null, under: null, min: null, max: null, rating: null, sale: false, attrs: {} };

/** Filter groups, for "count everything except this group". */
type Group = "cat" | "store" | "sub" | "price" | "rating" | "sale" | `attr:${string}`;

function matches(p: Product, f: Filters, index: FacetData["index"], skip?: Group): boolean {
  if (skip !== "cat" && f.cats.length && !f.cats.includes(p.category)) return false;
  if (skip !== "store" && f.stores.length && !f.stores.includes(p.store)) return false;
  if (skip !== "sub" && f.sub && p.subcategory !== f.sub) return false;
  if (skip !== "price") {
    if (f.under !== null && !(p.price < f.under)) return false;
    if (f.min !== null && p.price < f.min) return false;
    if (f.max !== null && p.price > f.max) return false;
  }
  if (skip !== "rating" && f.rating !== null && !(p.reviewCount > 0 && p.rating >= f.rating)) return false;
  if (skip !== "sale" && f.sale && !(p.compareAt && p.compareAt > p.price)) return false;
  for (const [handle, keys] of Object.entries(f.attrs)) {
    if (!keys.length || skip === `attr:${handle}`) continue;
    const tokens = index[p.id];
    if (!tokens || !keys.some((k) => tokens.includes(`${handle}:${k}`))) return false;
  }
  return true;
}

// ── URL <-> filters ─────────────────────────────────────────────────────

const num = (v: string | null) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const list = (v: string | null) => (v ? v.split(",").filter(Boolean).slice(0, 50) : []);

const FILTER_PARAMS = ["cat", "store", "sub", "under", "max", "pmin", "pmax", "rating", "sale", "sort"];

function readUrl(params: URLSearchParams): { filters: Filters; sort: SortKey | null } {
  const attrs: Record<string, string[]> = {};
  params.forEach((value, key) => {
    if (key.startsWith("a.")) attrs[key.slice(2)] = list(value);
  });
  const sort = params.get("sort");
  return {
    filters: {
      cats: list(params.get("cat")),
      stores: list(params.get("store")),
      sub: params.get("sub"),
      // `max` is the home page's older "under $X" link (BudgetPicks).
      under: num(params.get("under")) ?? num(params.get("max")),
      min: num(params.get("pmin")),
      max: num(params.get("pmax")),
      rating: num(params.get("rating")),
      sale: params.get("sale") === "1",
      attrs,
    },
    sort: isSort(sort) ? sort : null,
  };
}

/** Writes filters and sort into the address bar, keeping other params (search `q`). */
function writeUrl(f: Filters, sort: SortKey, defaultSort: SortKey) {
  const params = new URLSearchParams(window.location.search);
  for (const key of [...params.keys()]) {
    if (FILTER_PARAMS.includes(key) || key.startsWith("a.")) {
      params.delete(key);
    }
  }
  if (f.cats.length) params.set("cat", f.cats.join(","));
  if (f.stores.length) params.set("store", f.stores.join(","));
  if (f.sub) params.set("sub", f.sub);
  if (f.under !== null) params.set("under", String(f.under));
  if (f.min !== null) params.set("pmin", String(f.min));
  if (f.max !== null) params.set("pmax", String(f.max));
  if (f.rating !== null) params.set("rating", String(f.rating));
  if (f.sale) params.set("sale", "1");
  for (const [handle, keys] of Object.entries(f.attrs)) if (keys.length) params.set(`a.${handle}`, keys.join(","));
  if (sort !== defaultSort) params.set("sort", sort);
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

// ─────────────────────────────────────────────────────────────────────────

export default function ShopClient({
  products,
  stores = [],
  categories: liveCategories,
  title,
  subtitle,
  initialSort = "featured",
  initialMaxPrice,
  showCategoryFilter = true,
  facets = { facets: [], index: {} },
  personalize = false,
}: {
  products: Product[];
  /** Search results come ranked by relevance; nudge them toward the shopper's taste. */
  personalize?: boolean;
  /** Stores present in this result set, for the brand filter. */
  stores?: Store[];
  /** The real category list (falls back to the bundled seed). */
  categories?: Category[];
  title: string;
  subtitle?: string;
  initialSort?: string;
  /** From a link like /products?max=10 (the home page's budget rows). */
  initialMaxPrice?: number;
  showCategoryFilter?: boolean;
  facets?: FacetData;
}) {
  const { t } = usePrefs();
  const defaultSort: SortKey = isSort(initialSort) ? initialSort : "featured";
  const [sort, setSort] = useState<SortKey>(defaultSort);
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, under: initialMaxPrice ?? null }));
  const [sheet, setSheet] = useState<"filters" | "sort" | null>(null);
  const [gridCols, setGridCols] = useState<3 | 4 | 5>(4);
  const [visible, setVisible] = useState(BATCH);

  // The URL wins on load (a shared link, the back button).
  const loaded = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = readUrl(params);
    const hasAny = [...params.keys()].some((k) => FILTER_PARAMS.includes(k) || k.startsWith("a."));
    if (hasAny) setF(fromUrl.filters);
    if (fromUrl.sort) setSort(fromUrl.sort);
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) writeUrl(f, sort, defaultSort);
  }, [f, sort, defaultSort]);

  const update = useCallback((patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch })), []);
  const toggleIn = (key: "cats" | "stores", value: string) =>
    setF((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value] }));
  const toggleAttr = (handle: string, key: string) =>
    setF((prev) => {
      const current = prev.attrs[handle] ?? [];
      return { ...prev, attrs: { ...prev.attrs, [handle]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] } };
    });
  const clearAll = () => setF(EMPTY);

  // ── Personal order for search results (relevance still leads) ─────────
  const { profile, ready } = useReco();
  const personalOrder = useMemo(() => {
    if (!personalize || !ready || !hasHistory(profile) || products.length < 3) return null;
    const TASTE_WEIGHT = 0.3;
    const taste = deriveTaste(profile, new Map(products.map((p) => [p.id, p])), Date.now());
    if (taste.confidence === 0) return null;
    const n = products.length;
    const scored = products.map((p, i) => ({
      id: p.id,
      score: 1 - i / n + TASTE_WEIGHT * tasteScore(p, taste) - (taste.muted.has(p.id) ? 2 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    return new Map(scored.map((s, i) => [s.id, i]));
  }, [personalize, ready, profile, products]);

  // ── Results ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const out = products.filter((p) => matches(p, f, facets.index));
    switch (sort) {
      case "featured":
        if (personalOrder) out.sort((a, b) => (personalOrder.get(a.id) ?? 0) - (personalOrder.get(b.id) ?? 0));
        break;
      case "sold":
        out.sort((a, b) => b.sold - a.sold);
        break;
      case "price-asc":
        out.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        out.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        out.sort((a, b) => (b.reviewCount > 0 ? b.rating : 0) - (a.reviewCount > 0 ? a.rating : 0) || b.reviewCount - a.reviewCount);
        break;
      case "discount": {
        const off = (p: Product) => (p.compareAt && p.compareAt > p.price ? 1 - p.price / p.compareAt : 0);
        out.sort((a, b) => off(b) - off(a));
        break;
      }
      case "new":
        out.sort((a, b) => (b.badge === "New" ? 1 : 0) - (a.badge === "New" ? 1 : 0));
        break;
    }
    return out;
  }, [products, f, facets.index, sort, personalOrder]);

  useEffect(() => setVisible(BATCH), [f, sort]);
  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setVisible((v) => Math.min(v + 12, filtered.length)),
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  // ── Live counts: each group counted with every OTHER group applied ────
  const counted = useMemo(() => {
    const pool = (skip: Group) => products.filter((p) => matches(p, f, facets.index, skip));
    const tally = (items: Product[], key: (p: Product) => string | undefined) => {
      const m = new Map<string, number>();
      for (const p of items) {
        const k = key(p);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const pricePool = pool("price");
    const ratingPool = pool("rating");
    const attrs: Record<string, Map<string, number>> = {};
    for (const facet of facets.facets) {
      const m = new Map<string, number>();
      for (const p of pool(`attr:${facet.handle}`)) {
        for (const token of facets.index[p.id] ?? []) {
          if (token.startsWith(`${facet.handle}:`)) {
            const k = token.slice(facet.handle.length + 1);
            m.set(k, (m.get(k) ?? 0) + 1);
          }
        }
      }
      attrs[facet.handle] = m;
    }
    return {
      cats: tally(pool("cat"), (p) => p.category),
      stores: tally(pool("store"), (p) => p.store),
      subs: tally(pool("sub"), (p) => p.subcategory),
      under: new Map(UNDER.map((u) => [u, pricePool.filter((p) => p.price < u).length])),
      rating: new Map(RATINGS.map((r) => [r, ratingPool.filter((p) => p.reviewCount > 0 && p.rating >= r).length])),
      sale: pool("sale").filter((p) => p.compareAt && p.compareAt > p.price).length,
      attrs,
    };
  }, [products, f, facets]);

  // ── Option lists ──────────────────────────────────────────────────────
  const categories = liveCategories?.length ? liveCategories : seedCategories;
  const categoriesPresent = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of products) totals.set(p.category, (totals.get(p.category) ?? 0) + 1);
    return [...totals.entries()]
      .map(([slug, total]) => {
        const category = categories.find((c) => c.slug === slug);
        const parent = category?.parentSlug ? categories.find((c) => c.slug === category.parentSlug) : undefined;
        return { slug, total, name: category?.name ?? slug.replace(/-/g, " "), icon: category?.icon, parentName: parent?.name };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [products, categories]);

  const subcategories = useMemo(
    () => [...new Set(products.map((p) => p.subcategory).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const storesPresent = useMemo(() => {
    const present = new Set(products.map((p) => p.store));
    return stores
      .filter((s) => present.has(s.slug))
      .sort((a, b) => Number(b.official ?? false) - Number(a.official ?? false) || a.name.localeCompare(b.name));
  }, [products, stores]);

  const chipMode: "category" | "subcategory" = categoriesPresent.length > 1 ? "category" : "subcategory";

  // ── Active filters, as removable chips ────────────────────────────────
  const active: { key: string; label: string; remove: () => void }[] = [];
  for (const slug of f.cats) {
    active.push({ key: `c:${slug}`, label: categoriesPresent.find((c) => c.slug === slug)?.name ?? slug, remove: () => toggleIn("cats", slug) });
  }
  if (f.sub) active.push({ key: "sub", label: f.sub, remove: () => update({ sub: null }) });
  for (const slug of f.stores) {
    active.push({ key: `s:${slug}`, label: stores.find((s) => s.slug === slug)?.name ?? slug, remove: () => toggleIn("stores", slug) });
  }
  if (f.under !== null) active.push({ key: "under", label: t("shop.f.under", { amount: money(f.under) }), remove: () => update({ under: null }) });
  if (f.min !== null || f.max !== null) {
    const label =
      f.min !== null && f.max !== null
        ? t("shop.f.range", { min: money(f.min), max: money(f.max) })
        : f.min !== null
          ? t("shop.f.from", { min: money(f.min) })
          : t("shop.f.upTo", { max: money(f.max!) });
    active.push({ key: "range", label, remove: () => update({ min: null, max: null }) });
  }
  if (f.rating !== null) active.push({ key: "rating", label: t("shop.f.stars", { n: f.rating }), remove: () => update({ rating: null }) });
  if (f.sale) active.push({ key: "sale", label: t("shop.f.sale"), remove: () => update({ sale: false }) });
  for (const facet of facets.facets) {
    for (const key of f.attrs[facet.handle] ?? []) {
      const name = facet.values.find((v) => v.key === key)?.name ?? key;
      active.push({ key: `a:${facet.handle}:${key}`, label: `${facet.name}: ${name}`, remove: () => toggleAttr(facet.handle, key) });
    }
  }

  const countLabel = (n: number) => (n === 1 ? t("shop.count.one") : t("shop.count", { n }));
  const showLabel = (n: number) => (n === 1 ? t("shop.showResults.one") : t("shop.showResults", { n }));

  // ── The floating Filter · Sort pill appears once the toolbar scrolls away
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState(false);
  useEffect(() => {
    const node = toolbarRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setPill(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // ...and steps aside at the footer, where it would cover the links.
  const [atFooter, setAtFooter] = useState(false);
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting));
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  const panel = (
    <FilterPanel
      t={t}
      f={f}
      counted={counted}
      update={update}
      toggleIn={toggleIn}
      toggleAttr={toggleAttr}
      categories={showCategoryFilter && categoriesPresent.length > 1 ? categoriesPresent : []}
      stores={storesPresent}
      facets={facets}
    />
  );

  const gridClass =
    gridCols === 3
      ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
      : gridCols === 5
        ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        : "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Heading — compact on a phone, so products reach the first screen */}
      <div className="mb-4 sm:mb-6">
        <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {chipMode === "category" && categoriesPresent.length > 1 && (
        <CategoryChips
          options={categoriesPresent.map((c) => ({ ...c, count: c.total }))}
          activeSlug={f.cats.length === 1 ? f.cats[0] : null}
          onSelect={(slug) => update({ cats: slug ? [slug] : [] })}
          allLabel={t("shop.chips.all")}
          allCount={products.length}
        />
      )}
      {chipMode === "subcategory" && subcategories.length > 1 && (
        <CategoryChips
          options={subcategories.map((sub) => ({ slug: sub, name: sub, count: products.filter((p) => p.subcategory === sub).length }))}
          activeSlug={f.sub}
          onSelect={(sub) => update({ sub })}
          allLabel={t("shop.chips.all")}
          allCount={products.length}
        />
      )}

      <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-8">
        {/* ── Desktop filters: sticky, one scroll area ─────────────────── */}
        <aside className="hidden lg:block" aria-label={t("shop.filters")}>
          <div className="rail-scroll sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain pb-6 pr-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-extrabold text-ocean-950">{t("shop.filters")}</h2>
              {active.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-bold text-coral-600 hover:underline">
                  {t("shop.clearAll")}
                </button>
              )}
            </div>
            {panel}
          </div>
        </aside>

        <div className="min-w-0">
          {/* ── Toolbar ────────────────────────────────────────────────── */}
          <div ref={toolbarRef} className="mb-3 flex items-center gap-2">
            {/* Phone: two big buttons */}
            <button
              type="button"
              onClick={() => setSheet("filters")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-sand-200 bg-white text-sm font-bold text-slate-700 shadow-2xs lg:hidden"
            >
              <span aria-hidden>⚙️</span> {t("shop.filters")}
              {active.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ocean-700 px-1 text-[11px] text-white">{active.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSheet("sort")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-sand-200 bg-white text-sm font-bold text-slate-700 shadow-2xs lg:hidden"
            >
              <span aria-hidden>↕</span> {t(`shop.sort.${sort}` as MessageKey)}
            </button>

            {/* Desktop: count, view, sort */}
            <p className="hidden text-sm text-slate-500 lg:block">
              <strong className="text-slate-900">{countLabel(filtered.length)}</strong>
              {personalOrder && sort === "featured" && <span className="ml-2 text-xs text-ocean-700">· {t("shop.tuned")}</span>}
            </p>
            <div className="ml-auto hidden items-center gap-2.5 lg:flex">
              <div className="flex items-center gap-1 rounded-full border border-sand-200 bg-white p-1 shadow-2xs">
                <span className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{t("shop.view")}</span>
                {([3, 4, 5] as const).map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => setGridCols(cols)}
                    aria-pressed={gridCols === cols}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                      gridCols === cols ? "bg-ocean-800 text-white" : "text-slate-500 hover:bg-sand-100"
                    }`}
                  >
                    {cols}
                  </button>
                ))}
              </div>
              <label className="relative">
                <span className="sr-only">{t("shop.sortBy")}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-10 cursor-pointer appearance-none rounded-full border border-sand-200 bg-white pl-4 pr-10 text-sm font-semibold leading-none text-slate-700 shadow-2xs outline-none focus:border-ocean-500"
                >
                  {SORTS.map((key) => (
                    <option key={key} value={key}>
                      {t("shop.sortBy")}: {t(`shop.sort.${key}` as MessageKey)}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  ▼
                </span>
              </label>
            </div>
          </div>

          {/* Phone: the count under the buttons */}
          <p className="mb-3 text-sm text-slate-500 lg:hidden">
            <strong className="text-slate-900">{countLabel(filtered.length)}</strong>
            {personalOrder && sort === "featured" && <span className="ml-2 text-xs text-ocean-700">· {t("shop.tuned")}</span>}
          </p>

          {/* Applied filters */}
          {active.length > 0 && (
            <div className="rail-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              {active.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.remove}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-900 ring-1 ring-ocean-200 hover:bg-ocean-100"
                >
                  {a.label} <span aria-hidden className="text-ocean-500">✕</span>
                </button>
              ))}
              <button type="button" onClick={clearAll} className="shrink-0 px-2 text-xs font-bold text-coral-600 hover:underline">
                {t("shop.clearAll")}
              </button>
            </div>
          )}

          {/* ── Grid ───────────────────────────────────────────────────── */}
          {filtered.length > 0 ? (
            <>
              <div className={gridClass}>
                {shown.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <div ref={loadMoreRef} className="mx-auto my-8 max-w-xs text-center">
                <p className="text-xs font-semibold text-slate-500">
                  {hasMore ? t("shop.showing", { shown: shown.length, total: filtered.length }) : t("shop.end", { n: filtered.length })}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand-200">
                  <div className="h-full rounded-full bg-ocean-600 transition-all" style={{ width: `${(shown.length / filtered.length) * 100}%` }} />
                </div>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => Math.min(v + 24, filtered.length))}
                    className="btn-secondary mt-4 !py-2 text-sm"
                  >
                    {t("shop.loadMore")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="card flex flex-col items-center gap-3 p-10 text-center">
              <span className="text-5xl" aria-hidden>
                🔍
              </span>
              <p className="font-display text-lg font-bold text-ocean-950">{t("shop.noResults")}</p>
              {active.length > 0 && (
                <>
                  <p className="text-sm text-slate-500">{t("shop.noResults.hint")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {active.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={a.remove}
                        className="rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-900 ring-1 ring-ocean-200"
                      >
                        {a.label} ✕
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={clearAll} className="btn-secondary !py-2 text-sm">
                    {t("shop.clearAll")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Phone: floating Filter · Sort, once the toolbar has scrolled away */}
      {pill && !atFooter && !sheet && (
        <div className="fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:hidden">
          <div className="flex overflow-hidden rounded-full bg-ocean-900 text-sm font-bold text-white shadow-xl ring-4 ring-white/70">
            <button type="button" onClick={() => setSheet("filters")} className="flex items-center gap-2 px-5 py-2.5">
              ⚙️ {t("shop.filters")}
              {active.length > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{active.length}</span>}
            </button>
            <span className="w-px bg-white/20" />
            <button type="button" onClick={() => setSheet("sort")} className="flex items-center gap-2 px-5 py-2.5">
              ↕ {t("shop.sort")}
            </button>
          </div>
        </div>
      )}

      <Sheet
        open={sheet === "filters"}
        onClose={() => setSheet(null)}
        title={t("shop.filters")}
        full
        footer={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={clearAll}
              disabled={active.length === 0}
              className="px-2 text-sm font-bold text-coral-600 disabled:text-slate-300"
            >
              {t("shop.clearAll")}
            </button>
            <button type="button" onClick={() => setSheet(null)} className="btn-primary flex-1 !py-3">
              {showLabel(filtered.length)}
            </button>
          </div>
        }
      >
        {panel}
      </Sheet>

      <Sheet open={sheet === "sort"} onClose={() => setSheet(null)} title={t("shop.sortBy")}>
        <div role="radiogroup" className="space-y-1">
          {SORTS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={sort === key}
              onClick={() => {
                setSort(key);
                setSheet(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold ${
                sort === key ? "bg-ocean-50 text-ocean-900" : "text-slate-700 hover:bg-sand-50"
              }`}
            >
              {t(`shop.sort.${key}` as MessageKey)}
              {sort === key && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ── The filter panel (desktop sidebar and phone sheet) ──────────────────

type Counted = {
  cats: Map<string, number>;
  stores: Map<string, number>;
  subs: Map<string, number>;
  under: Map<number, number>;
  rating: Map<number, number>;
  sale: number;
  attrs: Record<string, Map<string, number>>;
};

function FilterPanel({
  t,
  f,
  counted,
  update,
  toggleIn,
  toggleAttr,
  categories,
  stores,
  facets,
}: {
  t: T;
  f: Filters;
  counted: Counted;
  update: (patch: Partial<Filters>) => void;
  toggleIn: (key: "cats" | "stores", value: string) => void;
  toggleAttr: (handle: string, key: string) => void;
  categories: { slug: string; name: string; icon?: string; parentName?: string }[];
  stores: Store[];
  facets: FacetData;
}) {
  return (
    <div className="divide-y divide-sand-200 border-y border-sand-200">
      {categories.length > 0 && (
        <Section title={t("shop.f.category")} selected={f.cats.length}>
          <OptionList
            t={t}
            label={t("shop.f.category")}
            options={categories.map((c) => ({
              key: c.slug,
              label: `${c.icon ? `${c.icon} ` : ""}${c.name}`,
              hint: c.parentName ? t("shop.f.in", { name: c.parentName }) : undefined,
              count: counted.cats.get(c.slug) ?? 0,
              checked: f.cats.includes(c.slug),
            }))}
            onToggle={(key) => toggleIn("cats", key)}
          />
        </Section>
      )}

      <Section title={t("shop.f.price")} selected={f.under !== null || f.min !== null || f.max !== null ? 1 : 0}>
        <div className="flex flex-wrap gap-1.5">
          {UNDER.map((u) => {
            const n = counted.under.get(u) ?? 0;
            const on = f.under === u;
            return (
              <button
                key={u}
                type="button"
                aria-pressed={on}
                disabled={n === 0 && !on}
                onClick={() => update({ under: on ? null : u, min: null, max: null })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  on ? "bg-ocean-700 text-white" : "bg-white text-slate-700 ring-1 ring-sand-200 hover:ring-ocean-400"
                }`}
              >
                {t("shop.f.under", { amount: money(u) })} <span className={on ? "text-white/70" : "text-slate-400"}>{n}</span>
              </button>
            );
          })}
        </div>
        <PriceRange t={t} min={f.min} max={f.max} onApply={(min, max) => update({ min, max, under: null })} />
      </Section>

      {facets.facets.map((facet) => {
        const counts = counted.attrs[facet.handle] ?? new Map<string, number>();
        const selected = f.attrs[facet.handle] ?? [];
        if (facet.handle === "color") {
          return (
            <Section key={facet.handle} title={facet.name} selected={selected.length}>
              <div className="flex flex-wrap gap-1.5">
                {facet.values.map((v) => {
                  const on = selected.includes(v.key);
                  const n = counts.get(v.key) ?? 0;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={on}
                      disabled={n === 0 && !on}
                      onClick={() => toggleAttr("color", v.key)}
                      className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 transition disabled:opacity-40 ${
                        on ? "bg-ocean-50 text-ocean-900 ring-ocean-600" : "bg-white text-slate-600 ring-sand-200 hover:ring-ocean-400"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: colorSwatch(v.name) }} />
                      {v.name}
                      <span className="text-slate-400">{n}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          );
        }
        const chips = facet.handle === "size" || facet.handle === "shoe-size";
        return (
          <Section key={facet.handle} title={facet.name} selected={selected.length} defaultOpen={selected.length > 0 || chips}>
            {chips ? (
              <div className="flex flex-wrap gap-1.5">
                {facet.values.map((v) => {
                  const on = selected.includes(v.key);
                  const n = counts.get(v.key) ?? 0;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={on}
                      disabled={n === 0 && !on}
                      onClick={() => toggleAttr(facet.handle, v.key)}
                      title={String(n)}
                      className={`min-w-10 rounded-lg px-2 py-1.5 text-xs font-bold ring-1 transition disabled:opacity-40 ${
                        on ? "bg-ocean-700 text-white ring-ocean-700" : "bg-white text-slate-700 ring-sand-200 hover:ring-ocean-400"
                      }`}
                    >
                      {v.name.match(/\(([^)]+)\)$/)?.[1] ?? v.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <OptionList
                t={t}
                label={facet.name}
                options={facet.values.map((v) => ({ key: v.key, label: v.name, count: counts.get(v.key) ?? 0, checked: selected.includes(v.key) }))}
                onToggle={(key) => toggleAttr(facet.handle, key)}
              />
            )}
          </Section>
        );
      })}

      {stores.length > 1 && (
        <Section title={t("shop.f.store")} selected={f.stores.length}>
          <OptionList
            t={t}
            label={t("shop.f.store")}
            options={stores.map((s) => ({
              key: s.slug,
              label: s.name,
              badge: s.official ? t("shop.f.brand") : undefined,
              count: counted.stores.get(s.slug) ?? 0,
              checked: f.stores.includes(s.slug),
            }))}
            onToggle={(key) => toggleIn("stores", key)}
          />
        </Section>
      )}

      <Section title={t("shop.f.rating")} selected={f.rating !== null ? 1 : 0} defaultOpen={false}>
        {RATINGS.map((r) => {
          const n = counted.rating.get(r) ?? 0;
          const on = f.rating === r;
          return (
            <OptionRow
              key={r}
              type="radio"
              label={<><span className="text-mango-400">★</span> {t("shop.f.stars", { n: r }).replace("★", "")}</>}
              count={n}
              checked={on}
              onChange={() => update({ rating: on ? null : r })}
            />
          );
        })}
      </Section>

      <Section title={t("shop.f.deals")} selected={f.sale ? 1 : 0}>
        <OptionRow label={t("shop.f.sale")} count={counted.sale} checked={f.sale} onChange={() => update({ sale: !f.sale })} />
      </Section>
    </div>
  );
}

/** A collapsible filter section; shows how many options are ticked. */
function Section({
  title,
  selected,
  children,
  defaultOpen = true,
}: {
  title: string;
  selected: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen || selected > 0} className="group py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-sm font-bold text-ocean-950">
          {title}
          {selected > 0 && (
            <span className="ml-2 rounded-full bg-ocean-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{selected}</span>
          )}
        </span>
        <span aria-hidden className="text-xs text-slate-400 transition group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

interface Option {
  key: string;
  label: string;
  hint?: string;
  badge?: string;
  count: number;
  checked: boolean;
}

const FEW = 8;
const SEARCH_FROM = 12;

/**
 * A checkbox list that never hides its own rows behind a scrollbar: the
 * top rows (ticked ones first), "Show all N" to expand in place, and a
 * search box once the list is long.
 */
function OptionList({ t, label, options, onToggle }: { t: T; label: string; options: Option[]; onToggle: (key: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const ordered = [...options].sort((a, b) => Number(b.checked) - Number(a.checked) || Number(b.count > 0) - Number(a.count > 0));
  const matched = q ? ordered.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)) : ordered;
  const shown = expanded || q ? matched : matched.slice(0, FEW);

  return (
    <>
      {expanded && options.length >= SEARCH_FROM && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("shop.searchIn", { label: label.toLowerCase() })}
          aria-label={t("shop.searchIn", { label: label.toLowerCase() })}
          className="input !py-2 text-sm"
        />
      )}
      {shown.map((o) => (
        <OptionRow
          key={o.key}
          label={o.label}
          hint={o.hint}
          badge={o.badge}
          count={o.count}
          checked={o.checked}
          onChange={() => onToggle(o.key)}
        />
      ))}
      {options.length > FEW && (
        <button
          type="button"
          onClick={() => {
            setExpanded((e) => !e);
            setQuery("");
          }}
          className="text-xs font-bold text-ocean-700 hover:underline"
        >
          {expanded ? t("shop.showFewer") : t("shop.showAll", { n: options.length })}
        </button>
      )}
    </>
  );
}

/** One option: label wraps instead of being cut off, and the count never hides. */
function OptionRow({
  label,
  hint,
  badge,
  count,
  checked,
  onChange,
  type = "checkbox",
}: {
  label: ReactNode;
  hint?: string;
  badge?: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
}) {
  const disabled = count === 0 && !checked;
  return (
    <label
      className={`flex items-start gap-2.5 rounded-lg px-1 py-1 text-sm ${
        disabled ? "cursor-not-allowed text-slate-300" : "cursor-pointer text-slate-700 hover:bg-sand-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className={`mt-0.5 h-4 w-4 shrink-0 accent-ocean-700 ${type === "radio" ? "rounded-full" : ""}`}
      />
      <span className="min-w-0 flex-1 break-words leading-snug">
        {label}
        {badge && <span className="ml-1.5 rounded bg-mango-100 px-1 text-[9px] font-bold text-mango-800">{badge}</span>}
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <span
        className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
          checked ? "bg-ocean-100 text-ocean-800" : "bg-sand-100 text-slate-500"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {count}
      </span>
    </label>
  );
}

/** Typed price range — applied on "Go" or Enter, not on every keystroke. */
function PriceRange({
  t,
  min,
  max,
  onApply,
}: {
  t: T;
  min: number | null;
  max: number | null;
  onApply: (min: number | null, max: number | null) => void;
}) {
  const [lo, setLo] = useState(min?.toString() ?? "");
  const [hi, setHi] = useState(max?.toString() ?? "");
  useEffect(() => {
    setLo(min?.toString() ?? "");
    setHi(max?.toString() ?? "");
  }, [min, max]);
  const apply = () => {
    const a = lo.trim() === "" ? null : Math.max(0, Number(lo));
    const b = hi.trim() === "" ? null : Math.max(0, Number(hi));
    if ((a !== null && !Number.isFinite(a)) || (b !== null && !Number.isFinite(b))) return;
    onApply(a !== null && b !== null && a > b ? b : a, a !== null && b !== null && a > b ? a : b);
  };
  return (
    <form
      className="flex items-center gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input
        inputMode="decimal"
        value={lo}
        onChange={(e) => setLo(e.target.value)}
        placeholder={`$ ${t("shop.f.min")}`}
        aria-label={t("shop.f.min")}
        className="input !w-0 flex-1 !px-3 !py-2 text-sm"
      />
      <span className="text-slate-400">–</span>
      <input
        inputMode="decimal"
        value={hi}
        onChange={(e) => setHi(e.target.value)}
        placeholder={`$ ${t("shop.f.max")}`}
        aria-label={t("shop.f.max")}
        className="input !w-0 flex-1 !px-3 !py-2 text-sm"
      />
      <button type="submit" className="rounded-full bg-ocean-700 px-3 py-2 text-xs font-bold text-white hover:bg-ocean-800">
        {t("shop.f.apply")}
      </button>
    </form>
  );
}
