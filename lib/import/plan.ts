/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 5 — reconcile the draft against the catalogue that already exists.
 * ─────────────────────────────────────────────────────────────────────────
 * Nothing is written here. This stage answers three questions for every
 * product in the file, and the answers are what the wizard shows before the
 * seller commits:
 *
 *   Is this new, or does it already exist?      → create / update
 *   What happens to its stock?                  → receive (add) or set
 *   Is anything about it going to be rejected?  → blocked, with a reason
 *
 * ── Matching order ───────────────────────────────────────────────────────
 * Barcode, then variant SKU, then the product's internal reference — the
 * same priority lib/odoo/mapping.ts documents for an Odoo sync, and for the
 * same reason: a barcode is unique marketplace-wide, a reference is unique
 * per seller, and NAME is never matched on at all. Two vendors selling
 * "Casual Shoes" would silently merge into one product; in this one file
 * alone, four different styles carry that exact name.
 *
 * ── Re-importing must be safe ────────────────────────────────────────────
 * Running the same file twice is normal — a shipment arrives in two parts,
 * or the first attempt was mis-mapped. Because every draft is matched on
 * codes the supplier controls, the second run UPDATES the same 104 products
 * rather than creating 104 more. What it must not do is delete: variants
 * already on a product but absent from this file are left untouched, so a
 * partial shipment never wipes the colours it happens not to contain.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { normalizeBarcode, normalizeReference } from "../barcode.ts";
import { sellableUnits } from "../odoo/mapping.ts";
import type { Product, Variant } from "../types.ts";
import type { DraftProduct, DraftVariant, ImportIssue } from "./aggregate.ts";
import type { ResolvedCategory } from "./categories.ts";

/** Add this shipment to what is on the shelf, or replace the count. */
export type StockMode = "receive" | "set";

export type PlanAction = "create" | "update" | "blocked";

export interface PlannedVariant {
  draft: DraftVariant;
  action: "create" | "update";
  /** Stock before this import, when the variant already exists. */
  previousStock?: number;
  /** Stock after committing, given the stock mode. */
  newStock: number;
}

export interface PlannedProduct {
  draft: DraftProduct;
  action: PlanAction;
  /** The catalogue product this updates. */
  existingId?: string;
  existingName?: string;
  matchedBy?: "barcode" | "sku" | "reference";
  previousStock?: number;
  newStock: number;
  variants: PlannedVariant[];
  /** Variants already on the product that this file does not mention. */
  untouchedVariants: number;
  issues: ImportIssue[];
}

export interface ImportPlan {
  products: PlannedProduct[];
  /** Categories referenced by the file that do not exist yet. */
  categoriesToCreate: ResolvedCategory[];
  issues: ImportIssue[];
  stats: {
    create: number;
    update: number;
    blocked: number;
    variantsCreated: number;
    variantsUpdated: number;
    unitsAdded: number;
    stockAfter: number;
    retailValue: number;
  };
}

export interface PlanOptions {
  storeSlug: string;
  stockMode: StockMode;
  /** Category slugs that already exist, so we only create what is missing. */
  existingCategorySlugs: string[];
}

/** Everything about the catalogue this stage needs to look codes up fast. */
interface CatalogueIndex {
  byBarcode: Map<string, { product: Product; variantId?: string }>;
  byReference: Map<string, { product: Product; variantId?: string }>;
}

function indexCatalogue(catalogue: Product[]): CatalogueIndex {
  const byBarcode = new Map<string, { product: Product; variantId?: string }>();
  const byReference = new Map<string, { product: Product; variantId?: string }>();

  for (const product of catalogue) {
    for (const unit of sellableUnits(product)) {
      const barcode = normalizeBarcode(unit.barcode);
      if (barcode && !byBarcode.has(barcode)) {
        byBarcode.set(barcode, { product, variantId: unit.variantId });
      }
      const reference = normalizeReference(unit.reference);
      if (reference && !byReference.has(reference)) {
        byReference.set(reference, { product, variantId: unit.variantId });
      }
    }
    // The template's own reference, even when its variants carry their own.
    const templateReference = normalizeReference(product.internalReference);
    if (templateReference && !byReference.has(templateReference)) {
      byReference.set(templateReference, { product });
    }
  }

  return { byBarcode, byReference };
}

/** Existing variants of a product, keyed by barcode and by SKU. */
function indexVariants(product: Product | undefined): Map<string, Variant> {
  const index = new Map<string, Variant>();
  for (const variant of product?.variants ?? []) {
    const barcode = normalizeBarcode(variant.barcode);
    const sku = normalizeReference(variant.sku);
    if (barcode) index.set(`b:${barcode}`, variant);
    if (sku) index.set(`s:${sku}`, variant);
  }
  return index;
}

export function buildPlan(
  drafts: DraftProduct[],
  catalogue: Product[],
  options: PlanOptions,
): ImportPlan {
  const index = indexCatalogue(catalogue);
  const issues: ImportIssue[] = [];
  const planned: PlannedProduct[] = [];

  // A product this run has already claimed. Two drafts resolving to the
  // same catalogue row would each write the other's stock away.
  const claimed = new Map<string, string>();

  for (const draft of drafts) {
    const productIssues: ImportIssue[] = [];
    const match = findMatch(draft, index);

    let action: PlanAction = match ? "update" : "create";
    let existing = match?.product;

    if (existing && existing.store !== options.storeSlug) {
      // A barcode identifies one physical product, so it cannot belong to
      // two sellers. Blocking is the only honest answer — silently creating
      // a second product with the same barcode is what the database
      // trigger would reject anyway, halfway through the run.
      action = "blocked";
      productIssues.push({
        level: "error",
        code: "other-store",
        subject: draft.itemCode,
        message:
          `${draft.name} matches "${existing.name}" in the ${existing.store} store. ` +
          `A barcode can only belong to one seller — remove it there first, or drop these rows.`,
      });
      existing = undefined;
    }

    if (existing) {
      const owner = claimed.get(existing.id);
      if (owner && owner !== draft.itemCode) {
        action = "blocked";
        productIssues.push({
          level: "error",
          code: "double-claim",
          subject: draft.itemCode,
          message:
            `Both ${owner} and ${draft.itemCode} in this file match the existing product ` +
            `"${existing.name}". Split them, or give them separate codes.`,
        });
      } else {
        claimed.set(existing.id, draft.itemCode);
      }
    }

    // Codes on this draft that belong to a DIFFERENT product than the one
    // we matched — the database enforces this, so catch it here where the
    // message can name the clash.
    for (const variant of draft.variants) {
      const barcode = normalizeBarcode(variant.barcode);
      if (!barcode) continue;
      const owner = index.byBarcode.get(barcode);
      if (owner && owner.product.id !== existing?.id) {
        action = "blocked";
        productIssues.push({
          level: "error",
          code: "barcode-taken",
          subject: variant.sku,
          message:
            `Barcode ${barcode} (${variant.sku}) already belongs to "${owner.product.name}" ` +
            `in the ${owner.product.store} store.`,
        });
      }
    }

    const existingVariants = indexVariants(existing);
    const variants: PlannedVariant[] = draft.variants.map((variant) => {
      const found =
        (variant.barcode && existingVariants.get(`b:${normalizeBarcode(variant.barcode)}`)) ||
        existingVariants.get(`s:${normalizeReference(variant.sku)}`);

      const previousStock = found?.stock;
      const newStock =
        options.stockMode === "receive" ? (previousStock ?? 0) + variant.qty : variant.qty;

      return {
        draft: variant,
        action: found ? "update" : "create",
        previousStock,
        newStock,
      };
    });

    const mentioned = new Set(
      draft.variants.flatMap((v) => [
        `b:${normalizeBarcode(v.barcode ?? "")}`,
        `s:${normalizeReference(v.sku)}`,
      ]),
    );
    const untouchedVariants = (existing?.variants ?? []).filter((v) => {
      const barcode = normalizeBarcode(v.barcode);
      const sku = normalizeReference(v.sku);
      return !mentioned.has(`b:${barcode}`) && !mentioned.has(`s:${sku}`);
    }).length;

    planned.push({
      draft,
      action,
      existingId: existing?.id,
      existingName: existing?.name,
      matchedBy: match?.by,
      previousStock: existing?.stock,
      // Variants this file leaves alone still hold stock, so it has to be
      // carried into the new total or the product looks like it lost units.
      newStock:
        variants.reduce((sum, v) => sum + v.newStock, 0) +
        keptStock(existing, mentioned),
      variants,
      untouchedVariants,
      issues: productIssues,
    });

    issues.push(...productIssues);
  }

  const existingSlugs = new Set(options.existingCategorySlugs);
  const categoriesToCreate = dedupeCategories(
    planned
      .filter((p) => p.action !== "blocked")
      .map((p) => p.draft.category)
      .filter((c): c is ResolvedCategory => !!c && !existingSlugs.has(c.slug)),
  );

  const live = planned.filter((p) => p.action !== "blocked");

  return {
    products: planned,
    categoriesToCreate,
    issues,
    stats: {
      create: planned.filter((p) => p.action === "create").length,
      update: planned.filter((p) => p.action === "update").length,
      blocked: planned.filter((p) => p.action === "blocked").length,
      variantsCreated: live.reduce(
        (sum, p) => sum + p.variants.filter((v) => v.action === "create").length,
        0,
      ),
      variantsUpdated: live.reduce(
        (sum, p) => sum + p.variants.filter((v) => v.action === "update").length,
        0,
      ),
      unitsAdded: live.reduce((sum, p) => sum + p.draft.totalQty, 0),
      stockAfter: live.reduce((sum, p) => sum + p.newStock, 0),
      retailValue: Math.round(
        live.reduce((sum, p) => sum + p.draft.price * p.draft.totalQty, 0) * 100,
      ) / 100,
    },
  };
}

/** Stock held by variants this file does not mention. */
function keptStock(product: Product | undefined, mentioned: Set<string>): number {
  return (product?.variants ?? [])
    .filter((v) => {
      const barcode = normalizeBarcode(v.barcode);
      const sku = normalizeReference(v.sku);
      return !mentioned.has(`b:${barcode}`) && !mentioned.has(`s:${sku}`);
    })
    .reduce((sum, v) => sum + (v.stock ?? 0), 0);
}

function findMatch(
  draft: DraftProduct,
  index: CatalogueIndex,
): { product: Product; by: "barcode" | "sku" | "reference" } | undefined {
  // Barcode wins: it survives renamed styles and re-used reference codes.
  // Count votes rather than trusting the first hit, so a file whose first
  // variant was mis-typed still lands on the right product.
  const votes = new Map<string, { product: Product; count: number }>();
  for (const variant of draft.variants) {
    const barcode = normalizeBarcode(variant.barcode);
    const hit = barcode ? index.byBarcode.get(barcode) : undefined;
    if (!hit) continue;
    const entry = votes.get(hit.product.id);
    if (entry) entry.count++;
    else votes.set(hit.product.id, { product: hit.product, count: 1 });
  }
  if (votes.size > 0) {
    const best = [...votes.values()].sort((a, b) => b.count - a.count)[0];
    return { product: best.product, by: "barcode" };
  }

  for (const variant of draft.variants) {
    const hit = index.byReference.get(normalizeReference(variant.sku));
    if (hit) return { product: hit.product, by: "sku" };
  }

  const byReference = index.byReference.get(normalizeReference(draft.itemCode));
  if (byReference) return { product: byReference.product, by: "reference" };

  return undefined;
}

function dedupeCategories(categories: ResolvedCategory[]): ResolvedCategory[] {
  const bySlug = new Map<string, ResolvedCategory>();
  for (const category of categories) {
    if (!bySlug.has(category.slug)) bySlug.set(category.slug, category);
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}
