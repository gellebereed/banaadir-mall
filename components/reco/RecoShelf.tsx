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

/**
 * The badge label per reason kind.
 *
 * Short on purpose. The badge sits over the photo now, where there is room
 * for two or three words and no more — and a two-word label is read at a
 * glance while scrolling, which a truncated sentence like "Because you
 * viewed AC&Co Linen S…" never was. The full sentence is still there, as
 * the badge's tooltip and in the card's own footer, so nothing is lost.
 */
const REASON_LABELS: Record<string, string> = {
  viewed: "You viewed",
  saved: "You saved",
  "in-cart": "In your cart",
  "bought-together": "Often together",
  similar: "Similar",
  completes: "Goes with",
  store: "Same shop",
  brand: "Same brand",
  rising: "Trending",
  "price-fit": "Your budget",
  new: "Just in",
  popular: "Popular",
  discover: "Discover",
  "price-drop": "Price drop",
};

/*
 * Solid, not tinted.
 *
 * These now sit ON the photograph rather than on the page background, and a
 * pale wash over an unpredictable image is unreadable — a `bg-slate-100`
 * pill on a light-grey studio shot disappears entirely. Every one of these
 * is opaque with white text, so the label holds against any photo.
 */
const REASON_BADGE_STYLES: Record<string, string> = {
  viewed: "bg-slate-700/95 text-white",
  saved: "bg-coral-600/95 text-white",
  "in-cart": "bg-ocean-700/95 text-white",
  "bought-together": "bg-violet-700/95 text-white",
  similar: "bg-ocean-700/95 text-white",
  completes: "bg-emerald-700/95 text-white",
  store: "bg-amber-700/95 text-white",
  brand: "bg-amber-700/95 text-white",
  rising: "bg-orange-600/95 text-white",
  "price-fit": "bg-emerald-700/95 text-white",
  new: "bg-ocean-950/95 text-white",
  popular: "bg-rose-600/95 text-white",
  discover: "bg-indigo-700/95 text-white",
  "price-drop": "bg-emerald-600/95 text-white",
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

  /*
   * There used to be an `anyProof` flag here, reserving a caption strip on
   * every card in a row whenever ONE of them had an evidence chip — the
   * only way to stop a mixed row going ragged when the captions lived
   * outside the tiles. The captions are inside the cards now, and every
   * card's footer always carries something, so the row lines up by
   * construction and the flag has nothing left to do.
   */

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
                <RecoCard key={item.product.id} item={item} onDismiss={dismiss} />
              ))}
            </div>
          ) : (
            <div className="flex snap-x items-stretch gap-4 overflow-x-auto pb-2 rail-scroll">
              {items.map((item) => (
                <div key={item.product.id} className="flex w-44 shrink-0 snap-start sm:w-52">
                  <RecoCard item={item} onDismiss={dismiss} />
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
 * One suggestion — a single card, with nothing outside it.
 *
 * ── What changed and why ─────────────────────────────────────────────────
 * The reason pill and the evidence chips used to be siblings of the tile,
 * stacked underneath it on the page background. The card ended at the
 * price and two more lines floated below, so a row read as tiles with
 * debris under them, and the taller card in a row dragged the others out
 * of alignment.
 *
 * Now the tile IS the card and both pieces live inside it:
 *
 *   · the reason becomes a short label over the photo — read at a glance
 *     while scrolling, where a truncated sentence never was
 *   · the evidence becomes the card's own footer strip, behind a rule
 *
 * Every card on a row is therefore the same object, and the row lines up
 * because the cards line up, not because a caption was padded to match.
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
  const badgeStyle = REASON_BADGE_STYLES[item.reason.kind] ?? "bg-slate-700/95 text-white";
  const label = item.exploratory
    ? "New to you"
    : (REASON_LABELS[item.reason.kind] ?? "Picked for you");

  return (
    <div className="group/reco h-full w-full">
      <ProductCard
        product={item.product}
        cornerBadge={
          <span
            className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide shadow-sm backdrop-blur-[2px] ${badgeStyle}`}
            title={item.reason.text}
          >
            <span className="shrink-0" aria-hidden>
              {icon}
            </span>
            <span className="truncate">{label}</span>
          </span>
        }
        footer={
          <div className="flex min-h-[1.25rem] items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] leading-tight">
              {/*
                The strongest true thing about this card, in priority order:
                scarcity, then momentum, then the reason itself. Something
                is always shown, so the strip is never an empty band — and
                nothing here is ever invented. See lib/reco: `proof` is only
                set when the numbers genuinely support it.
              */}
              {proof?.scarcity ? (
                <span className="font-semibold text-coral-700">
                  <span className="mr-1" aria-hidden>
                    ●
                  </span>
                  {proof.scarcity}
                </span>
              ) : proof?.momentum ? (
                <span className="font-semibold text-ocean-700">
                  <span className="mr-1" aria-hidden>
                    ▲
                  </span>
                  {proof.momentum}
                </span>
              ) : (
                <span className="text-slate-400" title={item.reason.text}>
                  {shortReason(item.reason.text)}
                </span>
              )}
            </span>

            <button
              onClick={() => onDismiss(item.product.id)}
              aria-label={`Not interested in ${item.product.name}`}
              title="Not interested — stop showing me this"
              className="-mr-1 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] leading-none text-slate-300 transition hover:bg-white hover:text-coral-500 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/reco:opacity-100"
            >
              ✕
            </button>
          </div>
        }
      />
    </div>
  );
}
