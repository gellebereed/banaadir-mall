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

/** Comprehensive color swatches for single and multi-word fashion color names. */
export const COLOR_SWATCHES: Record<string, string> = {
  // Whites & Creams
  white: "#ffffff",
  "pure white": "#ffffff",
  "off white": "#faf9f6",
  ivory: "#fffff0",
  cream: "#fffdd0",
  pearl: "#eaedd0",
  snow: "#fffafa",
  bone: "#e3dac9",

  // Black & Greys
  black: "#111827",
  "jet black": "#090a0f",
  charcoal: "#374151",
  "dark grey": "#4b5563",
  "dark gray": "#4b5563",
  grey: "#9ca3af",
  gray: "#9ca3af",
  "light grey": "#d1d5db",
  "light gray": "#d1d5db",
  "space grey": "#6b7280",
  "space gray": "#6b7280",
  silver: "#e5e7eb",
  slate: "#64748b",

  // Blues
  blue: "#2563eb",
  "navy blue": "#1e3a8a",
  navy: "#1e3a8a",
  "midnight blue": "#0f172a",
  "dark blue": "#1d4ed8",
  "royal blue": "#1d4ed8",
  "light blue": "#60a5fa",
  "baby blue": "#93c5fd",
  "sky blue": "#38bdf8",
  sky: "#38bdf8",
  "ice blue": "#e0f2fe",
  indigo: "#4338ca",

  // Greens
  green: "#16a34a",
  "dark green": "#14532d",
  "forest green": "#166534",
  "olive green": "#556b2f",
  olive: "#556b2f",
  khaki: "#c2b280",
  "army green": "#4b5320",
  emerald: "#059669",
  sage: "#9daf97",
  mint: "#6ee7b7",
  "mint green": "#6ee7b7",
  lime: "#84cc16",

  // Reds & Burgundy
  red: "#dc2626",
  "dark red": "#991b1b",
  burgundy: "#7f1d1d",
  maroon: "#800000",
  wine: "#722f37",
  crimson: "#990000",
  coral: "#f87171",
  ruby: "#e11d48",

  // Pinks & Purples
  pink: "#ec4899",
  "hot pink": "#db2777",
  "baby pink": "#fbcfe8",
  "dusty pink": "#d8b4fe",
  rose: "#f43f5e",
  "dusty rose": "#c98a94",
  blush: "#fde8e8",
  peach: "#ffdab9",
  purple: "#7c3aed",
  violet: "#8b5cf6",
  plum: "#581c87",
  lavender: "#e9d5ff",
  lilac: "#c084fc",
  magenta: "#d946ef",

  // Yellows, Oranges & Browns
  yellow: "#facc15",
  mustard: "#eab308",
  gold: "#d4af37",
  orange: "#f97316",
  mango: "#fb8a0e",
  amber: "#f59e0b",
  bronze: "#cd7f32",
  copper: "#b87333",
  "rose gold": "linear-gradient(135deg, #b76e79, #f7cad0)",
  champagne: "#f7e7ce",
  brown: "#78350f",
  "dark brown": "#451a03",
  chocolate: "#3d2314",
  tan: "#d2b48c",
  camel: "#c19a6b",
  beige: "#e8dcc8",
  sand: "#e7d3b3",
  nude: "#e3bc9a",
  taupe: "#483c32",
  terracotta: "#c2643f",

  // Teals & Cyans
  teal: "#0d9488",
  turquoise: "#40e0d0",
  cyan: "#06b6d4",
  aqua: "#22d3ee",

  // Multi / Gradients
  multi: "linear-gradient(135deg, #ef4444, #3b82f6, #10b981)",
  multicolor: "linear-gradient(135deg, #ef4444, #3b82f6, #10b981)",
  "multi-color": "linear-gradient(135deg, #ef4444, #3b82f6, #10b981)",
  rainbow: "linear-gradient(135deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6)",
  gradient: "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
};

/**
 * Smart color resolver. Looks up exact matches, token substrings, or computes a
 * vibrant HSL color dynamically so EVERY color name gets an accurate swatch.
 */
export function colorSwatch(name?: string): string {
  if (!name || !name.trim()) return "#9ca3af";
  const clean = name.trim().toLowerCase();

  // 1. Direct dictionary match
  if (COLOR_SWATCHES[clean]) {
    return COLOR_SWATCHES[clean];
  }

  // 2. Substring match for known color keys
  for (const [key, value] of Object.entries(COLOR_SWATCHES)) {
    if (clean.includes(key)) {
      return value;
    }
  }

  // 3. Fallback to common root color words
  if (clean.includes("blue")) return "#2563eb";
  if (clean.includes("red")) return "#dc2626";
  if (clean.includes("green")) return "#16a34a";
  if (clean.includes("pink")) return "#ec4899";
  if (clean.includes("purple")) return "#7c3aed";
  if (clean.includes("yellow")) return "#facc15";
  if (clean.includes("orange")) return "#f97316";
  if (clean.includes("black")) return "#111827";
  if (clean.includes("white")) return "#ffffff";
  if (clean.includes("grey") || clean.includes("gray")) return "#9ca3af";
  if (clean.includes("gold")) return "#d4af37";
  if (clean.includes("silver")) return "#e5e7eb";
  if (clean.includes("brown")) return "#78350f";

  // 4. Deterministic string hash fallback (returns a rich HSL color)
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}
