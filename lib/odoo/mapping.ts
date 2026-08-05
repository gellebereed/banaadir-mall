/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ODOO ↔ BANAADIR MALL — the field mapping, in one place.
 * ─────────────────────────────────────────────────────────────────────────
 * Nothing here talks to Odoo yet. This module is the SEAM: pure functions
 * that translate Odoo record shapes into the app's domain types and back.
 * When the connector is written (XML-RPC `/xmlrpc/2/object` or the JSON-RPC
 * endpoint), it will fetch raw records and pass them through these
 * functions — so the sync work is "fetch + call mapper", and the rules that
 * decide what a field MEANS stay reviewable in one file.
 *
 * ── The model correspondence ─────────────────────────────────────────────
 *
 *   Odoo                        Here                    Notes
 *   ─────────────────────────   ─────────────────────   ────────────────────
 *   product.template            Product                 the catalogue entry
 *   product.product             Variant                 the sellable unit
 *   product.category            Category (tree)         parent_id → parentSlug
 *   product.template.default_code  Product.internalReference
 *   product.product.default_code   Variant.sku
 *   product.template.barcode       Product.barcode
 *   product.product.barcode        Variant.barcode      what a scanner reads
 *   list_price                  Product.price           tax-excluded sales price
 *   standard_price              — (not exposed)         cost; never public
 *   qty_available               Variant.stock / Product.stock
 *   uom_id[1]                   Product.uom
 *   res.partner (vendor)        Store
 *
 * ── Why a product with no variants still maps cleanly ────────────────────
 * Odoo ALWAYS materialises at least one product.product per template. A
 * template with no attributes has exactly one, carrying the same codes. The
 * app mirrors that: a Product without `variants` is its own single sellable
 * unit and its own barcode is the one that gets scanned. `sellableUnits()`
 * below makes that explicit so callers never special-case it.
 *
 * ── Matching strategy for the sync (in priority order) ───────────────────
 *   1. odooId          — set on a previous sync; exact, survives renames.
 *   2. barcode         — globally unique in both systems.
 *   3. internalReference (case-insensitive) — the human key.
 *   4. nothing matched → create.
 * Matching on NAME is deliberately absent: two vendors selling "Cotton
 * Towel" would silently merge into one product.
 * ─────────────────────────────────────────────────────────────────────────
 */

// Explicit .ts extension: this module is reached from lib/import/plan.ts,
// which also runs outside the bundler in scripts/import-supplier-file.mjs.
import { checkBarcode, checkReference, normalizeBarcode, normalizeReference } from "../barcode.ts";
import type { Category, Product, Variant } from "../types";

/** Odoo returns many-to-one fields as `[id, display_name]`, or false when unset. */
export type OdooMany2One = [number, string] | false | null | undefined;

/** Odoo sends `false` rather than null/"" for every empty scalar. */
export type OdooValue<T> = T | false | null | undefined;

/** The `product.template` fields a catalogue sync needs to read. */
export interface OdooProductTemplate {
  id: number;
  name: OdooValue<string>;
  default_code: OdooValue<string>;
  barcode: OdooValue<string>;
  list_price: OdooValue<number>;
  categ_id: OdooMany2One;
  uom_id: OdooMany2One;
  description_sale: OdooValue<string>;
  active: OdooValue<boolean>;
  /** Odoo `is_published` — the website visibility flag. */
  is_published?: OdooValue<boolean>;
  qty_available?: OdooValue<number>;
  write_date?: OdooValue<string>;
}

/** The `product.product` fields a catalogue sync needs to read. */
export interface OdooProductProduct {
  id: number;
  product_tmpl_id: OdooMany2One;
  default_code: OdooValue<string>;
  barcode: OdooValue<string>;
  lst_price: OdooValue<number>;
  qty_available: OdooValue<number>;
  /** e.g. ["Colour: Navy", "Size: M"] from product_template_attribute_value_ids. */
  product_template_variant_value_ids?: OdooValue<string[]>;
  write_date?: OdooValue<string>;
}

export interface OdooProductCategory {
  id: number;
  name: OdooValue<string>;
  parent_id: OdooMany2One;
  /** e.g. "All / Saleable / Home". */
  complete_name?: OdooValue<string>;
}

// ── Primitives ─────────────────────────────────────────────────────────
// Odoo's `false`-for-empty convention is the single most common source of
// bugs in an Odoo integration: `String(false)` is the string "false", which
// then happily saves as a product name. These helpers exist so no caller
// ever touches a raw Odoo value.

export function odooText(value: OdooValue<string>): string | undefined {
  if (value === false || value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
}

export function odooNumber(value: OdooValue<number>): number | undefined {
  if (value === false || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function odooBool(value: OdooValue<boolean>): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  return Boolean(value);
}

/** The id half of a many2one, e.g. `categ_id` → 12. */
export function odooRelationId(value: OdooMany2One): number | undefined {
  return Array.isArray(value) ? value[0] : undefined;
}

/** The label half of a many2one, e.g. `uom_id` → "Units". */
export function odooRelationName(value: OdooMany2One): string | undefined {
  return Array.isArray(value) ? odooText(value[1]) : undefined;
}

/**
 * Odoo category names are free text ("Home & Living"); slugs are our URL
 * key. Deterministic so the same Odoo category always resolves to the same
 * slug across syncs.
 */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Odoo → app ─────────────────────────────────────────────────────────

/**
 * `product.category` → Category. `parentSlug` is resolved from the parent's
 * NAME, so the caller must map parents before children (or run a second
 * pass); Odoo returns the parent's display name in `parent_id[1]`.
 *
 * Odoo's root "All" category is not a real shopping category — it exists to
 * anchor the tree. Passing it through would put an "All" entry in the
 * navbar, so it is treated as no parent.
 */
export function categoryFromOdoo(record: OdooProductCategory): Category {
  const name = odooText(record.name) ?? `Category ${record.id}`;
  const parentName = odooRelationName(record.parent_id);
  const parentSlug =
    parentName && parentName.toLowerCase() !== "all"
      ? slugifyCategory(parentName)
      : undefined;

  return {
    slug: slugifyCategory(name),
    name,
    icon: "📦",
    tagline: odooText(record.complete_name) ?? "",
    art: { from: "#e0f2fe", to: "#bae6fd" },
    parentSlug,
    odooId: record.id,
  };
}

/**
 * `product.product` → Variant.
 *
 * Odoo describes a variant's options as strings like "Colour: Navy" in
 * `product_template_variant_value_ids`. We split them into the colour/size
 * pair this app models. Anything that is neither is dropped rather than
 * guessed at — a wrong guess would show a customer the wrong swatch.
 */
export function variantFromOdoo(record: OdooProductProduct): Variant {
  const attributes = Array.isArray(record.product_template_variant_value_ids)
    ? record.product_template_variant_value_ids
    : [];

  let color: string | undefined;
  let size: string | undefined;
  for (const attribute of attributes) {
    const [rawName, ...rest] = String(attribute).split(":");
    const label = rawName.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value) continue;
    if (!color && /colou?r|renk|midab/.test(label)) color = value;
    else if (!size && /size|beden|cabbir/.test(label)) size = value;
  }

  return {
    // Odoo's own id keeps the variant stable across syncs even when the
    // colour or size is renamed.
    id: `odoo-${record.id}`,
    color,
    size,
    price: odooNumber(record.lst_price),
    stock: Math.max(0, Math.trunc(odooNumber(record.qty_available) ?? 0)),
    sku: odooText(record.default_code)
      ? normalizeReference(odooText(record.default_code))
      : undefined,
    barcode: odooText(record.barcode) ? normalizeBarcode(odooText(record.barcode)) : undefined,
    odooId: record.id,
  };
}

/**
 * `product.template` (+ its `product.product` rows) → Product.
 *
 * `base` carries the app-only fields Odoo has no opinion on — slug, store,
 * artwork, ratings. On an update the caller passes the EXISTING product so
 * merchandising work done in the dashboard (photos, badges, feature
 * bullets) survives the sync instead of being overwritten by defaults.
 */
export function productFromOdoo(
  template: OdooProductTemplate,
  variants: OdooProductProduct[] = [],
  base: Partial<Product> & Pick<Product, "id" | "slug" | "store" | "category">,
): Product {
  const mappedVariants = variants.map(variantFromOdoo);
  const name = odooText(template.name) ?? base.name ?? "Untitled product";

  const stockFromVariants = mappedVariants.reduce((sum, v) => sum + v.stock, 0);

  return {
    ...base,
    id: base.id,
    slug: base.slug,
    store: base.store,
    category: base.category,
    name,
    internalReference: odooText(template.default_code)
      ? normalizeReference(odooText(template.default_code))
      : undefined,
    barcode: odooText(template.barcode)
      ? normalizeBarcode(odooText(template.barcode))
      : undefined,
    uom: odooRelationName(template.uom_id) ?? "Units",
    odooId: template.id,
    price: odooNumber(template.list_price) ?? base.price ?? 0,
    compareAt: base.compareAt,
    icon: base.icon ?? "🛍️",
    art: base.art ?? { from: "#e0f2fe", to: "#bae6fd" },
    rating: base.rating ?? 5,
    reviewCount: base.reviewCount ?? 0,
    sold: base.sold ?? 0,
    stock: mappedVariants.length > 0
      ? stockFromVariants
      : Math.max(0, Math.trunc(odooNumber(template.qty_available) ?? base.stock ?? 0)),
    description: odooText(template.description_sale) ?? base.description ?? "",
    features: base.features ?? [],
    images: base.images ?? [],
    // Odoo archiving (`active = false`) and un-publishing both mean "should
    // not be on the storefront" — the closest thing this app has is hidden.
    hidden:
      odooBool(template.active) === false ||
      odooBool(template.is_published) === false ||
      base.hidden,
    variants: mappedVariants.length > 0 ? mappedVariants : base.variants,
    defaultVariantId: mappedVariants[0]?.id ?? base.defaultVariantId,
  };
}

// ── App → Odoo ─────────────────────────────────────────────────────────

/**
 * Product → the `product.template` values dict for `create`/`write`.
 * Only fields the marketplace OWNS are sent. Costs, accounting and stock
 * moves stay Odoo's business: pushing `qty_available` would silently
 * bypass stock moves and corrupt inventory valuation.
 */
export function productToOdoo(product: Product): Record<string, unknown> {
  const values: Record<string, unknown> = {
    name: product.name,
    list_price: product.price,
    description_sale: product.description,
    is_published: !product.hidden,
  };
  // Odoo rejects "" on a field with a unique constraint but accepts false,
  // which it stores as NULL.
  values.default_code = product.internalReference || false;
  values.barcode = product.barcode || false;
  return values;
}

/** Variant → the `product.product` values dict. */
export function variantToOdoo(variant: Variant): Record<string, unknown> {
  return {
    default_code: variant.sku || false,
    barcode: variant.barcode || false,
  };
}

// ── Sellable units ─────────────────────────────────────────────────────

/**
 * One entry per physically sellable item, resolving the same fallback
 * order the `product_variant_index` SQL view uses. This is the app-side
 * equivalent of Odoo's product.product set, and the thing to iterate when
 * printing labels, checking stock, or resolving a scan.
 */
export interface SellableUnit {
  productId: string;
  productSlug: string;
  productName: string;
  variantId?: string;
  /** "Navy · M", or undefined for a product without variants. */
  label?: string;
  /** Variant code when set, else the product's. */
  reference?: string;
  /** Variant barcode when set, else the product's. */
  barcode?: string;
  price: number;
  stock: number;
}

export function sellableUnits(product: Product): SellableUnit[] {
  const base = {
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
  };

  if (!product.variants?.length) {
    return [
      {
        ...base,
        reference: product.internalReference,
        barcode: product.barcode,
        price: product.price,
        stock: product.stock,
      },
    ];
  }

  return product.variants.map((v) => ({
    ...base,
    variantId: v.id,
    label: [v.color, v.size].filter(Boolean).join(" · ") || undefined,
    reference: v.sku || product.internalReference,
    barcode: v.barcode || product.barcode,
    price: v.price ?? product.price,
    stock: v.stock,
  }));
}

/**
 * Does any sellable unit of this product answer to `code`?
 *
 * BOTH sides are normalised, not just the query. Save actions normalise on
 * write, but codes also arrive from an Odoo sync, a CSV import, or someone
 * editing the table directly — and those routinely carry the spacing a
 * supplier printed ("8 691 106 123 456"). Comparing a normalised query
 * against a raw stored value means the scan silently finds nothing, which
 * at a counter is indistinguishable from the product not existing.
 */
export function matchesCode(product: Product, code: string): SellableUnit | undefined {
  const barcode = normalizeBarcode(code);
  const reference = normalizeReference(code);
  if (!barcode && !reference) return undefined;

  return sellableUnits(product).find(
    (unit) =>
      (unit.barcode && normalizeBarcode(unit.barcode) === barcode) ||
      (unit.reference && normalizeReference(unit.reference) === reference),
  );
}

/**
 * Validate every code on a product before it is saved. Returns the problems
 * as sentences a seller can act on; an empty array means the product is
 * safe to write.
 *
 * Cross-product uniqueness is NOT checked here — that needs the catalogue,
 * so it lives in app/actions.ts where the catalogue is already loaded.
 */
export function validateProductCodes(product: Product): string[] {
  const problems: string[] = [];

  const reference = checkReference(product.internalReference);
  if (!reference.valid) problems.push(`Internal reference: ${reference.error}`);

  const barcode = checkBarcode(product.barcode);
  if (!barcode.valid) problems.push(`Barcode: ${barcode.error}`);

  const seenBarcodes = new Map<string, string>();
  const seenReferences = new Map<string, string>();

  /*
   * ── A single-variant product IS its variant ──────────────────────────
   *
   * Odoo's product.template and product.product are two rows describing
   * one thing whenever there is only one variant, and they carry the SAME
   * default_code and the SAME barcode. That is not a duplicate; it is the
   * shape of every product that does not come in colours and sizes.
   *
   * Seeding the "already used" maps with the template's own codes
   * unconditionally treated that normal case as a collision, so an import
   * of general goods — where every product has exactly one variant — failed
   * on all 1,714 rows with "Reference DC2363 is on both variant 1 and the
   * product itself". The codes were right. The check was wrong.
   *
   * With two or more variants the ambiguity is real: a template code that
   * also sits on one specific variant makes a scan's answer depend on which
   * row is read first. So the seeding is kept for that case only.
   */
  const variants = product.variants ?? [];
  if (variants.length > 1) {
    if (barcode.value) seenBarcodes.set(barcode.value, "the product itself");
    if (reference.value) seenReferences.set(reference.value, "the product itself");
  }

  variants.forEach((variant, index) => {
    // A half-filled variant has no colour or size yet, and its generated id
    // ("vmsbz0mvx1") means nothing to the seller — point at the row instead.
    const label =
      [variant.color, variant.size].filter(Boolean).join(" · ") || `variant ${index + 1}`;

    const variantBarcode = checkBarcode(variant.barcode);
    if (!variantBarcode.valid) {
      problems.push(`Variant "${label}" barcode: ${variantBarcode.error}`);
    } else if (variantBarcode.value) {
      const owner = seenBarcodes.get(variantBarcode.value);
      if (owner) {
        problems.push(
          `Barcode ${variantBarcode.value} is on both "${label}" and ${owner} — a barcode must identify exactly one item.`,
        );
      } else {
        seenBarcodes.set(variantBarcode.value, `"${label}"`);
      }
    }

    const variantReference = checkReference(variant.sku);
    if (!variantReference.valid) {
      problems.push(`Variant "${label}" reference: ${variantReference.error}`);
    } else if (variantReference.value) {
      const owner = seenReferences.get(variantReference.value);
      if (owner) {
        problems.push(
          `Reference ${variantReference.value} is on both "${label}" and ${owner}.`,
        );
      } else {
        seenReferences.set(variantReference.value, `"${label}"`);
      }
    }
  });

  return problems;
}
