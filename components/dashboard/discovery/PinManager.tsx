"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addRecoPin, blockFromReco, deleteRecoPin, toggleRecoPin, unblockFromReco } from "@/app/actions";
import ProductImage from "@/components/ProductImage";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { money } from "@/lib/format";
import { totalStock } from "@/lib/product-utils";
import type { ShelfInfo } from "@/lib/reco/catalogue";
import type { Product, RecoSettings } from "@/lib/types";

/**
 * Pushes and blocks.
 *
 * The panel deliberately shows what will happen rather than only what was
 * configured: a push at a sold-out product is flagged on the row, because
 * the engine drops it and a merchandiser who cannot see that will assume
 * the feature is broken rather than that their product ran out.
 */
export default function PinManager({
  settings,
  products,
  shelves,
}: {
  settings: RecoSettings;
  products: Product[];
  shelves: ShelfInfo[];
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const pinnable = shelves.filter((shelf) => shelf.pinnable);

  return (
    <div className="space-y-5">
      {/* ── New push ───────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📌 Push a product</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          Puts a product into the ranking with extra weight. It still has to
          be in stock, and a shopper who dismissed it still won&apos;t see it.
          Give it a reason — an unexplained card is the one thing on the
          shelf that can&apos;t justify itself.
        </p>

        <SafeForm action={addRecoPin} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pin-product">
              Product
            </label>
            <ProductPicker products={products} />
          </div>

          <div>
            <label className="label" htmlFor="pin-shelf">
              Where
            </label>
            <select id="pin-shelf" name="shelf" defaultValue="auto" className="input">
              <option value="auto">Anywhere the engine can place it</option>
              {pinnable.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.title} · {shelf.surface}
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
              Starts (optional)
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

      {/* ── Live pushes ────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">
          Active pushes{" "}
          <span className="text-sm font-semibold text-slate-400">
            ({settings.pins.length})
          </span>
        </h2>

        {settings.pins.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-sand-50 p-4 text-sm text-slate-500">
            Nothing pushed. The engine is ranking purely on shopper behaviour
            and your order history.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {settings.pins.map((pin) => {
              const product = byId.get(pin.productId);
              const stock = product ? totalStock(product) : 0;
              const shelf = shelves.find((entry) => entry.id === pin.shelf);

              return (
                <li
                  key={pin.id}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${
                    pin.active ? "border-sand-200 bg-white" : "border-sand-200 bg-sand-50 opacity-60"
                  }`}
                >
                  {product ? (
                    <ProductImage
                      product={product}
                      className="h-12 w-12 shrink-0 rounded-xl"
                      iconClass="text-xl"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg">
                      ❓
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {product?.name ?? `Missing product (${pin.productId})`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {shelf ? shelf.title : "Anywhere"}
                      {pin.note ? ` · “${pin.note}”` : ""}
                      {pin.startsAt || pin.endsAt
                        ? ` · ${shortWindow(pin.startsAt, pin.endsAt)}`
                        : ""}
                    </p>

                    {/* What will actually happen, not just what was set. */}
                    {product && stock <= 0 && (
                      <p className="mt-1 text-[11px] font-bold text-coral-600">
                        Out of stock — the engine is skipping this push.
                      </p>
                    )}
                    {product && product.hidden && (
                      <p className="mt-1 text-[11px] font-bold text-coral-600">
                        Hidden from the storefront — this push does nothing.
                      </p>
                    )}
                    {!product && (
                      <p className="mt-1 text-[11px] font-bold text-coral-600">
                        This product no longer exists.
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
                    <form action={toggleRecoPin.bind(null, pin.id)}>
                      <button className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-ocean-400 hover:text-ocean-700">
                        {pin.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteRecoPin.bind(null, pin.id)}>
                      <button className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-400 hover:border-coral-400 hover:text-coral-600">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
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

        <SafeForm action={blockFromReco} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <ProductPicker products={products} />
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
                    <button
                      aria-label="Unblock"
                      className="rounded-full px-1.5 text-slate-400 transition hover:bg-white hover:text-coral-600"
                    >
                      ✕
                    </button>
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

/**
 * A searchable product field.
 *
 * Uses a native <datalist> rather than a custom dropdown: it works on every
 * device the sellers here actually use, needs no keyboard handling, and
 * degrades to a plain text field. The visible value is the product NAME,
 * which is resolved to an id on change — a picker that makes somebody paste
 * an id is one they will get wrong.
 */
function ProductPicker({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState("");

  const options = useMemo(
    () =>
      products
        .filter((product) => !product.hidden)
        .slice(0, 400)
        .map((product) => ({
          id: product.id,
          label: `${product.name} — ${money(product.price)}`,
        })),
    [products],
  );

  const byLabel = useMemo(
    () => new Map(options.map((option) => [option.label, option.id])),
    [options],
  );

  return (
    <>
      <input
        id="pin-product"
        list="bm-product-options"
        placeholder="Start typing a product name…"
        onChange={(event) => setSelected(byLabel.get(event.target.value) ?? "")}
        className="input"
        autoComplete="off"
      />
      <input type="hidden" name="productId" value={selected} />
      <datalist id="bm-product-options">
        {options.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
    </>
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
