import ProductImage from "@/components/ProductImage";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SHOWCASE — the picture side of the hero's first slide.
 * ─────────────────────────────────────────────────────────────────────────
 * The brand slide used to be a gradient and a headline. On a computer four
 * product cards floated beside it; on a phone (most shoppers) they were
 * hidden, so the first thing anyone saw was a large empty teal box.
 *
 * Now it is a wall of the catalogue's own photographs: five tilted columns
 * of product tiles drifting slowly past each other, fading into the scene
 * behind the headline. It says "a whole market" before a word is read, it
 * is never stock photography, and it changes as the shops add stock.
 *
 *   • Phones: the wall fills the top of the frame and fades out above the
 *     copy, which keeps the bottom where the thumb is.
 *   • Computers: the wall fills the right half and fades out to the left.
 *
 * Small tiles (sizes ≈ 160px), so the whole wall weighs less than one
 * banner photograph. Each column is its products three times over, which is what
 * lets the drift loop without a seam; the repeats are the same files, so
 * they cost no extra download. Purely decorative: hidden from screen
 * readers and not tappable — the button and the dots are the targets.
 * Motion stops for prefers-reduced-motion (globals.css).
 * ─────────────────────────────────────────────────────────────────────────
 */

const COLUMNS = 5;

export default function HeroShowcase({ products }: { products: Product[] }) {
  if (products.length < COLUMNS) return null;

  const columns = Array.from({ length: COLUMNS }, (_, c) => products.filter((_, i) => i % COLUMNS === c));

  return (
    <div
      aria-hidden
      className="hero-wall pointer-events-none absolute inset-x-0 top-0 h-[54%] overflow-hidden sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[58%] lg:w-[54%]"
    >
      <div className="absolute left-1/2 top-1/2 flex h-[220%] -translate-x-1/2 -translate-y-1/2 rotate-[-10deg] gap-2.5 sm:gap-4">
        {columns.map((column, c) => (
          <div key={c} className={`w-24 shrink-0 sm:w-32 lg:w-36 ${c % 2 ? "pt-14 sm:pt-20" : ""}`}>
            <div className={`hero-drift flex flex-col gap-2.5 pb-2.5 sm:gap-4 sm:pb-4 ${c % 2 ? "hero-drift-reverse" : ""}`}>
              {[...column, ...column, ...column].map((product, i) => (
                <Tile key={`${product.id}-${i}`} product={product} priceTag={i % 2 === c % 2} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ product, priceTag }: { product: Product; priceTag: boolean }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white shadow-xl shadow-black/40 ring-1 ring-white/20 sm:rounded-2xl">
      <ProductImage product={product} sizes="(max-width: 640px) 96px, 144px" iconClass="text-4xl" className="h-full w-full" />
      {priceTag && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ocean-950/85 px-2 py-0.5 font-display text-[10px] font-bold text-white backdrop-blur-sm sm:bottom-2 sm:left-2 sm:text-xs">
          {money(product.price)}
        </span>
      )}
    </div>
  );
}
