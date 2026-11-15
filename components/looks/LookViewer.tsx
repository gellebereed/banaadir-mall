"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import ProductImage from "@/components/ProductImage";
import ShareButton from "@/components/ShareButton";
import { useT } from "@/components/prefs/PrefsProvider";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import { lookPath, occasionLabel, type LookItem, type LookOccasion } from "@/lib/look-utils";
import { isPreorder } from "@/lib/preorder";
import {
  colorOptions,
  defaultVariant,
  findVariant,
  hasVariants,
  lineDeal,
  sizeOptions,
  variantImages,
  variantPrice,
  variantStock,
} from "@/lib/product-utils";
import type { Product } from "@/lib/types";

type Piece = { item: LookItem; product: Product; available: boolean };

/** What the shopper chose for one piece. */
type Choice = { on: boolean; color?: string; size?: string };

/**
 * One piece's options, worked out the way the product page does it: sizes
 * belong to the chosen colour, and a variant is only buyable when that
 * exact colour + size has stock.
 */
function resolve(product: Product, choice: Choice) {
  const withVariants = hasVariants(product);
  const sizes = withVariants
    ? sizeOptions(product, choice.color)
    : (product.sizes ?? []).map((size) => ({ size, inStock: product.stock > 0 }));
  const needsSize = sizes.length > 0 && !choice.size;
  const variant = withVariants ? findVariant(product, choice.color, choice.size) : undefined;
  const price = variantPrice(product, variant);
  const buyable = withVariants
    ? !needsSize && Boolean(variant) && (variantStock(product, variant) > 0 || isPreorder(product))
    : product.stock > 0 || isPreorder(product);
  return { withVariants, sizes, needsSize, variant, price, buyable };
}

/**
 * THE LOOK PAGE — the photo with a dot on every piece, and one sheet to
 * choose a size for each and add the whole outfit to the basket at once.
 *
 * No size is chosen for the shopper. Pre-picking one is how an "add all"
 * button becomes a returns problem (see BundleBox); a piece with sizes
 * waits until it has one, and the button says how many are still missing.
 * Colour starts on the seller's default — the one in the photo.
 */
export default function LookViewer({
  look,
  pieces,
  bundlePrice,
  total,
  storeNames,
  rewardPct,
}: {
  look: { id: string; title: string; description?: string; image: string; occasions: LookOccasion[] };
  pieces: Piece[];
  bundlePrice?: number;
  total: number;
  storeNames: Record<string, string>;
  rewardPct: number;
}) {
  const t = useT();
  const { addToCart } = useCart();
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      pieces.map(({ product, available }) => {
        const preset = defaultVariant(product);
        const color = hasVariants(product) ? preset?.color ?? colorOptions(product)[0]?.color : undefined;
        // One size only: nothing to choose.
        const sizes = hasVariants(product) ? sizeOptions(product, color) : (product.sizes ?? []).map((size) => ({ size }));
        return [product.id, { on: available, color, size: sizes.length === 1 ? sizes[0].size : undefined }];
      }),
    ),
  );
  const [focus, setFocus] = useState<number | null>(null);
  const [dots, setDots] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [tried, setTried] = useState(false);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});

  const resolved = useMemo(
    () => pieces.map((p) => ({ ...p, choice: choices[p.product.id], ...resolve(p.product, choices[p.product.id]) })),
    [pieces, choices],
  );
  const chosen = resolved.filter((r) => r.available && r.choice.on);
  const missing = chosen.filter((r) => r.needsSize);
  const blocked = chosen.filter((r) => !r.needsSize && !r.buyable);
  const sum = chosen.reduce((t2, r) => t2 + r.price, 0);
  const wholeLook = chosen.length === pieces.length;
  const showBundle = bundlePrice !== undefined && wholeLook;
  const payable = showBundle ? Math.min(sum, bundlePrice!) : sum;

  const set = (id: string, patch: Partial<Choice>) => {
    setAdded(false);
    setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  };

  function goTo(id: string) {
    const row = rows.current[id];
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  }

  function addAll() {
    setTried(true);
    if (chosen.length === 0) return;
    if (missing.length > 0) return goTo(missing[0].product.id);
    if (blocked.length > 0) return goTo(blocked[0].product.id);
    for (const r of chosen) {
      const { product, choice, variant, price } = r;
      const images = variantImages(product, variant);
      addToCart({
        productId: product.id,
        qty: 1,
        color: choice.color,
        size: choice.size,
        variantId: variant?.id,
        snapshot: {
          name: product.name,
          price,
          icon: product.icon,
          slug: product.slug,
          store: product.store,
          image: images[0],
          compareAt: lineDeal(product, price).was,
          flashSale: product.flashSale,
          preorder: isPreorder(product) && product.preorder ? { arrivesAt: product.preorder.arrivesAt } : undefined,
        },
      });
    }
    setAdded(true);
  }

  const focused = focus !== null ? resolved[focus] : undefined;
  const buttonLabel =
    chosen.length === 0
      ? t("look.noneChosen")
      : missing.length > 0 && tried
        ? t("look.pickSizes", { n: missing.length })
        : wholeLook
          ? t("look.addAll")
          : t("look.addSome", { n: chosen.length });

  const addButton = (
    <button
      type="button"
      onClick={addAll}
      disabled={chosen.length === 0}
      className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5 text-base disabled:opacity-60"
    >
      <span>{buttonLabel}</span>
      {chosen.length > 0 && <span className="opacity-80">· {money(payable)}</span>}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
      {/* ── The photo ───────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative overflow-hidden rounded-3xl bg-sand-100" onClick={() => setFocus(null)}>
          <div className="relative aspect-[4/5]">
            <Image src={look.image} alt={look.title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
          </div>
          {dots &&
            resolved.map((r, i) => (
              <button
                key={r.product.id}
                type="button"
                aria-label={r.product.name}
                onClick={(e) => {
                  e.stopPropagation();
                  setFocus(focus === i ? null : i);
                }}
                className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xl font-bold leading-none shadow-lg transition ${
                  focus === i ? "scale-110 bg-mango-400 text-ocean-950" : "bg-white/95 text-ocean-950"
                } ${r.available ? "" : "opacity-60"}`}
                style={{ left: `${r.item.x}%`, top: `${r.item.y}%` }}
              >
                <span className={`absolute inset-0 rounded-full ring-4 ${focus === i ? "ring-mango-200/70" : "animate-ping ring-white/40"}`} />
                <span className="relative">{focus === i ? "×" : "+"}</span>
              </button>
            ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDots((d) => !d);
              setFocus(null);
            }}
            className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
          >
            {dots ? t("look.hideDots") : t("look.showDots")}
          </button>

          {/* The tapped piece, in a card over the bottom of the photo. */}
          {focused && (
            <div
              className="absolute inset-x-3 bottom-3 flex animate-fade-up items-center gap-3 rounded-2xl bg-white p-2.5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <ProductImage product={focused.product} className="h-16 w-16 shrink-0 rounded-xl" iconClass="text-2xl" sizes="64px" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ocean-950">{focused.product.name}</p>
                <p className="truncate text-xs text-slate-500">{storeNames[focused.product.store] ?? focused.product.store}</p>
                <p className="text-sm font-bold text-ocean-950">
                  {focused.available ? money(focused.price) : t("look.unavailable")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Link href={`/product/${focused.product.slug}`} className="rounded-xl bg-sand-100 px-3 py-1.5 text-center text-xs font-semibold text-ocean-900">
                  {t("look.view")}
                </Link>
                {focused.available && (
                  <button
                    type="button"
                    onClick={() => {
                      goTo(focused.product.id);
                      setFocus(null);
                    }}
                    className="rounded-xl bg-ocean-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t("look.choose")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── The sheet ───────────────────────────────────────────── */}
      <div>
        {look.occasions.length > 0 && (
          <p className="text-xs font-semibold uppercase tracking-wide text-mango-600">
            {look.occasions.map(occasionLabel).join(" · ")}
          </p>
        )}
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold leading-tight text-ocean-950">{look.title}</h1>
          <ShareButton
            path={lookPath(look)}
            title={look.title}
            text={`${look.title} — the whole look on Banaadir Mall`}
            label={t("look.share")}
          />
        </div>
        {look.description && <p className="mt-2 text-sm text-slate-600">{look.description}</p>}

        {bundlePrice !== undefined && (
          <div className="mt-4 rounded-2xl bg-coral-100 px-4 py-3 text-sm text-coral-700">
            <p className="font-bold">{t("look.bundle", { amount: money(bundlePrice), was: money(total) })}</p>
            {!wholeLook && <p className="mt-0.5 text-xs">{t("look.bundleHint")}</p>}
          </div>
        )}
        {rewardPct > 0 && (
          <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            🎁 {t("look.reward", { pct: rewardPct })}
          </p>
        )}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("look.inThis")} · {t("look.pieces", { n: pieces.length })}
        </h2>
        <ul className="mt-3 space-y-3">
          {resolved.map((r, i) => {
            const { product, choice, available } = r;
            const colours = r.withVariants ? colorOptions(product) : [];
            const warn = tried && choice.on && available && (r.needsSize || !r.buyable);
            return (
              <li
                key={product.id}
                ref={(el) => {
                  rows.current[product.id] = el;
                }}
                className={`card p-3 transition ${flash === product.id ? "ring-2 ring-mango-400" : ""} ${
                  available && choice.on ? "" : "opacity-60"
                }`}
              >
                <div className="flex gap-3">
                  <label className="flex shrink-0 cursor-pointer items-start pt-1">
                    <input
                      type="checkbox"
                      checked={available && choice.on}
                      disabled={!available}
                      onChange={(e) => set(product.id, { on: e.target.checked })}
                      aria-label={product.name}
                      className="h-5 w-5 accent-ocean-700"
                    />
                  </label>
                  <button type="button" onClick={() => setFocus(i)} className="shrink-0">
                    <ProductImage product={product} className="h-20 w-16 rounded-xl" iconClass="text-2xl" sizes="64px" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${product.slug}`} className="line-clamp-2 text-sm font-semibold text-ocean-950 hover:text-ocean-700">
                      {product.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{storeNames[product.store] ?? product.store}</p>
                    <p className="mt-0.5 text-sm font-bold text-ocean-950">
                      {available ? money(r.price) : <span className="text-coral-600">{t("look.unavailable")}</span>}
                    </p>
                  </div>
                </div>

                {available && colours.length > 1 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">
                      {t("look.color")}: <span className="text-ocean-950">{choice.color}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {colours.map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          aria-label={c.color}
                          aria-pressed={choice.color === c.color}
                          onClick={() => {
                            const sizes = sizeOptions(product, c.color);
                            set(product.id, {
                              color: c.color,
                              size: choice.size && sizes.some((s) => s.size === choice.size) ? choice.size : sizes.length === 1 ? sizes[0].size : undefined,
                            });
                          }}
                          className={`h-8 w-8 rounded-full ring-offset-2 transition ${choice.color === c.color ? "ring-2 ring-ocean-700" : "ring-1 ring-sand-200"} ${c.inStock ? "" : "opacity-40"}`}
                          style={{ background: c.swatch }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {available && r.sizes.length > 0 && (
                  <div className="mt-3">
                    <p className={`mb-1.5 text-xs font-semibold ${warn && r.needsSize ? "text-coral-600" : "text-slate-500"}`}>
                      {r.needsSize ? t("look.pickSize") : `${t("look.size")}: `}
                      {!r.needsSize && <span className="text-ocean-950">{choice.size}</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.sizes.map((s) => (
                        <button
                          key={s.size}
                          type="button"
                          disabled={!s.inStock}
                          aria-pressed={choice.size === s.size}
                          onClick={() => set(product.id, { size: s.size, on: true })}
                          className={`min-w-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                            choice.size === s.size
                              ? "border-ocean-900 bg-ocean-900 text-white"
                              : s.inStock
                                ? "border-sand-200 bg-white text-ocean-950 hover:border-ocean-400"
                                : "cursor-not-allowed border-sand-200 bg-sand-50 text-slate-300 line-through"
                          }`}
                        >
                          {s.size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {warn && !r.needsSize && !r.buyable && (
                  <p className="mt-2 text-xs font-semibold text-coral-600">{t("look.notInSize")}</p>
                )}
              </li>
            );
          })}
        </ul>

        {/* Total + button: in the flow on a laptop, pinned on a phone. */}
        <div className="mt-6 hidden md:block">
          <TotalLine sum={sum} payable={payable} showBundle={showBundle} t={t} />
          <div className="mt-3">{addButton}</div>
          {added && <AddedNote t={t} />}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t border-sand-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
        {added ? <AddedNote t={t} /> : addButton}
      </div>
    </div>
  );
}

function TotalLine({ sum, payable, showBundle, t }: { sum: number; payable: number; showBundle: boolean; t: ReturnType<typeof useT> }) {
  return (
    <div className="flex items-baseline justify-between border-t border-sand-200 pt-4">
      <span className="text-sm font-semibold text-slate-500">{t("look.total")}</span>
      <span className="font-display text-2xl font-extrabold text-ocean-950">
        {showBundle && payable < sum && <span className="mr-2 text-base font-medium text-slate-400 line-through">{money(sum)}</span>}
        {money(payable)}
      </span>
    </div>
  );
}

function AddedNote({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 md:mt-3">
      <span className="text-sm font-semibold text-emerald-800">✓ {t("look.added")}</span>
      <Link href="/cart" className="btn-primary !px-4 !py-2 text-sm">
        {t("look.goCart")}
      </Link>
    </div>
  );
}
