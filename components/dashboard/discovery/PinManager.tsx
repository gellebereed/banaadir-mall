"use client";

import PendingButton from "@/components/dashboard/PendingButton";
import { useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  addRecoPin,
  blockFromReco,
  clearEndedRecoPins,
  deleteRecoPin,
  moveRecoPin,
  toggleRecoPin,
  unblockFromReco,
} from "@/app/actions";
import ProductImage from "@/components/ProductImage";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { money } from "@/lib/format";
import { totalStock } from "@/lib/product-utils";
import type { ShelfInfo } from "@/lib/reco/catalogue";
import { formatShopTime, parseShopTime } from "@/lib/shop-time";
import type { Product, RecoPin, RecoSettings, Store } from "@/lib/types";

/**
 * Pushes and blocks.
 *
 * The panel deliberately shows what will happen rather than only what was
 * configured: every push carries its real state (live, scheduled, paused,
 * ended, or not showing and why), because a merchandiser who cannot see
 * that a product sold out or a shelf is switched off will assume the
 * feature is broken.
 */
export default function PinManager({
  settings,
  products,
  shelves,
  stores,
}: {
  settings: RecoSettings;
  products: Product[];
  shelves: ShelfInfo[];
  stores: Store[];
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const storeNames = useMemo(() => new Map(stores.map((s) => [s.slug, s.name])), [stores]);
  const pinnable = shelves.filter((shelf) => shelf.pinnable);
  const blocked = useMemo(() => new Set(settings.blocked), [settings.blocked]);

  /** Shelves the admin has switched off on the Engine tab. */
  const hiddenShelves = useMemo(
    () =>
      new Set(
        settings.shelves.filter((entry) => entry.visible === false).map((entry) => entry.key),
      ),
    [settings.shelves],
  );

  const now = Date.now();
  const rows = settings.pins.map((pin) => {
    const product = byId.get(pin.productId);
    const shelf = shelves.find((entry) => entry.id === pin.shelf);
    return { pin, product, shelf, status: pinStatus(pin, product, shelf, hiddenShelves, now) };
  });
  const counts = rows.reduce<Record<PinState, number>>(
    (acc, row) => ({ ...acc, [row.status.state]: acc[row.status.state] + 1 }),
    { live: 0, scheduled: 0, paused: 0, ended: 0, blocked: 0 },
  );

  // Where the dial puts a push — mirrors pinPlacement in lib/reco/shelves.ts.
  const firstCard = Math.round((1 - settings.pinStrength / 100) * 3) + 1;
  // The form remounts (and so clears) whenever the list of pushes changes,
  // i.e. after a successful save.
  const formKey = settings.pins.map((pin) => pin.id).join(",");

  return (
    <div className="space-y-5">
      {/* ── New push ───────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📌 Push a product</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          A push gets a guaranteed place on the recommendation shelves it
          is allowed on — from card {firstCard} of the row, and never more
          than a third of a row. It still has to be in stock, and a shopper
          who dismissed it won&apos;t see it.{" "}
          {settings.pinStrength > 0 ? (
            <Link href="/admin/discovery?tab=engine" className="font-semibold text-ocean-700 underline">
              Push strength: {settings.pinStrength}
            </Link>
          ) : (
            <Link href="/admin/discovery?tab=engine" className="font-semibold text-coral-600 underline">
              Push strength is 0 — pushes are off
            </Link>
          )}
        </p>

        <SafeForm key={formKey} action={addRecoPin} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="label">Product</span>
            <ProductPicker products={products} storeNames={storeNames} blocked={blocked} />
          </div>

          <div>
            <label className="label" htmlFor="pin-shelf">
              Where
            </label>
            <select id="pin-shelf" name="shelf" defaultValue="auto" className="input">
              <option value="auto">Anywhere — the first shelf each shopper sees</option>
              {pinnable.map((shelf) => (
                <option key={shelf.id} value={shelf.id} disabled={hiddenShelves.has(shelf.id)}>
                  {shelf.title} · {shelf.surface}
                  {hiddenShelves.has(shelf.id) ? " (switched off)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="pin-note">
              Reason shown on the card
            </label>
            <input
              id="pin-note"
              name="note"
              maxLength={90}
              placeholder="e.g. New from Karaca this week"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="pin-start">
              Starts (optional, Mogadishu time)
            </label>
            <input id="pin-start" type="datetime-local" name="startsAt" className="input" />
          </div>

          <div>
            <label className="label" htmlFor="pin-end">
              Ends (optional)
            </label>
            <input id="pin-end" type="datetime-local" name="endsAt" className="input" />
          </div>

          <div className="sm:col-span-2">
            <SubmitButton>Add push</SubmitButton>
          </div>
        </SafeForm>
      </section>

      {/* ── Pushes ─────────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold text-ocean-950">
            Pushes{" "}
            <span className="text-sm font-semibold text-slate-400">({settings.pins.length})</span>
          </h2>
          {counts.ended > 0 && (
            <form action={clearEndedRecoPins}>
              <PendingButton className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-coral-400 hover:text-coral-600">
                Clear {counts.ended} ended
              </PendingButton>
            </form>
          )}
        </div>

        {settings.pins.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            {(Object.keys(STATE_STYLE) as PinState[])
              .filter((state) => counts[state] > 0)
              .map((state) => (
                <span key={state} className={`rounded-full px-2.5 py-1 ${STATE_STYLE[state].chip}`}>
                  {counts[state]} {STATE_STYLE[state].label.toLowerCase()}
                </span>
              ))}
          </div>
        )}

        {settings.pins.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-sand-50 p-4 text-sm text-slate-500">
            Nothing pushed. The engine is ranking purely on shopper behaviour
            and your order history.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-slate-400">
              Order matters: when several pushes fit one shelf, the higher one takes the earlier card.
            </p>
            <ul className="mt-3 space-y-2.5">
              {rows.map(({ pin, product, shelf, status }, index) => (
                <li
                  key={pin.id}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${
                    status.state === "live" ? "border-sand-200 bg-white" : "border-sand-200 bg-sand-50"
                  }`}
                >
                  <div className="flex flex-col">
                    <form action={moveRecoPin.bind(null, pin.id, "up")}>
                      <PendingButton
                        iconOnly
                        aria-label="Move up"
                        disabled={index === 0}
                        className="rounded px-1 text-xs text-slate-400 hover:text-ocean-700 disabled:opacity-30"
                      >
                        ▲
                      </PendingButton>
                    </form>
                    <form action={moveRecoPin.bind(null, pin.id, "down")}>
                      <PendingButton
                        iconOnly
                        aria-label="Move down"
                        disabled={index === rows.length - 1}
                        className="rounded px-1 text-xs text-slate-400 hover:text-ocean-700 disabled:opacity-30"
                      >
                        ▼
                      </PendingButton>
                    </form>
                  </div>

                  {product ? (
                    <ProductImage
                      product={product}
                      className={`h-12 w-12 shrink-0 rounded-xl ${status.state === "live" ? "" : "opacity-60"}`}
                      iconClass="text-xl"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg">
                      ❓
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${STATE_STYLE[status.state].chip}`}
                      >
                        {STATE_STYLE[status.state].label}
                      </span>
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                        {product?.name ?? `Missing product (${pin.productId})`}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {shelf ? `${shelf.title} · ${shelf.surface}` : "Anywhere"}
                      {product ? ` · ${storeNames.get(product.store) ?? product.store}` : ""}
                      {pin.note ? ` · “${pin.note}”` : ""}
                      {pin.startsAt || pin.endsAt ? ` · ${shortWindow(pin.startsAt, pin.endsAt)}` : ""}
                    </p>
                    {status.detail && (
                      <p
                        className={`mt-1 text-[11px] ${
                          status.state === "blocked" ? "font-bold text-coral-600" : "text-slate-500"
                        }`}
                      >
                        {status.detail}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {product && (
                      <Link
                        href={`/product/${product.slug}`}
                        className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-ocean-300 hover:text-ocean-700"
                      >
                        View
                      </Link>
                    )}
                    {status.state !== "ended" && (
                      <form action={toggleRecoPin.bind(null, pin.id)}>
                        <PendingButton className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-ocean-400 hover:text-ocean-700">
                          {pin.active ? "Pause" : "Resume"}
                        </PendingButton>
                      </form>
                    )}
                    <form action={deleteRecoPin.bind(null, pin.id)}>
                      <PendingButton className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-400 hover:border-coral-400 hover:text-coral-600">
                        Remove
                      </PendingButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── Blocks ─────────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🚫 Never recommend</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          Keeps a product out of every recommendation for every shopper. It
          stays fully browsable and buyable — this only stops the engine
          suggesting it. Useful for clearance lines, or anything you
          don&apos;t want appearing beside something else.
        </p>

        <SafeForm
          key={settings.blocked.join(",")}
          action={blockFromReco}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[240px] flex-1">
            <ProductPicker products={products} storeNames={storeNames} blocked={blocked} />
          </div>
          <SubmitButton className="btn-secondary !px-4 !py-2.5 text-sm">Block</SubmitButton>
        </SafeForm>

        {settings.blocked.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {settings.blocked.map((id) => {
              const product = byId.get(id);
              return (
                <li
                  key={id}
                  className="inline-flex items-center gap-2 rounded-full bg-sand-100 py-1 pl-3 pr-1 text-xs font-semibold text-slate-700"
                >
                  {product?.name ?? id}
                  <form action={unblockFromReco.bind(null, id)}>
                    <PendingButton iconOnly
                      aria-label="Unblock"
                      className="rounded-full px-1.5 text-slate-400 transition hover:bg-white hover:text-coral-600"
                    >
                      ✕
                    </PendingButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

type PinState = "live" | "scheduled" | "paused" | "ended" | "blocked";

const STATE_STYLE: Record<PinState, { label: string; chip: string }> = {
  live: { label: "Live", chip: "bg-emerald-100 text-emerald-800" },
  scheduled: { label: "Scheduled", chip: "bg-ocean-100 text-ocean-800" },
  paused: { label: "Paused", chip: "bg-sand-100 text-slate-600" },
  blocked: { label: "Not showing", chip: "bg-coral-100 text-coral-700" },
  ended: { label: "Ended", chip: "bg-sand-100 text-slate-500" },
};

/**
 * What a push is actually doing right now, not just what was set — the
 * same checks the engine makes (lib/reco/service.ts livePins, and the
 * stock filter in lib/reco/engine.ts). A push that is saved but not
 * showing must say why on its own row, or it reads as a broken control.
 */
function pinStatus(
  pin: RecoPin,
  product: Product | undefined,
  shelf: ShelfInfo | undefined,
  hiddenShelves: Set<string>,
  now: number,
): { state: PinState; detail?: string } {
  const starts = pin.startsAt ? parseShopTime(pin.startsAt) : NaN;
  const ends = pin.endsAt ? parseShopTime(pin.endsAt) : NaN;
  if (!Number.isNaN(ends) && ends <= now) return { state: "ended", detail: `Ended ${formatShopTime(pin.endsAt!)}.` };
  if (!product) return { state: "blocked", detail: "This product no longer exists." };
  if (product.hidden) return { state: "blocked", detail: "Hidden from the storefront — this push does nothing." };
  if (totalStock(product) <= 0) return { state: "blocked", detail: "Out of stock — skipped until it is restocked." };
  if (shelf && hiddenShelves.has(shelf.id)) {
    return { state: "blocked", detail: `“${shelf.title}” is switched off, so this push has nowhere to appear.` };
  }
  if (!pin.active) return { state: "paused" };
  if (!Number.isNaN(starts) && starts > now) {
    return { state: "scheduled", detail: `Starts ${formatShopTime(pin.startsAt!)}.` };
  }
  // Some rows only exist for some shoppers — say so, so a push that
  // doesn't show for a brand-new visitor isn't mistaken for a broken one.
  return { state: "live", detail: shelf?.blurb };
}

/**
 * A searchable product field.
 *
 * Searches every product — by name, shop, product code or barcode — and
 * shows a photo, price and stock beside each match, so the right one of
 * five similar shirts is easy to tell apart. It replaced a <datalist> that
 * only held the first 400 products (a single supplier import is over a
 * thousand) and only saved when the typed text matched an option exactly.
 */
function ProductPicker({
  products,
  storeNames,
  blocked,
}: {
  products: Product[];
  storeNames: Map<string, string>;
  blocked: Set<string>;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const index = useMemo(
    () =>
      products
        .filter((product) => !product.hidden)
        .map((product) => ({
          product,
          haystack: [
            product.name,
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

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return index
      .filter((entry) => words.every((word) => entry.haystack.includes(word)))
      .slice(0, 8)
      .map((entry) => entry.product);
  }, [index, query]);

  function choose(product: Product) {
    setSelected(product);
    setQuery("");
    setOpen(false);
  }

  if (selected) {
    const stock = totalStock(selected);
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-ocean-200 bg-ocean-50/50 p-2.5">
        <input type="hidden" name="productId" value={selected.id} />
        <ProductImage product={selected} className="h-11 w-11 shrink-0 rounded-xl" iconClass="text-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{selected.name}</p>
          <p className="text-xs text-slate-500">
            {storeNames.get(selected.store) ?? selected.store} · {money(selected.price)} ·{" "}
            <span className={stock > 0 ? "" : "font-bold text-coral-600"}>
              {stock > 0 ? `${stock} in stock` : "out of stock"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-ocean-400"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name="productId" value="" />
      <input
        id={`${id}-search`}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-list`}
        aria-label="Search products"
        placeholder="Search by name, shop, code or barcode…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!matches.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            // Enter picks the highlighted product instead of submitting a
            // form with no product in it.
            event.preventDefault();
            choose(matches[active]);
          }
        }}
        className="input"
        autoComplete="off"
      />
      {open && query.trim() && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-sand-200 bg-white p-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">No product matches “{query.trim()}”.</li>
          ) : (
            matches.map((product, i) => {
              const stock = totalStock(product);
              return (
                <li key={product.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(product)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${
                      i === active ? "bg-ocean-50" : ""
                    }`}
                  >
                    <ProductImage product={product} className="h-10 w-10 shrink-0 rounded-lg" iconClass="text-base" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{product.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {storeNames.get(product.store) ?? product.store} · {money(product.price)}
                        {stock <= 0 ? " · out of stock" : ""}
                        {blocked.has(product.id) ? " · on Never recommend" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function shortWindow(startsAt?: string, endsAt?: string): string {
  const format = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const from = format(startsAt);
  const to = format(endsAt);
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return "";
}
