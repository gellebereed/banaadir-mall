"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SHELF — a row of suggestions that can explain itself.
 * ─────────────────────────────────────────────────────────────────────────
 * Every card carries the sentence that earned it its slot, every shelf can
 * be unfolded to show how it was assembled, and every card can be rejected
 * outright. Those three controls are the product, not decoration around it:
 *
 *   A REASON turns a suggestion into an argument. "Because you looked at
 *   the Rose Bamboo Duvet Set" can be agreed with or dismissed on sight,
 *   which is what makes a shopper willing to look at the next one.
 *
 *   "WHY THESE?" is the audit trail. It is written plainly enough that a
 *   sceptical shopper reading it comes away trusting the shelf MORE, which
 *   only works because the description is true.
 *
 *   "NOT INTERESTED" is the release valve. Without it, one bad run of
 *   suggestions is permanent and the shopper's only recourse is to stop
 *   reading the shelves. The card disappears immediately and the model is
 *   told — anything less and the control is theatre.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import type { Recommendation, Shelf } from "@/lib/reco/types";
import { useReco } from "./RecoProvider";

const TONE_STYLES: Record<Shelf["tone"], { chip: string; glyph: string }> = {
  personal: { chip: "bg-ocean-50 text-ocean-800 ring-ocean-100", glyph: "bg-ocean-700 text-white" },
  social: { chip: "bg-mango-50 text-mango-800 ring-mango-100", glyph: "bg-mango-500 text-ocean-950" },
  utility: { chip: "bg-sand-100 text-ocean-900 ring-sand-200", glyph: "bg-ocean-900 text-white" },
  discovery: { chip: "bg-coral-100 text-coral-700 ring-coral-100", glyph: "bg-coral-500 text-white" },
};

export default function RecoShelf({ shelf }: { shelf: Shelf }) {
  const { mute } = useReco();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showWhy, setShowWhy] = useState(false);

  const items = shelf.items.filter((item) => !dismissed.includes(item.product.id));

  // The server already enforced a per-shelf minimum. This only catches a
  // shopper dismissing their way through a whole row.
  if (items.length === 0) return null;

  const tone = TONE_STYLES[shelf.tone];

  function dismiss(productId: string) {
    setDismissed((current) => [...current, productId]);
    mute(productId);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pt-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tone.glyph}`}
              aria-hidden
            >
              {shelf.glyph}
            </span>
            <h2 className="font-display text-xl font-bold text-ocean-950 sm:text-2xl">
              {shelf.title}
            </h2>
          </div>
          {shelf.subtitle && (
            <p className="mt-1 text-sm text-slate-500 sm:ml-[2.625rem]">{shelf.subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => setShowWhy((open) => !open)}
            aria-expanded={showWhy}
            className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-ocean-300 hover:text-ocean-700"
          >
            {showWhy ? "Hide" : "Why these?"}
          </button>
          {shelf.href && (
            <Link
              href={shelf.href}
              className="text-sm font-semibold text-ocean-700 hover:text-mango-600"
            >
              View all →
            </Link>
          )}
        </div>
      </div>

      {showWhy && (
        <p className="mb-5 rounded-2xl bg-sand-50 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-sand-200">
          {shelf.why}
        </p>
      )}

      {shelf.layout === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <RecoCard key={item.product.id} item={item} tone={tone.chip} onDismiss={dismiss} />
          ))}
        </div>
      ) : (
        <div className="flex snap-x items-stretch gap-4 overflow-x-auto pb-2 rail-scroll">
          {items.map((item) => (
            <div key={item.product.id} className="w-44 shrink-0 snap-start sm:w-52">
              <RecoCard item={item} tone={tone.chip} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One suggestion. The product tile itself is the site's standard card — a
 * recommendation should look like the rest of the shop, not like an advert
 * bolted onto it. Everything specific to recommendations lives in the
 * caption beneath.
 */
function RecoCard({
  item,
  tone,
  onDismiss,
}: {
  item: Recommendation;
  tone: string;
  onDismiss: (productId: string) => void;
}) {
  const proof = item.proof;

  return (
    <div className="group/reco flex h-full flex-col">
      <ProductCard product={item.product} />

      {/* Evidence. At most two chips — a card wearing five badges reads as
          a sales pitch, and the shopper stops seeing any of them. */}
      {(proof?.scarcity || proof?.momentum) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {proof.scarcity && (
            <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[10px] font-bold text-coral-700">
              {proof.scarcity}
            </span>
          )}
          {proof.momentum && (
            <span className="rounded-full bg-ocean-50 px-2 py-0.5 text-[10px] font-bold text-ocean-800">
              {proof.momentum}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-start gap-1.5">
        <p
          className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-[11px] font-medium leading-snug ring-1 ${tone}`}
        >
          {item.exploratory && (
            <span className="font-extrabold uppercase tracking-wide opacity-60">
              New to you{" · "}
            </span>
          )}
          {item.reason.text}
        </p>
        <button
          onClick={() => onDismiss(item.product.id)}
          aria-label={`Not interested in ${item.product.name}`}
          title="Not interested — stop showing me this"
          className="mt-0.5 shrink-0 rounded-full p-1 text-xs text-slate-300 opacity-0 transition hover:bg-sand-100 hover:text-coral-500 focus:opacity-100 group-hover/reco:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
