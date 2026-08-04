"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FREQUENTLY BOUGHT TOGETHER.
 * ─────────────────────────────────────────────────────────────────────────
 * The highest-yielding module in online retail, and the one most often
 * ruined. Two decisions keep it honest here:
 *
 *   IT ONLY APPEARS WITH EVIDENCE. Partners come exclusively from real
 *   co-purchase edges (lib/reco/psychology.ts, buildBundle) — never from
 *   "these look similar". A product nobody has bought alongside anything
 *   simply has no bundle, and the page renders without one. Filling the
 *   slot with a guess is how the module turns into an advert.
 *
 *   IT SHOWS ITS WORKING. "Based on 23 real orders that included this."
 *   Anyone can check that claim against the sold counts on the same page.
 *
 * Items are individually deselectable and the total updates live, because
 * the alternative — one button that adds three things — is the pattern that
 * makes people distrust the basket and stop using the module at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import { hasVariants, primaryImage } from "@/lib/product-utils";
import type { Product } from "@/lib/types";
import { useRecommendations } from "./RecoProvider";

export default function BundleBox({ seedId }: { seedId: string }) {
  const { data } = useRecommendations({ surface: "product", seedId });
  const { addToCart } = useCart();

  const bundle = data.bundle;
  const all = useMemo(
    () => (bundle ? [bundle.seed, ...bundle.partners.map((p) => p.product)] : []),
    [bundle],
  );

  const [excluded, setExcluded] = useState<string[]>([]);
  const [added, setAdded] = useState(false);

  if (!bundle || all.length < 2) return null;

  const chosen = all.filter((product) => !excluded.includes(product.id));
  const total = chosen.reduce((sum, product) => sum + product.price, 0);

  function toggle(productId: string) {
    setExcluded((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  /**
   * Products with options are linked rather than added: silently picking a
   * size for somebody is how a bundle button becomes a returns problem.
   */
  const needsOptions = chosen.filter(hasVariants);
  const addable = chosen.filter((product) => !hasVariants(product));

  function addAll() {
    for (const product of addable) {
      addToCart({
        productId: product.id,
        qty: 1,
        snapshot: {
          name: product.name,
          price: product.price,
          icon: product.icon,
          slug: product.slug,
          store: product.store,
          image: primaryImage(product),
        },
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  return (
    <section className="card mt-8 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ocean-950">
          Frequently bought together
        </h2>
        <p className="text-xs text-slate-400">{bundle.basis}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {all.map((product, i) => (
          <div key={product.id} className="flex items-center gap-3">
            {i > 0 && <span className="text-xl font-light text-slate-300">+</span>}
            <BundleItem
              product={product}
              excluded={excluded.includes(product.id)}
              isSeed={i === 0}
              onToggle={() => toggle(product.id)}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-sand-200 pt-4">
        <div>
          <p className="text-xs text-slate-500">
            Total for {chosen.length} item{chosen.length === 1 ? "" : "s"}
          </p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">{money(total)}</p>
          {bundle.saving > 0 && (
            <p className="text-xs font-semibold text-emerald-600">
              Includes {money(bundle.saving)} off current promotions
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={addAll}
            disabled={addable.length === 0}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {added
              ? "✓ Added to basket"
              : `Add ${addable.length} to basket`}
          </button>
          {needsOptions.length > 0 && (
            <p className="max-w-xs text-right text-[11px] text-slate-400">
              {needsOptions.map((p) => p.name).join(", ")} need a size or colour choosing —
              open {needsOptions.length === 1 ? "it" : "them"} to pick.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function BundleItem({
  product,
  excluded,
  isSeed,
  onToggle,
}: {
  product: Product;
  excluded: boolean;
  isSeed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex w-32 flex-col gap-1.5 transition ${excluded ? "opacity-40" : ""}`}>
      <Link href={`/product/${product.slug}`} className="block">
        <ProductImage
          product={product}
          className="aspect-square w-full rounded-xl"
          iconClass="text-3xl"
        />
      </Link>
      <label className="flex cursor-pointer items-start gap-1.5">
        <input
          type="checkbox"
          checked={!excluded}
          onChange={onToggle}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ocean-700"
          aria-label={`Include ${product.name}`}
        />
        <span className="min-w-0">
          <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-700">
            {isSeed ? "This item" : product.name}
          </span>
          <span className="block text-[11px] font-bold text-ocean-900">
            {money(product.price)}
          </span>
        </span>
      </label>
    </div>
  );
}
