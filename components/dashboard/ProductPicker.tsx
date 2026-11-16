"use client";

import { useMemo, useState } from "react";
import ProductImage from "@/components/ProductImage";
import { money } from "@/lib/format";
import { isPreorder } from "@/lib/preorder";
import type { Category, Store } from "@/lib/types";
import type { PickerProduct } from "@/lib/product-utils";

/**
 * Reusable multi-product selector used by flash deals and promotions.
 *
 * IMPORTANT: the selected ids are submitted through hidden inputs driven by
 * component state — never through the visible checkboxes. Checkboxes only
 * exist for rows currently passing the filters, so submitting from them
 * would silently drop every selection the search happened to hide.
 *
 * `badges` adds a Badge filter (Pre-order, Sale, New…). `blockPreorders`
 * is for sales: pre-orders can't be ticked, because a promotion never
 * discounts them (lib/api.ts) — their price before arrival is the shop's
 * early price, set in the product editor.
 */
export default function ProductPicker({
  products,
  categories,
  stores,
  initial = [],
  name = "productIds",
  badges,
  blockPreorders = false,
}: {
  products: PickerProduct[];
  categories: Category[];
  /** Omit to hide the store filter (sellers only see their own store). */
  stores?: Store[];
  initial?: string[];
  name?: string;
  /** product id → the badge it wears today; shows the Badge filter. */
  badges?: Record<string, string>;
  blockPreorders?: boolean;
}) {
  const blocked = (p: PickerProduct) => blockPreorders && isPreorder(p);
  const [picked, setPicked] = useState<string[]>(() =>
    initial.filter((id) => {
      const p = products.find((x) => x.id === id);
      return !p || !blocked(p);
    }),
  );
  const [badge, setBadge] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [store, setStore] = useState("");

  const storeName = (slug: string) => stores?.find((s) => s.slug === slug)?.name ?? slug;

  const badgeOf = (p: PickerProduct) => badges?.[p.id] ?? "none";
  const badgeOptions = useMemo(() => {
    if (!badges) return [];
    const counts = new Map<string, number>();
    for (const p of products) counts.set(badgeOf(p), (counts.get(badgeOf(p)) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, label: id === "none" ? "No badge" : id }))
      .sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : b.count - a.count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, badges]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!onlyPicked || picked.includes(p.id)) &&
        (!category || p.category === category) &&
        (!store || p.store === store) &&
        (!badge || badgeOf(p) === badge) &&
        (!q || p.name.toLowerCase().includes(q) || storeName(p.store).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, category, store, badge, onlyPicked, picked]);
  const selectable = visible.filter((p) => !blocked(p));
  const blockedShown = visible.length - selectable.length;

  const pickedProducts = products.filter((p) => picked.includes(p.id));

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <div className="rounded-2xl border border-sand-200 bg-sand-50 p-3">
      {/* Selections travel with the form regardless of the current filter. */}
      {picked.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="min-w-40 flex-1 rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-ocean-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-ocean-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        {stores && (
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            aria-label="Filter by store"
            className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-ocean-500"
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {badges && badgeOptions.length > 0 && (
          <select
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            aria-label="Filter by badge"
            className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-ocean-500"
          >
            <option value="">Any badge</option>
            {badgeOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.count})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Many at once, or one by one: tick rows below for single picks,
          or act on everything the filters show. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setPicked([...new Set([...picked, ...selectable.map((p) => p.id)])])}
          disabled={selectable.length === 0}
          className="text-xs font-bold text-ocean-700 hover:underline disabled:text-slate-300 disabled:no-underline"
        >
          Select all shown ({selectable.length})
        </button>
        <button
          type="button"
          onClick={() => {
            const shown = new Set(visible.map((p) => p.id));
            setPicked(picked.filter((id) => !shown.has(id)));
          }}
          className="text-xs font-bold text-slate-500 hover:underline"
        >
          Unselect shown
        </button>
        <button
          type="button"
          onClick={() => setPicked([])}
          className="text-xs font-bold text-slate-400 hover:underline"
        >
          Clear all
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={onlyPicked}
            onChange={(e) => setOnlyPicked(e.target.checked)}
            className="h-3.5 w-3.5 accent-ocean-700"
          />
          Show selected only
        </label>
      </div>
      {blockPreorders && blockedShown > 0 && (
        <p className="mt-2 rounded-lg bg-mango-50 px-3 py-2 text-[11px] text-mango-800">
          ⏳ {blockedShown} pre-order product{blockedShown === 1 ? "" : "s"} can&apos;t be added to a sale —
          their price before arrival is the early price in the product editor.
        </p>
      )}

      {/* What's currently selected — visible even when filtered out */}
      <div className="mt-3 rounded-xl bg-white p-3">
        <p className="text-xs font-bold text-slate-600">
          {picked.length} selected
        </p>
        {pickedProducts.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {pickedProducts.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 rounded-full bg-ocean-50 py-1 pl-1 pr-2 text-xs font-semibold text-ocean-900"
              >
                <ProductImage
                  product={p}
                  iconClass="text-[10px]"
                  className="h-5 w-5 rounded-full"
                  sizes="20px"
                />
                <span className="max-w-40 truncate">{p.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="text-ocean-400 hover:text-coral-600"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-400">
            Nothing selected yet — tick products below.
          </p>
        )}
      </div>

      {/* Browse list */}
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {visible.map((p) => (
          <label
            key={p.id}
            className={`flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm ${
              blocked(p) ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-ocean-50"
            }`}
            title={blocked(p) ? "Pre-orders can't be put on sale" : undefined}
          >
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              disabled={blocked(p)}
              onChange={() => toggle(p.id)}
              className="h-4 w-4 accent-ocean-700"
            />
            <ProductImage
              product={p}
              iconClass="text-sm"
              className="h-9 w-9 shrink-0 rounded-lg"
              sizes="36px"
            />
            <span className="min-w-0 flex-1 truncate text-slate-700">{p.name}</span>
            {(isPreorder(p) || (badges && badges[p.id])) && (
              <span
                className={`shrink-0 rounded-full px-2 text-[10px] font-bold ${
                  isPreorder(p) ? "bg-mango-100 text-mango-800" : "bg-sand-100 text-slate-600"
                }`}
              >
                {isPreorder(p) ? "Pre-order" : badges![p.id]}
              </span>
            )}
            {stores && (
              <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                {storeName(p.store)}
              </span>
            )}
            <span className="shrink-0 font-semibold text-slate-600">{money(p.price)}</span>
          </label>
        ))}
        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No products match these filters.
          </p>
        )}
      </div>
    </div>
  );
}
