/**
 * Variant resolution helpers — safe to import from client and server.
 *
 * A product either has no variants (its own price/stock/images are used)
 * or a list of variants that own stock and may override price and photos.
 * Everything in the UI goes through these helpers so the two cases behave
 * identically everywhere.
 */

import type { Product, Variant } from "./types";

export function hasVariants(product: Product): boolean {
  return (product.variants?.length ?? 0) > 0;
}

/** The distinct colour options across a product's variants. */
export function variantColors(product: Product): string[] {
  if (!hasVariants(product)) return product.colors ?? [];
  return [...new Set(product.variants!.map((v) => v.color).filter(Boolean) as string[])];
}

/** The distinct size options across a product's variants. */
export function variantSizes(product: Product): string[] {
  if (!hasVariants(product)) return product.sizes ?? [];
  return [...new Set(product.variants!.map((v) => v.size).filter(Boolean) as string[])];
}

/**
 * The variant a customer sees first: the seller's chosen default, else the
 * first one that is actually in stock, else the first.
 */
export function defaultVariant(product: Product): Variant | undefined {
  if (!hasVariants(product)) return undefined;
  const variants = product.variants!;
  return (
    variants.find((v) => v.id === product.defaultVariantId) ??
    variants.find((v) => v.stock > 0) ??
    variants[0]
  );
}

/**
 * The image representing this product in listings — the default variant's
 * main photo when it has one, otherwise the product's own main photo.
 */
export function primaryImage(product: Product): string | undefined {
  return defaultVariant(product)?.images?.[0] ?? product.images?.[0];
}

/**
 * Colour options with a thumbnail each, for the swatch row on product
 * cards. Only colours that have their own photo can switch the image.
 */
export function colorOptions(
  product: Product,
): { color: string; image?: string; swatch?: string; inStock: boolean }[] {
  if (hasVariants(product)) {
    const seen = new Map<string, { color: string; image?: string; swatch?: string; inStock: boolean }>();
    for (const v of product.variants!) {
      if (!v.color) continue;
      const existing = seen.get(v.color);
      if (existing) {
        // Any in-stock size makes the colour available.
        existing.inStock = existing.inStock || v.stock > 0;
        existing.image = existing.image ?? v.images?.[0];
        continue;
      }
      seen.set(v.color, {
        color: v.color,
        image: v.images?.[0],
        swatch: colorSwatch(v.color),
        inStock: v.stock > 0,
      });
    }
    return [...seen.values()];
  }
  return (product.colors ?? []).map((color) => ({
    color,
    swatch: colorSwatch(color),
    inStock: product.stock > 0,
  }));
}

/** Find the variant matching the chosen options. */
export function findVariant(
  product: Product,
  color?: string,
  size?: string,
): Variant | undefined {
  return product.variants?.find(
    (v) => (v.color ?? undefined) === color && (v.size ?? undefined) === size,
  );
}

/** Price of a specific variant, falling back to the product price. */
export function variantPrice(product: Product, variant?: Variant): number {
  return variant?.price ?? product.price;
}

/** Lowest price a customer could pay — used in listings ("from $X"). */
export function displayPrice(product: Product): number {
  if (!hasVariants(product)) return product.price;
  return Math.min(...product.variants!.map((v) => v.price ?? product.price));
}

/** True when variants have different prices, so listings show "from". */
export function hasPriceRange(product: Product): boolean {
  if (!hasVariants(product)) return false;
  const prices = product.variants!.map((v) => v.price ?? product.price);
  return Math.max(...prices) !== Math.min(...prices);
}

/** Total sellable units across variants (or the product's own stock). */
export function totalStock(product: Product): number {
  if (!hasVariants(product)) return product.stock;
  return product.variants!.reduce((sum, v) => sum + v.stock, 0);
}

/** Stock for the selected variant, or the whole product. */
export function variantStock(product: Product, variant?: Variant): number {
  if (!hasVariants(product)) return product.stock;
  return variant?.stock ?? 0;
}

/**
 * Photos for a variant, resolved in order:
 *   1. the variant's own photos
 *   2. photos from ANY variant sharing its colour
 *   3. the product's photos
 *
 * Step 2 is what stops the storage blow-up: a shirt in Black sizes 41–44 is
 * four variants, but the photos only differ by colour. Upload them once on
 * any Black variant and every other Black size inherits them.
 */
export function variantImages(product: Product, variant?: Variant): string[] {
  if (variant?.images?.length) return variant.images;

  if (variant?.color && product.variants) {
    const sibling = product.variants.find(
      (v) => v.color === variant.color && v.images?.length,
    );
    if (sibling?.images?.length) return sibling.images;
  }

  return product.images ?? [];
}

/** True when this variant is borrowing another same-colour variant's photos. */
export function inheritsColorImages(product: Product, variant: Variant): boolean {
  if (variant.images?.length) return false;
  if (!variant.color || !product.variants) return false;
  return product.variants.some((v) => v.color === variant.color && v.images?.length);
}

/** Human label for a variant, e.g. "Black · M". */
export function variantLabel(variant: Variant): string {
  return [variant.color, variant.size].filter(Boolean).join(" · ") || "Default";
}

/** Colour swatches for common colour names (falls back to a neutral chip). */
export const COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  charcoal: "#374151",
  grey: "#9ca3af",
  gray: "#9ca3af",
  silver: "#d1d5db",
  white: "#f9fafb",
  cream: "#fdf6e3",
  sand: "#e7d3b3",
  natural: "#d9c7a7",
  beige: "#e8dcc8",
  brown: "#78350f",
  terracotta: "#c2643f",
  red: "#dc2626",
  burgundy: "#7f1d1d",
  orange: "#f97316",
  mango: "#fb8a0e",
  gold: "#d4af37",
  yellow: "#facc15",
  lime: "#84cc16",
  green: "#16a34a",
  emerald: "#059669",
  teal: "#0d9488",
  blue: "#2563eb",
  navy: "#1e3a8a",
  sky: "#38bdf8",
  purple: "#7c3aed",
  violet: "#8b5cf6",
  pink: "#ec4899",
  rose: "#f43f5e",
  "dusty rose": "#c98a94",
  multi: "#a3a3a3",
};

export function colorSwatch(name: string): string | undefined {
  return COLOR_SWATCHES[name.trim().toLowerCase()];
}
