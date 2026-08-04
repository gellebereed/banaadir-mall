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

/** Icon glyphs for each reason kind — concise visual anchors. */
const REASON_ICONS: Record<string, string> = {
  "viewed": "👁",
  "saved": "♥",
  "in-cart": "🛒",
  "bought-together": "🔗",
  "similar": "✦",
  "completes": "✚",
  "store": "🏪",
  "brand": "🏷",
  "rising": "📈",
  "price-fit": "💰",
  "new": "✨",
  "popular": "🔥",
  "discover": "🧭",
  "price-drop": "💸",
};

/** Badge colour per reason kind — subtle, distinct hues. */
const REASON_BADGE_STYLES: Record<string, string> = {
  "viewed": "bg-slate-100 text-slate-600",
  "saved": "bg-coral-50 text-coral-700",
  "in-cart": "bg-ocean-50 text-ocean-700",
  "bought-together": "bg-violet-50 text-violet-700",
  "similar": "bg-ocean-50 text-ocean-700",
  "completes": "bg-emerald-50 text-emerald-700",
  "store": "bg-amber-50 text-amber-700",
  "brand": "bg-amber-50 text-amber-700",
  "rising": "bg-orange-50 text-orange-700",
  "price-fit": "bg-emerald-50 text-emerald-700",
  "new": "bg-mango-50 text-mango-800",
  "popular": "bg-rose-50 text-rose-700",
  "discover": "bg-indigo-50 text-indigo-700",
  "price-drop": "bg-emerald-50 text-emerald-700",
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
            <RecoCard key={item.product.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      ) : (
        <div className="flex snap-x items-stretch gap-4 overflow-x-auto pb-2 rail-scroll">
          {items.map((item) => (
            <div key={item.product.id} className="w-44 shrink-0 snap-start sm:w-52">
              <RecoCard item={item} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Shorten long reason text to fit a compact badge. The full text is still
 * available on hover via `title`. Aim for ~30 chars max on the badge.
 */
function shortReason(text: string): string {
  // Already short enough
  if (text.length <= 35) return text;

  // Truncate at a reasonable word boundary
  const words = text.split(" ");
  let result = "";
  for (const word of words) {
    if ((result + " " + word).trim().length > 32) break;
    result = (result + " " + word).trim();
  }
  return result || text.slice(0, 32) + "…";
}

/**
 * One suggestion. The product tile itself is the site's standard card — a
 * recommendation should look like the rest of the shop, not like an advert
 * bolted onto it. The reason is shown as a compact tooltip badge that
 * appears on hover, keeping the grid clean and professional.
 */
function RecoCard({
  item,
  onDismiss,
}: {
  item: Recommendation;
  onDismiss: (productId: string) => void;
}) {
  const proof = item.proof;
  const icon = REASON_ICONS[item.reason.kind] ?? "✦";
  const badgeStyle = REASON_BADGE_STYLES[item.reason.kind] ?? "bg-slate-100 text-slate-600";

  return (
    <div className="group/reco relative flex h-full flex-col">
      <ProductCard product={item.product} />

      {/* ── Proof chips — scarcity and momentum only when real ──────── */}
      {(proof?.scarcity || proof?.momentum) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {proof.scarcity && (
            <span className="inline-flex items-center gap-1 rounded-md bg-coral-50 px-2 py-0.5 text-[10px] font-semibold text-coral-700 ring-1 ring-inset ring-coral-200/60">
              🔴 {proof.scarcity}
            </span>
          )}
          {proof.momentum && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ocean-50 px-2 py-0.5 text-[10px] font-semibold text-ocean-700 ring-1 ring-inset ring-ocean-200/60">
              📈 {proof.momentum}
            </span>
          )}
        </div>
      )}

      {/* ── Reason badge — compact, clean, hoverable for full text ── */}
      <div className="mt-1.5 flex items-center gap-1">
        <span
          className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ring-black/[0.04] ${badgeStyle}`}
          title={item.reason.text}
        >
          <span className="shrink-0 text-[10px]" aria-hidden>{icon}</span>
          {item.exploratory && (
            <span className="shrink-0 font-extrabold uppercase tracking-wider opacity-70">
              New to you ·
            </span>
          )}
          <span className="truncate">{shortReason(item.reason.text)}</span>
        </span>

        {/* Dismiss — only visible on hover for a tidy grid */}
        <button
          onClick={() => onDismiss(item.product.id)}
          aria-label={`Not interested in ${item.product.name}`}
          title="Not interested"
          className="ml-auto shrink-0 rounded-full p-0.5 text-[10px] text-slate-300 opacity-0 transition hover:bg-sand-100 hover:text-coral-500 focus:opacity-100 group-hover/reco:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
