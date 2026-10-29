import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { discountPct, money } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE BRAND SLIDE'S PICTURE SIDE — real products in a shop window.
 * ─────────────────────────────────────────────────────────────────────────
 * The first slide used to be a headline on an empty dark gradient on a
 * phone (the floating product cards were `lg` only), which read as an
 * unfinished page rather than a shop. A marketplace's best picture is its
 * own stock, so the slide now opens with three real products at real
 * prices, fanned like cards in a hand on a phone and set in a lit arched
 * shop window on a computer.
 *
 * No photograph of a building behind it: a stock "mall interior" would be
 * someone else's mall, and a full-bleed photo is the heaviest thing a phone
 * could download first. The arcade and the lighting are CSS (`.scene-arcade`
 * in globals.css), so the slide still costs nothing before the product
 * photos — which the next slide's shelf would have loaded anyway.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function HeroBrandArt({
  products,
  storeNames,
  badges,
}: {
  /** Up to four, one per shop, photo first. The first is the centre card. */
  products: Product[];
  storeNames: Map<string, string>;
  /** The two floating notes beside the window: delivery, then payment. */
  badges: [string, string];
}) {
  if (products.length === 0) return null;
  const [centre, left = centre, right = centre] = products;
  const store = (p: Product) => storeNames.get(p.store) ?? p.store.replace(/-/g, " ");

  return (
    <>
      {/* ── Phones and tablets: a fan of three ───────────────────────── */}
      <div className="relative mx-auto flex h-[8.25rem] max-w-[22rem] items-end justify-center sm:h-40 sm:max-w-sm lg:hidden">
        <FanCard product={left} className="-mr-5 w-[29%] -rotate-[8deg] translate-y-1.5" />
        <FanCard product={centre} className="z-10 w-[33%] -translate-y-1" lead />
        <FanCard product={right} className="-ml-5 w-[29%] rotate-[8deg] translate-y-1.5" priceRight />
      </div>

      {/* ── Computers: an arched shop window ─────────────────────────── */}
      <div className="relative ml-auto hidden h-[460px] w-full max-w-[34rem] lg:block">
        {/* The window: an arch with a lit edge and a warm glow inside. */}
        <div className="absolute inset-x-12 bottom-6 top-2 rounded-t-[12rem] bg-gradient-to-b from-white/[0.10] to-white/[0.02] ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" />
        <div className="absolute inset-x-24 bottom-6 top-16 rounded-t-[10rem] bg-[radial-gradient(70%_60%_at_50%_30%,rgba(255,183,77,0.28),transparent_70%)]" />
        {/* The shelf the products stand on. */}
        <div className="absolute inset-x-4 bottom-5 h-3 rounded-full bg-black/35 blur-md" />
        <div className="absolute inset-x-8 bottom-6 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <WindowCard
          product={left}
          store={store(left)}
          className="absolute bottom-12 left-0 w-44 -rotate-6"
        />
        <WindowCard
          product={right}
          store={store(right)}
          className="absolute bottom-12 right-0 w-44 rotate-6"
        />
        <WindowCard
          product={centre}
          store={store(centre)}
          className="absolute bottom-8 left-1/2 z-10 w-56 -translate-x-1/2"
          lead
        />

        <FloatingNote className="left-0 top-14" delay="0s">
          <span className="text-base">🚚</span> {badges[0]}
        </FloatingNote>
        <FloatingNote className="right-0 top-3" delay="1.4s">
          <span className="text-base">📲</span> {badges[1]}
        </FloatingNote>
      </div>
    </>
  );
}

function FanCard({
  product,
  className,
  lead,
  priceRight,
}: {
  product: Product;
  className: string;
  lead?: boolean;
  /** The right-hand card's price sits on its free edge, clear of the centre card. */
  priceRight?: boolean;
}) {
  const off = product.compareAt && product.compareAt > product.price ? discountPct(product.price, product.compareAt) : 0;
  return (
    <Link
      href={`/product/${product.slug}`}
      className={`relative block shrink-0 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_12px_30px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/60 ${className}`}
    >
      <ProductImage
        product={product}
        priority={lead}
        iconClass="text-4xl sm:text-5xl"
        sizes="(max-width: 639px) 34vw, 160px"
        className="aspect-[4/5] w-full rounded-xl"
      />
      <span className={`absolute bottom-2 ${priceRight ? "right-2" : "left-2"} rounded-full bg-white/95 px-2 py-0.5 font-display text-[11px] font-extrabold text-ocean-950 shadow-sm sm:text-xs`}>
        {money(product.price)}
      </span>
      {off > 0 && (
        <span className={`absolute top-2 ${priceRight ? "right-2" : "left-2"} rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm`}>
          −{off}%
        </span>
      )}
    </Link>
  );
}

function WindowCard({
  product,
  store,
  className,
  lead,
}: {
  product: Product;
  store: string;
  className: string;
  lead?: boolean;
}) {
  const off = product.compareAt && product.compareAt > product.price ? discountPct(product.price, product.compareAt) : 0;
  return (
    <Link
      href={`/product/${product.slug}`}
      className={`group block overflow-hidden rounded-3xl bg-white p-1.5 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.65)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 ${className}`}
    >
      <div className="relative">
        <ProductImage
          product={product}
          priority={lead}
          iconClass={lead ? "text-7xl" : "text-5xl"}
          sizes={lead ? "224px" : "176px"}
          className="aspect-[4/5] w-full rounded-[1.1rem]"
        />
        {off > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-coral-500 px-2 py-0.5 text-xs font-extrabold text-white shadow-sm">
            −{off}%
          </span>
        )}
      </div>
      <div className="px-2 pb-1.5 pt-2">
        <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-ocean-600">{store}</p>
        <p className="truncate text-sm font-semibold text-slate-800 group-hover:text-ocean-700">{product.name}</p>
        <p className="font-display text-base font-extrabold text-ocean-950">
          {money(product.price)}
          {off > 0 && product.compareAt && (
            <span className="ml-1.5 font-sans text-xs font-medium text-slate-400 line-through">{money(product.compareAt)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

function FloatingNote({ className, delay, children }: { className: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      className={`animate-float absolute z-20 flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-xs font-semibold text-white shadow-lg ring-1 ring-white/30 backdrop-blur-md ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}
