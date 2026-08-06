"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart-context";
import { compact, discountPct, money } from "@/lib/format";
import {
  colorOptions,
  displayPrice,
  hasPriceRange,
  hasVariants,
  primaryImage,
  totalStock,
  variantSizes,
} from "@/lib/product-utils";
import type { Product } from "@/lib/types";
import ProductImage from "./ProductImage";
import Rating from "./Rating";

const BADGE_STYLES: Record<string, string> = {
  Sale: "bg-coral-500 text-white",
  Bestseller: "bg-ocean-800 text-white",
  New: "bg-mango-400 text-ocean-950",
};

/** How many colour swatches fit on a card before we collapse into "+N". */
const MAX_SWATCHES = 4;

/**
 * The product tile used in every grid and rail across the site.
 *
 * When a product has variants the card shows colour swatches (hovering one
 * previews that colour's photo) and a size summary, so shoppers can tell
 * at a glance what options exist without opening the product — the pattern
 * used by Karaca, Trendyol and other large retailers.
 *
 * ── The two slots ────────────────────────────────────────────────────────
 * `cornerBadge` and `footer` exist so a caller can add its own content
 * WITHOUT it ending up outside the card. Recommendation rows used to stack
 * their reason pill and evidence chips underneath the tile, as loose text
 * on the page background — the card stopped at the price and then two more
 * lines floated below it, so a row read as tiles with debris under them
 * rather than as a row of cards.
 *
 * Both slots default to nothing, so every existing use renders exactly as
 * it did before.
 */
export default function ProductCard({
  product,
  cornerBadge,
  footer,
}: {
  product: Product;
  /** Sits top-left over the photo, above the product's own badge. */
  cornerBadge?: ReactNode;
  /** A strip inside the card, below the price, behind a hairline rule. */
  footer?: ReactNode;
}) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const wished = isWishlisted(product.id);

  // With variants the card shows the cheapest option ("from $X").
  const price = displayPrice(product);
  const showFrom = hasPriceRange(product);
  const soldOut = totalStock(product) === 0;

  const colors = colorOptions(product);
  const sizes = variantSizes(product);
  const withVariants = hasVariants(product);

  /** Colour currently previewed by hovering/tapping a swatch. */
  const [previewImage, setPreviewImage] = useState<string | undefined>();
  const [hovering, setHovering] = useState(false);

  /*
   * ── Hover to browse the photos ───────────────────────────────────────
   * Every large catalogue does this, and for a good reason: the second
   * photo answers most of what the first one leaves out — the back of a
   * shirt, the inside of a pan, the scale of a rug — and it answers it
   * without costing a page load. So pointing at a card cycles its photos.
   *
   * It is deliberately hover-only. On touch there is no hover, and
   * auto-advancing under a thumb would fight the shopper for control of
   * the card; those devices simply see the first photo, which is exactly
   * what they see today.
   *
   * A hovered colour swatch still wins — that is a specific request about
   * a specific colour, and the slideshow must not talk over it.
   */
  const [slideIndex, setSlideIndex] = useState(0);
  const photos = product.images ?? [];
  const canSlide = photos.length > 1;

  /*
   * ── Pace ─────────────────────────────────────────────────────────────
   * 900ms was a flicker, not a slideshow: a ten-photo product cycled its
   * whole set in nine seconds and no single frame was on screen long
   * enough to actually look at. Moving the mouse across a grid set several
   * cards flickering at once.
   *
   * 1800ms is roughly how long it takes to register what a photo shows.
   * The extra HOLD on the first frame matters just as much — passing the
   * pointer over a card on the way somewhere else should not start a
   * slideshow at all, so nothing moves until you have rested on it.
   */
  useEffect(() => {
    if (!canSlide || !hovering || previewImage) return;

    let timer: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      setSlideIndex((i) => (i + 1) % photos.length);
      timer = setInterval(() => setSlideIndex((i) => (i + 1) % photos.length), 1800);
    }, 700);

    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [canSlide, hovering, previewImage, photos.length]);

  const mainImage = previewImage ?? photos[slideIndex] ?? primaryImage(product);

  return (
    <div
      className="group card relative flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ocean-900/10"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        // Back to the cover shot, so a grid never keeps a wall of cards
        // each frozen on a different arbitrary photo.
        setSlideIndex(0);
      }}
    >
      <Link href={`/product/${product.slug}`} className="block">
        {mainImage ? (
          <div className="relative aspect-square w-full overflow-hidden bg-sand-100">
            <Image
              src={mainImage}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-opacity duration-300"
            />

            {/* Which photo of how many — only while it is actually moving. */}
            {canSlide && hovering && !previewImage && (
              <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {photos.slice(0, 6).map((photo, i) => (
                  <span
                    key={photo}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slideIndex ? "w-4 bg-ocean-800" : "w-1.5 bg-ocean-800/30"
                    }`}
                  />
                ))}
              </span>
            )}
          </div>
        ) : (
          <ProductImage product={product} className="aspect-square w-full" />
        )}
      </Link>

      {/*
        Badges stack in one column so a caller's badge and the product's own
        can never land on top of each other.

        When a cornerBadge IS supplied it says something specific about this
        shopper ("Just in", "Price drop"), which outranks a generic "New" or
        "Bestseller" — so those are stood down. A Sale badge survives,
        because a discount percentage is money and outranks everything.
      */}
      {(cornerBadge || product.badge) && (
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-4rem)] flex-col items-start gap-1.5">
          {cornerBadge}
          {product.badge && (!cornerBadge || product.badge === "Sale") && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${BADGE_STYLES[product.badge]}`}
            >
              {product.badge === "Sale" && product.compareAt
                ? `-${discountPct(price, product.compareAt)}%`
                : product.badge}
            </span>
          )}
        </div>
      )}

      <button
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        onClick={() =>
          toggleWishlist(product.id, {
            name: product.name,
            icon: product.icon,
            images: mainImage ? [mainImage] : product.images,
          })
        }
        className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-md transition active:scale-90 ${
          wished ? "bg-coral-500 text-white" : "bg-white/90 text-slate-500 hover:text-coral-500"
        }`}
      >
        {wished ? "♥" : "♡"}
      </button>

      <div className="flex flex-1 flex-col p-3.5">
        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-slate-800 hover:text-ocean-700"
        >
          {product.name}
        </Link>
        
        <div className="mt-1">
          <Rating value={product.rating} />
        </div>

        {/* Variant options at a glance — reserved slot for uniform height */}
        <div className="mt-1.5 flex min-h-[1.5rem] items-center gap-1.5">
          {colors.length > 0 && (
            <>
              {colors.slice(0, MAX_SWATCHES).map((c) => (
                <button
                  key={c.color}
                  title={`${c.color}${c.inStock ? "" : " — out of stock"}`}
                  aria-label={`Preview ${c.color}`}
                  onMouseEnter={() => c.image && setPreviewImage(c.image)}
                  onFocus={() => c.image && setPreviewImage(c.image)}
                  onMouseLeave={() => setPreviewImage(undefined)}
                  onBlur={() => setPreviewImage(undefined)}
                  onClick={() => c.image && setPreviewImage(c.image)}
                  className={`h-4 w-4 rounded-full border transition hover:scale-125 ${
                    c.inStock ? "border-slate-300" : "border-slate-200 opacity-40"
                  }`}
                  style={{ background: c.swatch ?? "#e2e8f0" }}
                />
              ))}
              {colors.length > MAX_SWATCHES && (
                <span className="text-[10px] font-bold text-slate-400">
                  +{colors.length - MAX_SWATCHES}
                </span>
              )}
              {sizes.length > 0 && (
                <span className="ml-auto text-[10px] font-medium text-slate-400">
                  {sizes.length} size{sizes.length === 1 ? "" : "s"}
                </span>
              )}
            </>
          )}
          {withVariants && colors.length === 0 && sizes.length > 0 && (
            <p className="text-[10px] font-medium text-slate-400">
              {sizes.length} size{sizes.length === 1 ? "" : "s"} available
            </p>
          )}
        </div>

        {/* Hairline above the price — separates "what it is" from "what it
            costs", and gives the row of cards a shared horizontal line to
            settle on instead of ending at whatever height the title left. */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-sand-100 pt-2.5">
          <div>
            <div className="flex items-baseline gap-1.5">
              {showFrom && <span className="text-[11px] text-slate-400">from</span>}
              <span className="font-display text-lg font-bold text-ocean-950">
                {money(price)}
              </span>
              {product.compareAt && product.compareAt > price && (
                <span className="text-xs text-slate-400 line-through">
                  {money(product.compareAt)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {soldOut ? (
                <span className="font-semibold text-coral-600">Out of stock</span>
              ) : (
                `${compact(product.sold)} sold`
              )}
            </p>
          </div>

          {/* Products with options go to the page to choose them first. */}
          {withVariants ? (
            <Link
              href={`/product/${product.slug}`}
              aria-label={`Choose options for ${product.name}`}
              className="flex h-9 items-center rounded-full bg-ocean-700 px-3 text-[11px] font-bold text-white shadow-md transition hover:bg-mango-500"
            >
              Options
            </Link>
          ) : (
            <button
              aria-label={`Add ${product.name} to cart`}
              disabled={soldOut}
              onClick={() =>
                addToCart({
                  productId: product.id,
                  qty: 1,
                  snapshot: {
                    name: product.name,
                    price,
                    icon: product.icon,
                    slug: product.slug,
                    // Which shop sells it — see CartItem.snapshot.store.
                    store: product.store,
                    image: mainImage,
                  },
                })
              }
              className="flex h-9 w-9 items-center justify-center rounded-full bg-ocean-700 text-lg text-white shadow-md transition hover:bg-mango-500 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Inside the card, behind its own rule — never loose on the page. */}
      {footer && (
        <div className="border-t border-sand-100 bg-sand-50/50 px-3.5 py-2">{footer}</div>
      )}
    </div>
  );
}
