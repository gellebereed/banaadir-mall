/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 6 (a) — a planned product → the Product record we write.
 * ─────────────────────────────────────────────────────────────────────────
 * Pure, so the wizard can show exactly what the commit will store and the
 * dry-run script can print it without a database.
 *
 * ── The rule that governs every merge below ──────────────────────────────
 * AN IMPORT OWNS WHAT THE SUPPLIER KNOWS. It does not own what the seller
 * has done since.
 *
 * The supplier knows codes, colours, sizes, quantities and cost. The seller
 * knows which photo sells the shirt, what the description should say, and
 * whether they have chosen to price this line differently. So on an update
 * the codes and the stock are rewritten, and photos, badges and hand-edited
 * copy survive untouched — unless the seller explicitly asks otherwise with
 * `overwriteDetails`.
 *
 * Getting this backwards is how an importer earns a reputation: a second
 * shipment arrives, someone re-runs the file, and a month of merchandising
 * work quietly reverts to "imported new and in original packaging".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { normalizeBarcode, normalizeReference } from "../barcode.ts";
import type { Art, Product, Variant } from "../types.ts";
import type { PlannedProduct } from "./plan.ts";

export interface BuildOptions {
  storeSlug: string;
  /** Rewrite name, description, features and category on existing products. */
  overwriteDetails: boolean;
  /** Rewrite price and compare-at on existing products. */
  overwritePrices: boolean;
  /** Put imported products straight on the storefront. */
  publishImmediately: boolean;
  /** ISO timestamp stamped into supplier metadata. */
  importedAt: string;
}

/** A glyph per category, so an imported catalogue isn't 104 identical boxes. */
const CATEGORY_ICONS: Record<string, string> = {
  shirts: "👔",
  "short-sleeve-shirts": "👕",
  "non-iron-shirts": "👔",
  "t-shirts": "👕",
  "shirt-jackets": "🧥",
  jackets: "🧥",
  coats: "🧥",
  suits: "🤵",
  trousers: "👖",
  shoes: "👞",
  socks: "🧦",
  underwear: "🩲",
  ties: "👔",
  "bow-ties-and-cummerbunds": "🎀",
  bags: "👜",
  bracelets: "📿",
  belts: "🪢",
  knitwear: "🧶",
  dresses: "👗",
  shorts: "🩳",
};

const DEFAULT_ART: Art = { from: "#e0f2fe", to: "#bae6fd" };

/**
 * Artwork from the product's own first colour, so a navy shirt with no
 * photo yet still reads as a navy shirt in the grid rather than as the
 * same pale blue rectangle as everything else.
 */
function artFor(planned: PlannedProduct): Art {
  const hex = planned.draft.variants.find((v) => v.colorHex)?.colorHex;
  if (!hex) return DEFAULT_ART;
  return { from: lighten(hex, 0.72), to: lighten(hex, 0.42) };
}

/** Mix a hex colour toward white by `amount` (0 = unchanged, 1 = white). */
function lighten(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  const mixed = channels.map((c) => Math.round(c + (255 - c) * amount));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the record to write for one planned product.
 *
 * `existing` is the catalogue product being updated, or undefined on a
 * create. Passing it is what makes merchandising survive the import.
 */
export function buildProduct(
  planned: PlannedProduct,
  existing: Product | undefined,
  options: BuildOptions,
): Product {
  const draft = planned.draft;
  const isNew = !existing;
  const takeDetails = isNew || options.overwriteDetails;
  const takePrices = isNew || options.overwritePrices;

  const variants = mergeVariants(planned, existing);
  const categorySlug = draft.category?.slug ?? existing?.category ?? "";

  return {
    // Identity never moves once assigned: reusing the existing id is what
    // keeps orders, wishlists and carts pointing at the same product.
    id: existing?.id ?? draft.slug,
    slug: existing?.slug ?? draft.slug,
    store: existing?.store ?? options.storeSlug,

    name: takeDetails ? draft.name : existing!.name,
    category: takeDetails ? categorySlug : existing!.category,
    subcategory: takeDetails ? draft.subcategory : existing!.subcategory,
    description: takeDetails ? draft.description : existing!.description,
    features: takeDetails ? draft.features : existing!.features,

    // The supplier's codes always win — they are the identity the next
    // import, and every barcode scan, will match on.
    // styleCode, not itemCode: the latter falls back to the barcode when the
    // file has no product-code column, and a barcode is not a reference.
    internalReference: normalizeReference(draft.styleCode ?? "") || undefined,
    barcode: existing?.barcode,
    uom: existing?.uom ?? "Units",
    odooId: existing?.odooId,

    price: takePrices ? draft.price : existing!.price,
    compareAt: takePrices ? draft.compareAt : existing?.compareAt,
    cost: draft.cost > 0 ? draft.cost : existing?.cost,

    stock: variants.reduce((sum, v) => sum + v.stock, 0),

    icon: existing?.icon ?? CATEGORY_ICONS[categorySlug] ?? "🛍️",
    art: existing?.art ?? artFor(planned),
    rating: existing?.rating ?? 5,
    reviewCount: existing?.reviewCount ?? 0,
    sold: existing?.sold ?? 0,
    badge: existing?.badge ?? "New",

    // Photos are the one thing an import can never supply, and the one
    // thing a seller will have spent time on.
    images: existing?.images ?? [],

    // With variants present, the flat colours/sizes arrays are the older,
    // non-sellable representation — keeping both lets the two disagree.
    colors: undefined,
    sizes: undefined,

    hidden: isNew ? !options.publishImmediately : existing!.hidden,

    variants,
    defaultVariantId:
      variants.find((v) => v.id === existing?.defaultVariantId)?.id ?? variants[0]?.id,

    supplier: {
      brand: draft.brand,
      line: draft.line,
      season: draft.season,
      composition: draft.composition,
      hsCode: draft.hsCode,
      invoiceNo: draft.invoiceNo,
      invoiceDate: draft.invoiceDate,
      importedAt: options.importedAt,
    },
  };
}

/**
 * Merge the file's variants into the product's.
 *
 * Variants the file does not mention are KEPT. A supplier ships one colour
 * this month and another next month; treating each file as the complete
 * truth would delete the first colour — along with its stock, its photos,
 * and the barcode a customer's order still refers to.
 */
function mergeVariants(planned: PlannedProduct, existing: Product | undefined): Variant[] {
  const byKey = new Map<string, Variant>();
  const keyOf = (barcode?: string, sku?: string) =>
    normalizeBarcode(barcode ?? "") || normalizeReference(sku ?? "");

  for (const variant of existing?.variants ?? []) {
    const key = keyOf(variant.barcode, variant.sku) || variant.id;
    byKey.set(key, variant);
  }

  for (const plannedVariant of planned.variants) {
    const draft = plannedVariant.draft;
    const key = keyOf(draft.barcode, draft.sku);
    const previous = byKey.get(key);

    byKey.set(key, {
      // An existing id keeps carts and default-variant choices valid.
      id: previous?.id ?? draft.id,
      color: draft.color ?? previous?.color,
      colorHex: draft.colorHex ?? previous?.colorHex,
      size: draft.sizeLabel ?? draft.size ?? previous?.size,
      stock: plannedVariant.newStock,
      // A per-variant price override the seller set is theirs to keep; the
      // import prices at product level.
      price: previous?.price,
      images: previous?.images,
      sku: normalizeReference(draft.sku) || previous?.sku,
      barcode: normalizeBarcode(draft.barcode ?? "") || previous?.barcode,
      odooId: previous?.odooId,
    });
  }

  return [...byKey.values()];
}
