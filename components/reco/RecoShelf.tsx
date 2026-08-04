"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SHELF — a row of suggestions that can explain itself.
 * ─────────────────────────────────────────────────────────────────────────
 * Every card carries the sentence that earned it its slot, every shelf can
 * be unfolded to show how it was assembled, and every card can be rejected
 * outright. Those three controls are the product, not decoration around it.
 *
 * ── Why the shelves look different from each other ───────────────────────
 * A storefront that renders eight identical grey rows teaches shoppers to
 * scroll past all of them, and the fact that one row is their own history
 * and the next is what the whole marketplace is buying never lands. So each
 * TONE gets its own band of light, its own accent, its own icon treatment —
 * cool ocean for anything personal, warm mango for social proof, quiet sand
 * for the practical rows, coral for deliberate discovery.
 *
 * The colour is doing real work: it is the only thing that survives being
 * scrolled past at speed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import type { Recommendation, Shelf } from "@/lib/reco/types";
import { useReco } from "./RecoProvider";

interface Tone {
  /** Full-bleed band class from globals.css. */
  band: string;
  /** The icon tile beside the title. */
  glyph: string;
  /** Thin rule under the title. */
  rule: string;
  /** "Why these?" control. */
  control: string;
  /** Panel the explanation opens into. */
  panel: string;
  label: string;
  labelText: string;
}

const TONES: Record<Shelf["tone"], Tone> = {
  personal: {
    band: "band-personal",
    glyph: "bg-gradient-to-br from-ocean-600 to-ocean-800 text-white shadow-ocean-900/20",
    rule: "from-ocean-400/70",
    control: "border-ocean-200 text-ocean-700 hover:border-ocean-400 hover:bg-ocean-50",
    panel: "bg-white/70 ring-ocean-100 text-ocean-950/80",
    label: "bg-ocean-100/70 ring-ocean-200/70",
    labelText: "text-ocean-800",
  },
  social: {
    band: "band-social",
    glyph: "bg-gradient-to-br from-mango-400 to-mango-600 text-white shadow-mango-700/20",
    rule: "from-mango-400/70",
    control: "border-mango-200 text-mango-800 hover:border-mango-400 hover:bg-mango-50",
    panel: "bg-white/70 ring-mango-100 text-mango-900/80",
    label: "bg-mango-100/70 ring-mango-200/70",
    labelText: "text-mango-900",
  },
  utility: {
    band: "band-utility",
    glyph: "bg-gradient-to-br from-ocean-800 to-ocean-950 text-white shadow-ocean-950/20",
    rule: "from-sand-200",
    control: "border-sand-300 text-slate-600 hover:border-ocean-300 hover:bg-white",
    panel: "bg-white/70 ring-sand-200 text-slate-600",
    label: "bg-white/80 ring-sand-200",
    labelText: "text-slate-600",
  },
  discovery: {
    band: "band-discovery",
    glyph: "bg-gradient-to-br from-coral-500 to-coral-700 text-white shadow-coral-700/20",
    rule: "from-coral-500/60",
    control: "border-coral-100 text-coral-700 hover:border-coral-500 hover:bg-coral-100/50",
    panel: "bg-white/70 ring-coral-100 text-coral-700/90",
    label: "bg-coral-100/70 ring-coral-100",
    labelText: "text-coral-700",
  },
};

/** Visual anchors per reason kind. */
const REASON_ICONS: Record<string, string> = {
  viewed: "👁",
  saved: "♥",
  "in-cart": "🛒",
  "bought-together": "🔗",
  similar: "✦",
  completes: "✚",
  store: "🏪",
  brand: "🏷",
  rising: "📈",
  "price-fit": "💰",
  new: "✨",
  popular: "🔥",
  discover: "🧭",
  "price-drop": "💸",
};

const REASON_BADGE_STYLES: Record<string, string> = {
  viewed: "bg-slate-100 text-slate-600",
  saved: "bg-coral-100 text-coral-700",
  "in-cart": "bg-ocean-50 text-ocean-700",
  "bought-together": "bg-violet-50 text-violet-700",
  similar: "bg-ocean-50 text-ocean-700",
  completes: "bg-emerald-50 text-emerald-700",
  store: "bg-amber-50 text-amber-700",
  brand: "bg-amber-50 text-amber-700",
  rising: "bg-orange-50 text-orange-700",
  "price-fit": "bg-emerald-50 text-emerald-700",
  new: "bg-mango-50 text-mango-800",
  popular: "bg-rose-50 text-rose-700",
  discover: "bg-indigo-50 text-indigo-700",
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

  const tone = TONES[shelf.tone];

  /**
   * Does ANY card on this row carry an evidence chip?
   *
   * The chips are conditional — only products with genuinely low stock or
   * real weekly sales get one — so on a mixed row some captions were two
   * lines and some were one. Because the caption sits BELOW the tile, that
   * pushed the tiles themselves to different heights and the row looked
   * ragged.
   *
   * Deciding it per ROW rather than per card is what keeps both properties:
   * every tile on a row lines up, and a row where nothing has a chip
   * doesn't carry an empty reserved strip on every card.
   */
  const anyProof = items.some((item) => item.proof?.scarcity || item.proof?.momentum);

  function dismiss(productId: string) {
    setDismissed((current) => [...current, productId]);
    mute(productId);
  }

  /**
   * Every recommendation row sits on its own band of light.
   *
   * The alternative — one plain row after another — is what made this look
   * like an appendix. Because the shelves are interleaved with the
   * marketplace's own sections (which stay on the plain page background),
   * the result is a page that alternates: plain, tinted, plain, tinted.
   * That rhythm is what tells a shopper scrolling at speed that the row
   * they just passed was a different KIND of thing.
   *
   * `feature` marks the two or three rows that carry a page — they get more
   * air and a larger heading, so the tinting alone never has to do the work
   * of a hierarchy.
   */
  return (
    <section
      className={`band ${tone.band} band-edge mt-8 ${shelf.feature ? "py-11" : "py-8"}`}
    >
      <div className="mx-auto max-w-7xl px-4">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ring-1 ring-inset ${tone.label} ${tone.labelText}`}
            >
              {shelf.eyebrow}
            </span>

            <div className="mt-2 flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base shadow-lg ${tone.glyph}`}
                aria-hidden
              >
                {shelf.glyph}
              </span>
              <h2
                className={`font-display font-extrabold leading-tight tracking-tight text-ocean-950 ${
                  shelf.feature ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
                }`}
              >
                {shelf.title}
              </h2>
            </div>

            {shelf.subtitle && (
              <p className="mt-1.5 max-w-xl text-sm text-slate-500 sm:ml-[3.25rem]">
                {shelf.subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowWhy((open) => !open)}
              aria-expanded={showWhy}
              className={`rounded-full border bg-white/60 px-3 py-1.5 text-xs font-bold backdrop-blur transition ${tone.control}`}
            >
              {showWhy ? "Hide" : "Why these?"}
            </button>
            {shelf.href && (
              <Link
                href={shelf.href}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-ocean-700 transition hover:bg-white/70 hover:text-mango-600"
              >
                View all →
              </Link>
            )}
          </div>
        </div>

        {/* Accent rule — ties the row to its tone without shouting. */}
        <div
          className={`mt-4 h-px w-full bg-gradient-to-r to-transparent ${tone.rule}`}
        />

        {showWhy && (
          <p
            className={`mt-4 rounded-2xl p-4 text-sm leading-relaxed ring-1 backdrop-blur ${tone.panel}`}
          >
            {shelf.why}
          </p>
        )}

        {/* ── Items ──────────────────────────────────────────────── */}
        <div className="mt-5">
          {shelf.layout === "grid" ? (
            <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <RecoCard
                  key={item.product.id}
                  item={item}
                  reserveProof={anyProof}
                  onDismiss={dismiss}
                />
              ))}
            </div>
          ) : (
            <div className="flex snap-x items-stretch gap-4 overflow-x-auto pb-2 rail-scroll">
              {items.map((item) => (
                <div key={item.product.id} className="flex w-44 shrink-0 snap-start sm:w-52">
                  <RecoCard item={item} reserveProof={anyProof} onDismiss={dismiss} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Shorten a reason to fit the badge. The full sentence stays available via
 * `title`, so nothing is actually hidden — it is just not shouted.
 */
function shortReason(text: string): string {
  if (text.length <= 35) return text;

  const words = text.split(" ");
  let result = "";
  for (const word of words) {
    if ((result + " " + word).trim().length > 32) break;
    result = (result + " " + word).trim();
  }
  return result ? `${result}…` : `${text.slice(0, 32)}…`;
}

/**
 * One suggestion. The tile itself is the site's standard product card — a
 * recommendation should look like the rest of the shop, not like an advert
 * bolted onto it. Everything recommendation-specific lives underneath.
 */
function RecoCard({
  item,
  reserveProof,
  onDismiss,
}: {
  item: Recommendation;
  /** True when some card on this row has an evidence chip. See anyProof. */
  reserveProof: boolean;
  onDismiss: (productId: string) => void;
}) {
  const proof = item.proof;
  const icon = REASON_ICONS[item.reason.kind] ?? "✦";
  const badgeStyle = REASON_BADGE_STYLES[item.reason.kind] ?? "bg-slate-100 text-slate-600";

  return (
    /*
     * `flex-1` on the tile is what makes a row of these line up: the
     * caption below is a fixed-height footer, and the product tile takes
     * whatever is left. Without it the tile sat at its natural height and
     * every card ended somewhere different.
     */
    <div className="group/reco relative flex h-full w-full flex-col">
      <div className="flex flex-1 flex-col">
        <ProductCard product={item.product} />
      </div>

      {/* ── Evidence — only ever what is genuinely true ───────────── */}
      {reserveProof && (
        <div className="mt-1.5 flex min-h-[1.125rem] flex-wrap items-center gap-1">
          {proof?.scarcity && (
            <span className="inline-flex items-center gap-1 rounded-md bg-coral-100 px-2 py-0.5 text-[10px] font-semibold text-coral-700 ring-1 ring-inset ring-coral-500/20">
              🔴 {proof.scarcity}
            </span>
          )}
          {proof?.momentum && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ocean-50 px-2 py-0.5 text-[10px] font-semibold text-ocean-700 ring-1 ring-inset ring-ocean-200/60">
              📈 {proof.momentum}
            </span>
          )}
        </div>
      )}

      {/* ── The reason it is here ─────────────────────────────────── */}
      <div className="mt-1.5 flex min-h-[1.375rem] items-center gap-1">
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ring-black/[0.04] ${badgeStyle}`}
          title={item.reason.text}
        >
          <span className="shrink-0" aria-hidden>
            {icon}
          </span>
          {item.exploratory && (
            <span className="shrink-0 font-extrabold uppercase tracking-wider opacity-70">
              New to you ·
            </span>
          )}
          <span className="truncate">{shortReason(item.reason.text)}</span>
        </span>

        <button
          onClick={() => onDismiss(item.product.id)}
          aria-label={`Not interested in ${item.product.name}`}
          title="Not interested — stop showing me this"
          className="ml-auto shrink-0 rounded-full p-0.5 text-[10px] text-slate-300 opacity-0 transition hover:bg-white hover:text-coral-500 focus:opacity-100 group-hover/reco:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
