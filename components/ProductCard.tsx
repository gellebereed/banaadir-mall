"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
 */
export default function ProductCard({ product }: { product: Product }) {
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
  const mainImage = previewImage ?? primaryImage(product);

  return (
    <div className="group card relative flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ocean-900/10">
      <Link href={`/product/${product.slug}`} className="block">
        {mainImage ? (
          <div className="relative aspect-square w-full overflow-hidden bg-sand-100">
            <Image
              src={mainImage}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover"
            />
          </div>
        ) : (
          <ProductImage product={product} className="aspect-square w-full" />
        )}
      </Link>

      {product.badge && (
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${BADGE_STYLES[product.badge]}`}
        >
          {product.badge === "Sale" && product.compareAt
            ? `-${discountPct(price, product.compareAt)}%`
            : product.badge}
        </span>
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

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
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
    </div>
  );
}
