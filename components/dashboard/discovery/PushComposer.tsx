"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import { money } from "@/lib/format";
import { totalStock } from "@/lib/product-utils";
import type { ShelfInfo } from "@/lib/reco/catalogue";
import type { Product, RecoPin, Store } from "@/lib/types";

/**
 * Push composer — choose products, say where and for how long, see the
 * card shoppers will get, push.
 *
 * ── Why it is built this way ─────────────────────────────────────────────
 * The first version was a type-ahead: a text box whose matches appeared in
 * a dropdown, and only a match picked from it counted. Merchandisers typed
 * a name, saw nothing they recognised (imported products are hidden until
 * published, and the search skipped hidden ones without saying so), pressed
 * Enter, and could not tell whether anything had been chosen.
 *
 * So here nothing is implicit:
 *   - results are always on the page, before typing (best sellers) and
 *     while typing, with how many matched;
 *   - every product says whether it can be pushed, and if not, why;
 *   - what is selected sits in its own panel, with a preview of the card;
 *   - the button says exactly what it will do ("Push 2 products").
 */

const MAX_SELECTED = 10;
const PAGE = 12;

type Availability = "ok" | "pushed" | "out" | "hidden" | "blocked";

const AVAILABILITY: Record<Availability, { label: string; tone: string; pushable: boolean }> = {
  ok: { label: "", tone: "", pushable: true },
  pushed: { label: "Already pushed", tone: "bg-emerald-100 text-emerald-800", pushable: true },
  out: { label: "Out of stock", tone: "bg-amber-100 text-amber-800", pushable: false },
  hidden: { label: "Hidden from shop", tone: "bg-sand-100 text-slate-600", pushable: false },
  blocked: { label: "On Never recommend", tone: "bg-coral-100 text-coral-700", pushable: false },
};

const WHY_NOT: Record<Exclude<Availability, "ok" | "pushed">, string> = {
  out: "Out of stock — restock it first; the engine skips sold-out products.",
  hidden: "Hidden from the shop — publish it first (it needs a photo).",
  blocked: "On the Never recommend list below — remove it there first.",
};

const REASONS = ["New arrival", "Back in stock", "Staff pick", "Limited stock", "Best seller"];

const DURATIONS: { key: string; label: string; days?: number }[] = [
  { key: "none", label: "No end" },
  { key: "1d", label: "1 day", days: 1 },
  { key: "3d", label: "3 days", days: 3 },
  { key: "7d", label: "1 week", days: 7 },
  { key: "14d", label: "2 weeks", days: 14 },
  { key: "custom", label: "Custom" },
];

export default function PushComposer({
  products,
  stores,
  shelves,
  hiddenShelves,
  blocked,
  pushedIds,
  pinStrength,
  onPushed,
}: {
  products: Product[];
  stores: Store[];
  shelves: ShelfInfo[];
  hiddenShelves: Set<string>;
  blocked: Set<string>;
  pushedIds: Set<string>;
  pinStrength: number;
  /** The pushes just saved — shown in the list before the page refresh lands. */
  onPushed: (pins: RecoPin[]) => void;
}) {
  const storeNames = useMemo(() => new Map(stores.map((s) => [s.slug, s.name])), [stores]);

  // ── Browse ────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [shop, setShop] = useState("");
  const [order, setOrder] = useState<"best" | "new">("best");
  const [shown, setShown] = useState(PAGE);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const availability = (p: Product): Availability =>
    p.hidden ? "hidden" : blocked.has(p.id) ? "blocked" : totalStock(p) <= 0 ? "out" : pushedIds.has(p.id) ? "pushed" : "ok";

  const index = useMemo(
    () =>
      products.map((product, position) => ({
        product,
        position,
        haystack: [
          product.name,
          product.supplier?.brand,
          storeNames.get(product.store) ?? product.store,
          product.internalReference,
          product.barcode,
          ...(product.variants ?? []).map((v) => v.barcode),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [products, storeNames],
  );

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = index.filter(
      (entry) =>
        (!shop || entry.product.store === shop) && words.every((word) => entry.haystack.includes(word)),
    );
    const rank = (a: Availability) => (AVAILABILITY[a].pushable ? 0 : 1);
    return list
      .map((entry) => ({ ...entry, state: availability(entry.product) }))
      .sort(
        (a, b) =>
          // Pushable first — the ones that can't be pushed are listed, with
          // their reason, rather than silently missing.
          rank(a.state) - rank(b.state) ||
          (words.length === 0 && order === "best" ? b.product.sold - a.product.sold : 0) ||
          (order === "new" ? b.position - a.position : 0) ||
          a.product.name.localeCompare(b.product.name),
      );
  }, [index, query, shop, order, blocked, pushedIds]);

  // ── Selection ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Product[]>([]);
  const selectedIds = new Set(selected.map((p) => p.id));

  function toggle(product: Product) {
    if (!AVAILABILITY[availability(product)].pushable) return;
    setMessage(null);
    setSelected((current) =>
      current.some((p) => p.id === product.id)
        ? current.filter((p) => p.id !== product.id)
        : current.length >= MAX_SELECTED
          ? current
          : [...current, product],
    );
  }

  // ── Settings ──────────────────────────────────────────────────────
  const pinnable = shelves.filter((s) => s.pinnable && !hiddenShelves.has(s.id));
  const [placement, setPlacement] = useState<"auto" | "shelf">("auto");
  const [shelf, setShelf] = useState(pinnable[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("none");
  const [endsAt, setEndsAt] = useState("");

  // ── Submit ────────────────────────────────────────────────────────
  // Saved through /api/admin/reco-pins, not a server action — see that
  // route for why. The confirmation shows as soon as the save answers;
  // the pushes list below refreshes on its own afterwards.
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startRefresh] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // datetime-local values are Mogadishu time (lib/shop-time.ts); the
  // presets are exact moments, sent with their zone.
  const start = startMode === "later" && startsAt ? startsAt : "";
  const preset = DURATIONS.find((d) => d.key === duration);
  const end = preset?.days
    ? new Date((start ? Date.parse(`${start}+03:00`) : Date.now()) + preset.days * 86_400_000).toISOString()
    : duration === "custom"
      ? endsAt
      : "";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (selected.length === 0) {
      setMessage({ ok: false, text: "Choose at least one product from the list." });
      searchRef.current?.focus();
      return;
    }
    setMessage(null);
    setPending(true);
    const names = selected.map((p) => p.name);
    try {
      const response = await fetch("/api/admin/reco-pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: selected.map((p) => p.id),
          shelf: placement === "shelf" && shelf ? shelf : "auto",
          note: note.trim(),
          startsAt: start,
          endsAt: end,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; pins?: RecoPin[] };
      if (!response.ok || !result.ok) {
        setMessage({ ok: false, text: result.error ?? "Couldn't save the push. Try again." });
        return;
      }
      setMessage({
        ok: true,
        text: `✓ ${names.length === 1 ? `“${names[0]}” is` : `${names.length} products are`} pushed${
          start ? " — it starts at the scheduled time" : " and live now"
        }.`,
      });
      setSelected([]);
      setNote("");
      onPushed(result.pins ?? []);
      startRefresh(() => router.refresh());
    } catch {
      setMessage({ ok: false, text: "Couldn't reach the server — check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  const visible = results.slice(0, shown);
  const firstCard = Math.round((1 - pinStrength / 100) * 3) + 1;
  const preview = selected[0];

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-sand-200 p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ocean-950">📌 Push products</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          Pushed products get a guaranteed place on the recommendation shelves — from card {firstCard} of
          the row, never more than a third of it. Shoppers who dismissed a product still won&apos;t see it.{" "}
          <Link
            href="/admin/discovery?tab=engine"
            className={`font-semibold underline ${pinStrength > 0 ? "text-ocean-700" : "text-coral-600"}`}
          >
            {pinStrength > 0 ? `Push strength: ${pinStrength}` : "Push strength is 0 — pushes are off"}
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── 1. Choose ─────────────────────────────────────────── */}
        <div className="min-w-0 p-5 sm:p-6 lg:border-r lg:border-sand-200">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">1 · Choose products</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShown(PAGE);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((i) => Math.min(i + 1, visible.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (visible[active]) toggle(visible[active].product);
                  }
                }}
                placeholder="Search name, shop, brand, code or barcode"
                aria-label="Search products"
                className="input !pl-10"
                autoComplete="off"
              />
            </div>
            <select
              value={shop}
              onChange={(event) => {
                setShop(event.target.value);
                setShown(PAGE);
              }}
              aria-label="Filter by shop"
              className="input sm:!w-48"
            >
              <option value="">All shops</option>
              {stores.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-slate-500" aria-live="polite">
              {query || shop
                ? `${results.length} product${results.length === 1 ? "" : "s"} match`
                : `${products.length} products`}
              {query ? ` “${query.trim()}”` : ""}
            </p>
            {!query && (
              <div className="flex rounded-full bg-sand-100 p-0.5 font-bold">
                {(["best", "new"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOrder(key)}
                    className={`rounded-full px-3 py-1 ${order === key ? "bg-white text-ocean-900 shadow-sm" : "text-slate-500"}`}
                  >
                    {key === "best" ? "Best sellers" : "Newest"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-sand-50 p-6 text-center text-sm text-slate-500">
              No product matches “{query.trim()}”{shop ? ` in ${storeNames.get(shop)}` : ""}. Try fewer
              words, or a product code or barcode.
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5" role="listbox" aria-multiselectable="true" aria-label="Products">
              {visible.map(({ product, state }, i) => {
                const meta = AVAILABILITY[state];
                const isSelected = selectedIds.has(product.id);
                const stock = totalStock(product);
                return (
                  <li key={product.id} role="option" aria-selected={isSelected} aria-disabled={!meta.pushable}>
                    <button
                      type="button"
                      onClick={() => toggle(product)}
                      onMouseEnter={() => setActive(i)}
                      disabled={!meta.pushable}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                        isSelected
                          ? "border-ocean-500 bg-ocean-50 ring-2 ring-ocean-200"
                          : i === active && meta.pushable
                            ? "border-ocean-300 bg-white"
                            : "border-sand-200 bg-white"
                      } ${meta.pushable ? "hover:border-ocean-300" : "cursor-not-allowed opacity-60"}`}
                    >
                      <ProductImage product={product} className="h-12 w-12 shrink-0 rounded-xl" iconClass="text-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{product.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {storeNames.get(product.store) ?? product.store} · {money(product.price)}
                          {state === "ok" || state === "pushed" ? ` · ${stock} in stock` : ""}
                          {product.sold > 0 ? ` · ${product.sold} sold` : ""}
                        </span>
                        {!meta.pushable && (
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {WHY_NOT[state as keyof typeof WHY_NOT]}
                          </span>
                        )}
                      </span>
                      {meta.label && (
                        <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold sm:inline ${meta.tone}`}>
                          {meta.label}
                        </span>
                      )}
                      <span
                        aria-hidden
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold ${
                          isSelected
                            ? "border-ocean-600 bg-ocean-600 text-white"
                            : meta.pushable
                              ? "border-sand-300 text-transparent"
                              : "border-sand-200 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {results.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE * 2)}
              className="btn-secondary mt-3 w-full !py-2 text-sm"
            >
              Show more ({results.length - shown} more)
            </button>
          )}
        </div>

        {/* ── 2. Your push ──────────────────────────────────────── */}
        <div className="min-w-0 border-t border-sand-200 bg-sand-50/60 p-5 sm:p-6 lg:border-t-0">
          <div className="lg:sticky lg:top-24">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
              2 · Your push{selected.length ? ` · ${selected.length} selected` : ""}
            </p>

            {selected.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-sand-300 bg-white p-4 text-sm text-slate-500">
                Tap products on the left to add them. You can push up to {MAX_SELECTED} at once.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {selected.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-xl bg-white p-2 ring-1 ring-sand-200">
                    <ProductImage product={p} className="h-9 w-9 shrink-0 rounded-lg" iconClass="text-sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      aria-label={`Remove ${p.name}`}
                      className="rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-sand-100 hover:text-coral-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Where */}
            <fieldset className="mt-5">
              <legend className="label">Where</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["auto", "shelf"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlacement(key)}
                    aria-pressed={placement === key}
                    disabled={key === "shelf" && pinnable.length === 0}
                    className={`rounded-xl border p-2.5 text-left text-xs transition ${
                      placement === key ? "border-ocean-500 bg-white ring-2 ring-ocean-200" : "border-sand-200 bg-white"
                    }`}
                  >
                    <span className="block font-bold text-slate-800">{key === "auto" ? "Anywhere" : "One shelf"}</span>
                    <span className="block text-slate-500">
                      {key === "auto" ? "First shelf each shopper sees — recommended" : "Only on the row you pick"}
                    </span>
                  </button>
                ))}
              </div>
              {placement === "shelf" && (
                <select value={shelf} onChange={(e) => setShelf(e.target.value)} className="input mt-2" aria-label="Shelf">
                  {pinnable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {s.surface}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>

            {/* Reason */}
            <div className="mt-4">
              <label className="label" htmlFor="push-note">
                Reason on the card <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="push-note"
                value={note}
                maxLength={90}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Picked by Banaadir Mall"
                className="input"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNote(r)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${
                      note === r ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-600 ring-sand-200 hover:ring-ocean-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* When */}
            <div className="mt-4">
              <span className="label">Starts</span>
              <div className="flex rounded-xl bg-white p-0.5 text-xs font-bold ring-1 ring-sand-200">
                {(["now", "later"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStartMode(key)}
                    className={`flex-1 rounded-lg py-1.5 ${startMode === key ? "bg-ocean-900 text-white" : "text-slate-500"}`}
                  >
                    {key === "now" ? "Now" : "Schedule"}
                  </button>
                ))}
              </div>
              {startMode === "later" && (
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  aria-label="Start time (Mogadishu)"
                  className="input mt-2"
                />
              )}

              <span className="label mt-3">Runs for</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDuration(d.key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${
                      duration === d.key ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-600 ring-sand-200 hover:ring-ocean-300"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {duration === "custom" && (
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  aria-label="End time (Mogadishu)"
                  className="input mt-2"
                />
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">Times are Mogadishu time.</p>
            </div>

            {/* Preview */}
            {preview && (
              <div className="mt-5">
                <span className="label">What shoppers see</span>
                <div className="w-40 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-sand-200">
                  <ProductImage product={preview} className="aspect-square w-full" iconClass="text-4xl" />
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-[11px] font-bold text-ocean-700">✨ {note.trim() || "Picked by Banaadir Mall"}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-800">{preview.name}</p>
                    <p className="mt-1 text-sm font-extrabold text-ocean-950">{money(preview.price)}</p>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <p
                role="status"
                className={`mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  message.ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                }`}
              >
                {message.text}
              </p>
            )}

            <form onSubmit={onSubmit}>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary mt-4 w-full disabled:cursor-wait disabled:opacity-70"
              >
                {pending
                  ? "Pushing…"
                  : selected.length === 0
                    ? "Choose products to push"
                    : `Push ${selected.length === 1 ? "1 product" : `${selected.length} products`}`}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
