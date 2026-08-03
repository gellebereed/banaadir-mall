"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SERVER ACTIONS — every mutation the dashboards can perform.
 * ─────────────────────────────────────────────────────────────────────────
 * Each action: (1) checks the session + access rights, (2) writes to
 * Supabase when configured (production/Netlify) OR to the JSON store
 * (lib/db.ts) for local dev, (3) revalidates so every page shows the
 * change immediately.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";
import { redirect } from "next/navigation";
import {
  findCodeConflicts,
  getBaseProduct,
  getBaseProducts,
  getCategoryWithDescendants,
  getStore,
} from "@/lib/api";
import { checkBarcode, checkReference } from "@/lib/barcode";
import { sellableUnits, validateProductCodes } from "@/lib/odoo/mapping";
import {
  baseOrderId,
  belongsToOrder,
  groupByStore,
  mergeParcelStatuses,
  vendorOrderIds,
} from "@/lib/order-utils";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { can, type AccessArea, type Session } from "@/lib/auth";
import { mutateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import type {
  Banner,
  EmployeeRole,
  HomeSection,
  Order,
  OrderStatus,
  Product,
  Store,
  Variant,
} from "@/lib/types";
import { deleteUpload, filesFrom, saveImages } from "@/lib/uploads";
import {
  useSupabaseMutations,
  upsertProduct,
  updateProductFields,
  deleteProductFromSupabase,
  updateStoreFields,
  setStoreStatusInSupabase,
  setOrderStatusInSupabase,
  insertPromotion,
  togglePromotionInSupabase,
  deletePromotionFromSupabase,
  insertEmployee,
  deleteEmployeeFromSupabase,
  updateMarketingInSupabase,
  upsertCategoryInSupabase,
  deleteCategoryFromSupabase,
  toggleCategoryVisibilityInSupabase,
} from "@/lib/supabase/mutations";

/**
 * Invalidate what a mutation actually affected.
 *
 * This used to be `revalidatePath("/", "layout")` — correct, but it purges
 * the ENTIRE route tree and client router cache on every save, which is
 * what made submitting feel slow. Revalidating only the home page is fast
 * but leaves the dashboard the user is looking at showing stale data, so
 * we refresh the relevant dashboard subtree too.
 *
 * Catalog pages (`/products`, `/product/[slug]`, …) are `force-dynamic`
 * and re-read data every request, so they never need revalidating.
 */
function refresh() {
  // Supabase reads are cached per tag (lib/supabase/db-api.ts). Dropping
  // those entries is what makes an edit show up immediately instead of
  // after the 60s safety-net window.
  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);

  // Only the home page is cached at the route level; dashboards and catalog
  // pages are all `force-dynamic` (or read cookies) so they re-render on
  // every request and on every server-action response. Revalidating their
  // layouts here would remount the client forms mid-submit and wipe state.
  revalidatePath("/", "page");
}

async function requireAccess(area: AccessArea): Promise<Session> {
  const session = await getSession();
  if (!session || session.role === "customer") redirect("/login");
  if (!can(session, area)) {
    throw new Error(`Your account does not have "${area}" access.`);
  }
  return session;
}

/** Sellers may only touch their own store; admins may touch any. */
function assertOwnsStore(session: Session, storeSlug: string) {
  if (session.role === "admin") return;
  if (session.role === "seller" && session.store === storeSlug) return;
  throw new Error("You can only manage your own store.");
}

// ── Products ───────────────────────────────────────────────────────────

/** Split a textarea into trimmed, non-empty lines. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Split a comma-separated field (variant colours/sizes). */
function commaList(value: FormDataEntryValue | null): string[] | undefined {
  const list = String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/** Parse the JSON the PhotoManager / VariantEditor components submit. */
function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Resolve each variant's photos: the ones kept in the editor plus any new
 * files uploaded through that variant's own file input.
 */
async function resolveVariants(
  formData: FormData,
  basePrice: number,
): Promise<Variant[] | undefined> {
  const submitted = parseJsonField<Variant[]>(formData.get("variantsJson"), []);
  if (submitted.length === 0) return undefined;

  return Promise.all(
    submitted.map(async (v) => {
      const uploaded = await saveImages(filesFrom(formData, `variant-photos-${v.id}`), "products");
      const images = [...(v.images ?? []), ...uploaded];
      const price =
        v.price === undefined || Number.isNaN(Number(v.price)) ? undefined : Number(v.price);
      return {
        id: v.id,
        color: v.color?.trim() || undefined,
        colorHex: v.colorHex?.trim() || undefined,
        size: v.size?.trim() || undefined,
        // Storing a price equal to the base price adds no information.
        price: price === basePrice ? undefined : price,
        stock: Math.max(0, Number(v.stock) || 0),
        images: images.length > 0 ? images : undefined,
        // Odoo product.product identity — normalised here so what is stored
        // is always what a later lookup will compare against.
        sku: checkReference(v.sku).value || undefined,
        barcode: checkBarcode(v.barcode).value || undefined,
        odooId: v.odooId,
      } satisfies Variant;
    }),
  );
}

/**
 * Older category slugs that were renamed. Products saved under them became
 * unreachable: the slug isn't in the navigation, so the product appeared in
 * no category page at all — which is what made subcategories look broken.
 */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "fashion-apparel": "mens-fashion",
  "beauty-perfume": "beauty",
  "groceries-food": "groceries",
  "sports-fitness": "sports-outdoor",
  "baby-kids": "kids-baby",
};

/**
 * Never let a product be saved into a category that doesn't exist.
 * Renamed slugs are mapped to their replacement; anything else unknown is
 * rejected loudly rather than silently orphaning the product.
 */
async function resolveCategory(submitted: string): Promise<string> {
  const slug = (submitted || "").trim();
  const { getCategories } = await import("@/lib/api");
  const categories = await getCategories();

  if (categories.some((c) => c.slug === slug)) return slug;

  const mapped = LEGACY_CATEGORY_MAP[slug];
  if (mapped && categories.some((c) => c.slug === mapped)) return mapped;

  throw new Error(
    `"${slug || "(empty)"}" is not a valid category, so the product would not ` +
      `appear anywhere on the site. Pick one of: ${categories.map((c) => c.slug).join(", ")}.`,
  );
}

/**
 * The Odoo identity fields as submitted, normalised (uppercased reference,
 * whitespace-stripped barcode) so what we validate is exactly what we save.
 */
function readProductCodes(formData: FormData): {
  internalReference?: string;
  barcode?: string;
  uom: string;
} {
  return {
    internalReference:
      checkReference(String(formData.get("internalReference") ?? "")).value || undefined,
    barcode: checkBarcode(String(formData.get("barcode") ?? "")).value || undefined,
    uom: String(formData.get("uom") ?? "").trim() || "Units",
  };
}

/**
 * Reject a product whose codes are malformed or already taken, BEFORE
 * anything is written.
 *
 * The database enforces the same rules (see the trigger in
 * supabase/migration-odoo-catalog.sql) — this layer exists because it can
 * name the product you collided with, and a constraint error cannot. A
 * seller told "barcode 8691… is already on Karaca Tencere Seti" can fix it;
 * one told "duplicate key value violates unique constraint" cannot.
 */
async function assertCodesAreFree(product: Product): Promise<void> {
  const problems = validateProductCodes(product);
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }

  const units = sellableUnits(product);
  const conflicts = await findCodeConflicts(
    {
      barcodes: units.map((u) => u.barcode ?? "").filter(Boolean),
      references: units.map((u) => u.reference ?? "").filter(Boolean),
    },
    product.id,
  );

  if (conflicts.length > 0) {
    // One message per distinct code — repeating the same clash for every
    // variant that inherits it is noise.
    const seen = new Set<string>();
    const messages = conflicts
      .filter((c) => !seen.has(c.code) && seen.add(c.code))
      .map(
        (c) =>
          `"${c.code}" is already used by ${c.product.name}` +
          (c.unitLabel ? ` (${c.unitLabel})` : "") +
          ` in the ${c.product.store} store.`,
      );
    throw new Error(
      `A barcode or internal reference must identify exactly one item:\n${messages.join("\n")}`,
    );
  }
}

/** The chosen default variant, validated against the submitted list. */
function pickDefaultVariantId(
  formData: FormData,
  variants?: Variant[],
): string | undefined {
  if (!variants?.length) return undefined;
  const submitted = String(formData.get("defaultVariantId") ?? "");
  return variants.some((v) => v.id === submitted) ? submitted : variants[0].id;
}

export async function updateProduct(formData: FormData): Promise<void> {
  const session = await requireAccess("products");
  const id = String(formData.get("id"));
  const product = await getBaseProduct(id);
  if (!product) throw new Error("Product not found.");
  assertOwnsStore(session, product.store);

  // Photos: the manager submits the kept photos in their new order; any
  // newly picked files are appended after upload.
  const kept = parseJsonField<string[]>(formData.get("imagesJson"), product.images ?? []);
  const uploaded = await saveImages(filesFrom(formData, "photos"), "products");
  const images = [...kept, ...uploaded];

  const price = Number(formData.get("price"));
  const variants = await resolveVariants(formData, price);
  const defaultVariantId = pickDefaultVariantId(formData, variants);

  // Delete files that are no longer referenced anywhere on this product.
  const stillUsed = new Set([...images, ...(variants ?? []).flatMap((v) => v.images ?? [])]);
  const orphaned = [
    ...(product.images ?? []),
    ...(product.variants ?? []).flatMap((v) => v.images ?? []),
  ].filter((url) => !stillUsed.has(url));
  await Promise.all(orphaned.map(deleteUpload));

  const compareAtRaw = String(formData.get("compareAt") ?? "").trim();
  const badgeRaw = String(formData.get("badge") ?? "");
  const codes = readProductCodes(formData);

  const updatedFields: Partial<Product> = {
    name: String(formData.get("name")),
    price,
    compareAt: compareAtRaw ? Number(compareAtRaw) : undefined,
    stock: variants
      ? variants.reduce((sum, v) => sum + v.stock, 0)
      : Number(formData.get("stock")),
    category: await resolveCategory(String(formData.get("category"))),
    subcategory: String(formData.get("subcategory") ?? "").trim() || undefined,
    internalReference: codes.internalReference,
    barcode: codes.barcode,
    uom: codes.uom,
    icon: String(formData.get("icon") ?? "").trim() || product.icon,
    badge: (badgeRaw || undefined) as Product["badge"],
    description: String(formData.get("description")),
    features: lines(formData.get("features")),
    colors: variants ? undefined : commaList(formData.get("colors")),
    sizes: variants ? undefined : commaList(formData.get("sizes")),
    images,
    variants,
    defaultVariantId,
  };

  // Validate against the catalogue before writing. Photos have already been
  // uploaded at this point, but they are only referenced by this product —
  // a rejected save leaves them orphaned in storage, which is far cheaper
  // than letting a duplicate barcode into the catalogue.
  await assertCodesAreFree({ ...product, ...updatedFields });

  const supabaseOk = await updateProductFields(id, updatedFields);
  if (!supabaseOk) {
    if (useSupabaseMutations()) {
      // Supabase is the source of truth here, and the read layer ignores the
      // JSON overlay whenever Supabase returns rows. Writing to the overlay
      // would make the edit *look* saved and then silently revert, which is
      // exactly the "I can't update products" bug. Fail loudly instead.
      throw new Error(
        "Could not save to Supabase. The edit was NOT stored. " +
          "Check the server logs — if it mentions a missing column, run supabase/migration.sql.",
      );
    }
    await mutateDB((db) => {
      db.productOverrides[id] = {
        ...db.productOverrides[id],
        ...updatedFields,
      };
    });
  }
  refresh();
  redirect(session.role === "admin" ? "/admin/products" : "/vendor/products");
}

export async function toggleProductHidden(id: string): Promise<void> {
  const session = await requireAccess("products");
  const product = await getBaseProduct(id);
  if (!product) return;
  assertOwnsStore(session, product.store);

  const supabaseOk = await updateProductFields(id, { hidden: !product.hidden });
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.productOverrides[id] = {
        ...db.productOverrides[id],
        hidden: !product.hidden,
      };
    });
  }
  refresh();
}

export async function deleteProduct(id: string): Promise<void> {
  const session = await requireAccess("products");
  const product = await getBaseProduct(id);
  if (!product) return;
  assertOwnsStore(session, product.store);

  const supabaseOk = await deleteProductFromSupabase(id);
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.newProducts = db.newProducts.filter((p) => p.id !== id);
      if (!db.deletedProducts.includes(id)) db.deletedProducts.push(id);
      delete db.productOverrides[id];
    });
  }
  refresh();
  redirect(session.role === "admin" ? "/admin/products" : "/vendor/products");
}

export async function createProduct(formData: FormData): Promise<void> {
  const session = await requireAccess("products");
  const storeSlug =
    session.role === "seller" && session.store ? session.store : "sahra-fashion";

  const name = String(formData.get("name")).trim();
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
    "-" + Date.now().toString(36);
  const compareAtRaw = String(formData.get("compareAt") ?? "").trim();
  const images = await saveImages(filesFrom(formData, "photos"), "products");
  const features = lines(formData.get("features"));
  const price = Number(formData.get("price"));
  const variants = await resolveVariants(formData, price);
  const codes = readProductCodes(formData);

  const product: Product = {
    id: slug,
    slug,
    name,
    store: storeSlug,
    category: await resolveCategory(String(formData.get("category"))),
    subcategory: String(formData.get("subcategory") ?? "").trim() || undefined,
    internalReference: codes.internalReference,
    barcode: codes.barcode,
    uom: codes.uom,
    price,
    compareAt: compareAtRaw ? Number(compareAtRaw) : undefined,
    icon: String(formData.get("icon") ?? "🛍️").trim() || "🛍️",
    art: { from: "#e0f2fe", to: "#bae6fd" },
    rating: 5,
    reviewCount: 0,
    sold: 0,
    stock: variants && variants.length > 0
      ? variants.reduce((sum, v) => sum + v.stock, 0)
      : Math.max(0, Number(formData.get("stock") || 0)),
    badge: "New",
    colors: variants ? undefined : commaList(formData.get("colors")),
    sizes: variants ? undefined : commaList(formData.get("sizes")),
    description: String(formData.get("description")),
    features: features.length > 0 ? features : ["Ships within 24 hours", "7-day easy returns"],
    images,
    variants,
    defaultVariantId: pickDefaultVariantId(formData, variants),
  };

  await assertCodesAreFree(product);

  const supabaseOk = await upsertProduct(product);
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.newProducts.push(product);
    });
  }
  refresh();
  redirect("/vendor/products");
}

/**
 * Bulk photo import: attach many photos to many products in one go.
 *
 * Each file is matched to a product by its FILENAME:
 *   uspa-pique-polo.jpg      → product "uspa-pique-polo"
 *   uspa-pique-polo-2.jpg    → second photo of the same product
 * Unmatched files are reported back so nothing fails silently.
 */
export async function bulkImportPhotos(formData: FormData): Promise<void> {
  const session = await requireAccess("products");
  const files = filesFrom(formData, "photos");
  const products = await getBaseProducts();
  const replace = formData.get("replace") === "on";

  // productId -> newly uploaded URLs, in filename order.
  const additions = new Map<string, string[]>();

  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const stem = file.name.replace(/\.[^.]+$/, "").toLowerCase();
    // Longest matching slug wins, so "uspa-polo-2" maps to "uspa-polo".
    const match = products
      .filter((p) => stem === p.slug || stem.startsWith(`${p.slug}-`))
      .sort((a, b) => b.slug.length - a.slug.length)[0];
    if (!match) continue;
    if (session.role !== "admin" && match.store !== session.store) continue;

    const [url] = await saveImages([file], "products");
    if (!url) continue;
    additions.set(match.id, [...(additions.get(match.id) ?? []), url]);
  }

  if (additions.size === 0) return;

  if (useSupabaseMutations()) {
    for (const [productId, urls] of additions) {
      const existing = replace
        ? []
        : (products.find((p) => p.id === productId)?.images ?? []);
      await updateProductFields(productId, { images: [...existing, ...urls] });
    }
  } else {
    await mutateDB((db) => {
      for (const [productId, urls] of additions) {
        const existing = replace
          ? []
          : (db.productOverrides[productId]?.images ??
             products.find((p) => p.id === productId)?.images ??
             []);
        db.productOverrides[productId] = {
          ...db.productOverrides[productId],
          images: [...existing, ...urls],
        };
      }
    });
  }
  refresh();
}

// ── Store profile / branding ───────────────────────────────────────────

/** Result shape for forms that stay on the page and show a confirmation. */
export interface SaveState {
  ok: boolean;
  message: string;
}

/**
 * Seller store settings: name, tagline, city, and uploaded logo/banner
 * images. Admins editing a store pass its slug in the form.
 * Returns a SaveState so the form can confirm the save without navigating.
 */
export async function updateStoreSettings(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAccess("products");
  const storeSlug =
    session.role === "admin"
      ? String(formData.get("store") ?? "sahra-fashion")
      : session.store!;
  const store = await getStore(storeSlug);
  if (!store) return { ok: false, message: "Store not found." };

  const [logo] = await saveImages(filesFrom(formData, "logo"), "stores");
  const [banner] = await saveImages(filesFrom(formData, "banner"), "stores");
  const removeLogo = formData.get("removeLogo") === "on";
  const removeBanner = formData.get("removeBanner") === "on";

  if (removeLogo && store.logo) await deleteUpload(store.logo);
  if (removeBanner && store.banner) await deleteUpload(store.banner);

  // Normalise here, not on display: what's stored is then always the bare
  // international form wa.me needs, whichever way the seller typed it.
  const whatsappRaw = String(formData.get("whatsapp") ?? "").trim();
  const whatsapp = normalizeWhatsAppNumber(whatsappRaw);
  if (whatsappRaw && !whatsapp) {
    return {
      ok: false,
      message:
        `"${whatsappRaw}" doesn't look like a WhatsApp number. Use the ` +
        `international form, e.g. +252 61 333 4444 — nothing else was saved.`,
    };
  }

  const updatedFields: Partial<Store> = {
    name: String(formData.get("name")).trim() || store.name,
    tagline: String(formData.get("tagline")).trim(),
    city: String(formData.get("city")).trim() || store.city,
    icon: String(formData.get("icon") ?? "").trim() || store.icon,
    logo: removeLogo ? undefined : (logo ?? store.logo),
    banner: removeBanner ? undefined : (banner ?? store.banner),
    whatsapp: whatsapp || undefined,
  };

  const supabaseOk = await updateStoreFields(storeSlug, updatedFields);
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.storeOverrides[storeSlug] = {
        ...db.storeOverrides[storeSlug],
        ...updatedFields,
      };
    });
  }
  refresh();
  return { ok: true, message: "Store settings saved." };
}

// ── Promotions (store discounts) ───────────────────────────────────────

export async function createPromotion(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAccess("products");
  const storeSlug =
    session.role === "seller" && session.store ? session.store : "sahra-fashion";
  const pct = Math.min(90, Math.max(1, Number(formData.get("pct"))));

  // "products" scope limits the promotion to the ticked products; the
  // default "store" scope leaves productIds empty (applies to everything).
  const scopedToProducts = String(formData.get("scope")) === "products";
  const productIds = scopedToProducts ? formData.getAll("productIds").map(String) : [];

  if (scopedToProducts && productIds.length === 0) {
    return { ok: false, message: "Pick at least one product, or choose the whole store." };
  }

  const startsAt = String(formData.get("startsAt") ?? "").trim() || undefined;
  const endsAt = String(formData.get("endsAt") ?? "").trim() || undefined;
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    return { ok: false, message: "The end date must come after the start date." };
  }

  const promo = {
    id: "promo-" + Date.now().toString(36),
    store: storeSlug,
    name: String(formData.get("name")).trim() || "Store Sale",
    pct,
    active: true,
    productIds,
    startsAt,
    endsAt,
  };

  const supabaseOk = await insertPromotion(promo);
  if (!supabaseOk) {
    if (useSupabaseMutations()) {
      // Supabase is the source of truth for pricing; writing to the JSON
      // overlay would show the promotion in the list while discounting
      // nothing.
      return {
        ok: false,
        message: "Could not save the promotion to Supabase — check the server logs.",
      };
    }
    await mutateDB((db) => {
      db.promotions.push(promo);
    });
  }
  refresh();

  const scopeLabel = productIds.length
    ? `${productIds.length} product${productIds.length === 1 ? "" : "s"}`
    : "your whole store";
  return {
    ok: true,
    message: startsAt
      ? `Scheduled — ${pct}% off ${scopeLabel} from the start date.`
      : `Live now — ${pct}% off ${scopeLabel}.`,
  };
}

export async function togglePromotion(id: string): Promise<void> {
  const session = await requireAccess("products");

  if (useSupabaseMutations()) {
    // We need to read the current state to toggle it
    const { fetchPromotionsFromSupabase } = await import("@/lib/supabase/db-api");
    const promos = await fetchPromotionsFromSupabase();
    const promo = promos?.find((p) => p.id === id);
    if (!promo) return;
    assertOwnsStore(session, promo.store);
    await togglePromotionInSupabase(id, !promo.active);
  } else {
    await mutateDB((db) => {
      const promo = db.promotions.find((p) => p.id === id);
      if (!promo) return;
      assertOwnsStore(session, promo.store);
      promo.active = !promo.active;
    });
  }
  refresh();
}

export async function deletePromotion(id: string): Promise<void> {
  const session = await requireAccess("products");

  if (useSupabaseMutations()) {
    const { fetchPromotionsFromSupabase } = await import("@/lib/supabase/db-api");
    const promos = await fetchPromotionsFromSupabase();
    const promo = promos?.find((p) => p.id === id);
    if (!promo) return;
    assertOwnsStore(session, promo.store);
    await deletePromotionFromSupabase(id);
  } else {
    await mutateDB((db) => {
      const promo = db.promotions.find((p) => p.id === id);
      if (!promo) return;
      assertOwnsStore(session, promo.store);
      db.promotions = db.promotions.filter((p) => p.id !== id);
    });
  }
  refresh();
}

// ── Orders ─────────────────────────────────────────────────────────────

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const session = await requireAccess("orders");
  // Sellers may only manage orders of their own store.
  if (session.role === "seller") {
    const { getOrder } = await import("@/lib/api");
    const order = await getOrder(orderId);
    if (!order || order.store !== session.store) {
      throw new Error("You can only manage your own store's orders.");
    }
  }

  const supabaseOk = await setOrderStatusInSupabase(orderId, status);
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.orderStatus[orderId] = status;
    });
  }
  refresh();
}

// ── Stores (admin only) ────────────────────────────────────────────────

export async function setStoreStatus(slug: string, status: Store["status"]): Promise<void> {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");

  const supabaseOk = await setStoreStatusInSupabase(slug, status);
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.storeStatus[slug] = status;
    });
  }
  refresh();
}

export async function toggleStoreOfficial(slug: string): Promise<void> {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");

  const { getStore } = await import("@/lib/api");
  const store = await getStore(slug);
  if (!store) return;
  const newOfficial = !store.official;

  const supabaseOk = await updateStoreFields(slug, { official: newOfficial });
  if (!supabaseOk) {
    await mutateDB((db) => {
      db.storeOverrides[slug] = {
        ...db.storeOverrides[slug],
        official: newOfficial,
      };
    });
  }
  refresh();
}

// ── Team / employees ───────────────────────────────────────────────────

export async function addEmployee(formData: FormData): Promise<void> {
  const session = await requireAccess("team");
  const storeSlug =
    session.role === "admin"
      ? String(formData.get("store") ?? "platform")
      : session.store!;

  const email = String(formData.get("email")).trim().toLowerCase();
  const emp = {
    id: "emp-" + Date.now().toString(36),
    store: storeSlug,
    name: String(formData.get("name")).trim(),
    email,
    role: String(formData.get("role")) as EmployeeRole,
  };

  const supabaseOk = await insertEmployee(emp);
  if (!supabaseOk) {
    await mutateDB((db) => {
      if (db.employees.some((e) => e.email.toLowerCase() === email)) return;
      db.employees.push(emp);
    });
  }
  refresh();
}

export async function removeEmployee(id: string): Promise<void> {
  const session = await requireAccess("team");

  if (useSupabaseMutations()) {
    const { fetchEmployeesFromSupabase } = await import("@/lib/supabase/db-api");
    const employees = await fetchEmployeesFromSupabase();
    const employee = employees?.find((e) => e.id === id);
    if (!employee) return;
    if (session.role !== "admin") assertOwnsStore(session, employee.store);
    await deleteEmployeeFromSupabase(id);
  } else {
    await mutateDB((db) => {
      const employee = db.employees.find((e) => e.id === id);
      if (!employee) return;
      if (session.role !== "admin") assertOwnsStore(session, employee.store);
      db.employees = db.employees.filter((e) => e.id !== id);
    });
  }
  refresh();
}

// ── Marketing (admin only) ─────────────────────────────────────────────

async function requireMarketing(): Promise<Session> {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");
  if (!can(session, "marketing")) throw new Error("No marketing access.");
  return session;
}

/** Hero copy, announcement bar and the site-wide campaign. */
export async function updateMarketing(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireMarketing();

  const marketing = {
    announcement: String(formData.get("announcement")),
    announcementBgColor: String(formData.get("announcementBgColor") ?? "#0c2b34").trim(),
    announcementTextColor: String(formData.get("announcementTextColor") ?? "#ffffff").trim(),
    announcementScroll: formData.get("announcementScroll") === "on",
    announcementSpeed: Math.max(5, Math.min(60, Number(formData.get("announcementSpeed")) || 25)),
    heroBadge: String(formData.get("heroBadge")),
    heroTitleTop: String(formData.get("heroTitleTop")),
    heroTitleHighlight: String(formData.get("heroTitleHighlight")),
    heroSubtitle: String(formData.get("heroSubtitle")),
    campaign: {
      active: formData.get("campaignActive") === "on",
      name: String(formData.get("campaignName")).trim() || "Site-wide Sale",
      pct: Math.min(90, Math.max(1, Number(formData.get("campaignPct")) || 10)),
    },
    delivery: {
      fee: Math.max(0, Number(formData.get("deliveryFee")) || 0),
      freeThreshold: Math.max(0, Number(formData.get("freeThreshold")) || 0),
      estimate: String(formData.get("deliveryEstimate") ?? "").trim(),
    },
    promo: {
      // Blank code disables the promo field on the cart entirely.
      code: String(formData.get("promoCode") ?? "").trim().toUpperCase(),
      pct: Math.min(90, Math.max(1, Number(formData.get("promoPct")) || 10)),
    },
  };

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    await updateMarketingInSupabase({
      ...current,
      ...marketing,
    });
  }

  await mutateDB((db) => {
    db.marketing = {
      ...db.marketing,
      ...marketing,
    };
  });

  refresh();
  return { ok: true, message: "Storefront updated successfully! 🎉" };
}

/** Section order + visibility, submitted by the section arranger. */
export async function updateSections(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireMarketing();
  const order = parseJsonField<HomeSection[]>(formData.get("sectionsJson"), []);
  if (order.length === 0) return { ok: false, message: "Nothing to save." };

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    await updateMarketingInSupabase({ ...current, sections: order });
  } else {
    await mutateDB((db) => {
      db.marketing.sections = order;
    });
  }
  refresh();
  return { ok: true, message: "Home page layout saved." };
}

// ── Banners & promo tiles (the home-page builder) ──────────────────────

export async function saveBanner(formData: FormData): Promise<void> {
  await requireMarketing();
  const id = String(formData.get("id") ?? "");
  const [image] = await saveImages(filesFrom(formData, "image"), "marketing");
  const [mobileImage] = await saveImages(filesFrom(formData, "mobileImage"), "marketing");

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const next: Banner = {
      id: id || "ban-" + Date.now().toString(36),
      title: String(formData.get("title") ?? "").trim() || undefined,
      subtitle: String(formData.get("subtitle") ?? "").trim() || undefined,
      cta: String(formData.get("cta") ?? "").trim() || undefined,
      link: String(formData.get("link") ?? "/products").trim() || "/products",
      from: String(formData.get("from") ?? "#1f6270"),
      to: String(formData.get("to") ?? "#fb8a0e"),
      fit: String(formData.get("fit") ?? "cover") === "contain" ? "contain" : "cover",
      image,
      mobileImage,
      active: true,
    };
    const banners = [...current.banners];
    const existingIndex = banners.findIndex((b) => b.id === id);
    if (existingIndex >= 0) {
      banners[existingIndex] = { ...banners[existingIndex], ...next, image: image ?? banners[existingIndex].image, mobileImage: mobileImage ?? banners[existingIndex].mobileImage };
    } else {
      banners.push(next);
    }
    await updateMarketingInSupabase({ ...current, banners });
  } else {
    await mutateDB((db) => {
      const next: Banner = {
        id: id || "ban-" + Date.now().toString(36),
        title: String(formData.get("title") ?? "").trim() || undefined,
        subtitle: String(formData.get("subtitle") ?? "").trim() || undefined,
        cta: String(formData.get("cta") ?? "").trim() || undefined,
        link: String(formData.get("link") ?? "/products").trim() || "/products",
        from: String(formData.get("from") ?? "#1f6270"),
        to: String(formData.get("to") ?? "#fb8a0e"),
        fit: String(formData.get("fit") ?? "cover") === "contain" ? "contain" : "cover",
        image,
        mobileImage,
        active: true,
      };
      const existing = db.marketing.banners.find((b) => b.id === id);
      if (existing) {
        Object.assign(existing, next, {
          // Keep the current artwork unless a new file was uploaded.
          image: image ?? existing.image,
        mobileImage: mobileImage ?? existing.mobileImage,
          active: existing.active,
        });
      } else {
        db.marketing.banners.push(next);
      }
    });
  }
  refresh();
}

export async function deleteBanner(id: string): Promise<void> {
  await requireMarketing();

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const banner = current.banners.find((b) => b.id === id);
    if (banner?.image) void deleteUpload(banner.image);
    await updateMarketingInSupabase({
      ...current,
      banners: current.banners.filter((b) => b.id !== id),
    });
  } else {
    await mutateDB((db) => {
      const banner = db.marketing.banners.find((b) => b.id === id);
      if (banner?.image) void deleteUpload(banner.image);
      db.marketing.banners = db.marketing.banners.filter((b) => b.id !== id);
    });
  }
  refresh();
}

export async function toggleBanner(id: string): Promise<void> {
  await requireMarketing();

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const banners = current.banners.map((b) =>
      b.id === id ? { ...b, active: !b.active } : b
    );
    await updateMarketingInSupabase({ ...current, banners });
  } else {
    await mutateDB((db) => {
      const banner = db.marketing.banners.find((b) => b.id === id);
      if (banner) banner.active = !banner.active;
    });
  }
  refresh();
}

export async function moveBanner(id: string, delta: number): Promise<void> {
  await requireMarketing();

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const list = [...current.banners];
    const i = list.findIndex((b) => b.id === id);
    const target = i + delta;
    if (i < 0 || target < 0 || target >= list.length) return;
    [list[i], list[target]] = [list[target], list[i]];
    await updateMarketingInSupabase({ ...current, banners: list });
  } else {
    await mutateDB((db) => {
      const list = db.marketing.banners;
      const i = list.findIndex((b) => b.id === id);
      const target = i + delta;
      if (i < 0 || target < 0 || target >= list.length) return;
      [list[i], list[target]] = [list[target], list[i]];
    });
  }
  refresh();
}

export async function savePromoTile(formData: FormData): Promise<void> {
  await requireMarketing();
  const id = String(formData.get("id") ?? "");
  const [image] = await saveImages(filesFrom(formData, "image"), "marketing");

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const existingTile = current.promoTiles.find((t) => t.id === id);
    const tile = {
      id: id || "tile-" + Date.now().toString(36),
      label: String(formData.get("label")).trim(),
      sublabel: String(formData.get("sublabel") ?? "").trim(),
      link: String(formData.get("link") ?? "/products").trim() || "/products",
      from: String(formData.get("from") ?? "#ffe4e6"),
      to: String(formData.get("to") ?? "#fecdd3"),
      image: image ?? existingTile?.image,
      active: existingTile?.active ?? true,
    };
    const promoTiles = [...current.promoTiles];
    const idx = promoTiles.findIndex((t) => t.id === id);
    if (idx >= 0) {
      promoTiles[idx] = tile;
    } else {
      promoTiles.push(tile);
    }
    await updateMarketingInSupabase({ ...current, promoTiles });
  } else {
    await mutateDB((db) => {
      const existing = db.marketing.promoTiles.find((t) => t.id === id);
      const tile = {
        id: id || "tile-" + Date.now().toString(36),
        label: String(formData.get("label")).trim(),
        sublabel: String(formData.get("sublabel") ?? "").trim(),
        link: String(formData.get("link") ?? "/products").trim() || "/products",
        from: String(formData.get("from") ?? "#ffe4e6"),
        to: String(formData.get("to") ?? "#fecdd3"),
        image: image ?? existing?.image,
        active: existing?.active ?? true,
      };
      if (existing) {
        Object.assign(existing, tile);
      } else {
        db.marketing.promoTiles.push(tile);
      }
    });
  }
  refresh();
}

export async function submitOrderAction(payload: {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  city: string;
  items: { productId: string; name: string; price: number; qty: number; store: string; image?: string }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
}): Promise<{ ok: boolean; message: string; orderId: string }> {
  const { id, customerName, customerPhone, customerEmail, address, city, items } = payload;

  const itemsByStore = groupByStore(items);

  // The SAME helper the checkout screen uses to label parcels and address
  // WhatsApp messages. These two used to compute ids independently, so the
  // number the customer was shown matched no stored record.
  const orderIds = vendorOrderIds(id, [...itemsByStore.keys()]);

  const { createOrderInSupabase } = await import("@/lib/supabase/mutations");

  for (const [storeSlug, storeItems] of itemsByStore.entries()) {
    const storeSubtotal = storeItems.reduce((acc, i) => acc + i.price * i.qty, 0);
    const orderRecord: Order = {
      id: orderIds.get(storeSlug) ?? id,
      date: new Date().toISOString().slice(0, 10),
      customer: customerName,
      email: customerEmail || "",
      phone: customerPhone,
      address,
      city,
      store: storeSlug,
      total: storeSubtotal,
      items: storeItems.map((i) => ({ productId: i.productId, qty: i.qty })),
      status: "pending",
    };

    if (useSupabaseMutations()) {
      await createOrderInSupabase(orderRecord);
    }

    await mutateDB((db) => {
      db.orderStatus[orderRecord.id] = "pending";
    });
  }

  refresh();
  return { ok: true, message: "Order placed successfully!", orderId: id };
}

export async function getOrderAction(id: string): Promise<Order | undefined> {
  const { getOrder, getOrders } = await import("@/lib/api");

  const exact = await getOrder(id);
  if (exact) return exact;

  /**
   * Nothing matched exactly, so this is very likely the BASE id of a
   * multi-vendor order — the only number the customer was ever given,
   * while the records actually stored are "BM-12345-KARA" and friends.
   * Looking that up used to return nothing, so tracking a multi-vendor
   * order silently reported "not found".
   *
   * The parcels are merged into one view: their items combined, their
   * totals summed, and the LEAST advanced status shown, because an order
   * is only "delivered" once every parcel has arrived.
   */
  const parcels = (await getOrders()).filter((o) => belongsToOrder(o.id, id));
  if (parcels.length === 0) return undefined;

  const overall = mergeParcelStatuses(parcels) as OrderStatus;
  const first = parcels[0];
  return {
    ...first,
    id: baseOrderId(first.id),
    store: parcels.length === 1 ? first.store : "",
    items: parcels.flatMap((o) => o.items),
    total: parcels.reduce((sum, o) => sum + o.total, 0),
    status: overall,
  };
}

export async function getUserOrdersAction(query: {
  name?: string;
  phone?: string;
  email?: string;
}): Promise<Order[]> {
  const { getOrders } = await import("@/lib/api");
  const allOrders = await getOrders();
  if (!query.name && !query.phone && !query.email) return [];

  const cleanName = (query.name || "").trim().toLowerCase();
  const cleanPhone = (query.phone || "").replace(/\D/g, "");
  const cleanEmail = (query.email || "").trim().toLowerCase();

  return allOrders.filter((o) => {
    if (cleanEmail && o.email && o.email.toLowerCase() === cleanEmail) return true;
    if (cleanPhone && o.phone && o.phone.replace(/\D/g, "").includes(cleanPhone)) return true;
    if (cleanName && o.customer.toLowerCase().includes(cleanName)) return true;
    return false;
  });
}

/**
 * Per-parcel status for an order, keyed by store slug. Accepts the base id
 * ("BM-12345") or any single parcel id.
 *
 * Carries the store's display NAME and icon as well as its status: the
 * tracking page used to render the slug uppercased, so customers were told
 * their parcel was with "US-POLO-ASSN" rather than "U.S. Polo Assn."
 */
export async function getBrandOrderStatusesAction(orderId: string): Promise<
  Record<
    string,
    {
      status: OrderStatus;
      store: string;
      storeName: string;
      storeIcon: string;
      storeLogo?: string;
      orderId: string;
      total: number;
    }
  >
> {
  const { getOrders, getAllStores } = await import("@/lib/api");
  const [allOrders, stores] = await Promise.all([getOrders(), getAllStores()]);

  const base = baseOrderId(orderId);
  const matches = allOrders.filter((o) => belongsToOrder(o.id, base));

  const result: Record<
    string,
    {
      status: OrderStatus; store: string; storeName: string; storeIcon: string;
      storeLogo?: string; orderId: string; total: number;
    }
  > = {};

  for (const o of matches) {
    if (!o.store) continue;
    const store = stores.find((s) => s.slug === o.store);
    result[o.store] = {
      status: o.status,
      store: o.store,
      // Fall back to a de-slugified name rather than showing nothing for a
      // store that has since been removed.
      storeName: store?.name ?? o.store.replace(/-/g, " "),
      storeIcon: store?.icon ?? "🏪",
      storeLogo: store?.logo,
      orderId: o.id,
      total: o.total,
    };
  }
  return result;
}

export async function deletePromoTile(id: string): Promise<void> {
  await requireMarketing();

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const tile = current.promoTiles.find((t) => t.id === id);
    if (tile?.image) void deleteUpload(tile.image);
    await updateMarketingInSupabase({
      ...current,
      promoTiles: current.promoTiles.filter((t) => t.id !== id),
    });
  } else {
    await mutateDB((db) => {
      const tile = db.marketing.promoTiles.find((t) => t.id === id);
      if (tile?.image) void deleteUpload(tile.image);
      db.marketing.promoTiles = db.marketing.promoTiles.filter((t) => t.id !== id);
    });
  }
  refresh();
}

export async function togglePromoTile(id: string): Promise<void> {
  await requireMarketing();

  if (useSupabaseMutations()) {
    const { getMarketingSettings } = await import("@/lib/api");
    const current = await getMarketingSettings();
    const promoTiles = current.promoTiles.map((t) =>
      t.id === id ? { ...t, active: !t.active } : t
    );
    await updateMarketingInSupabase({ ...current, promoTiles });
  } else {
    await mutateDB((db) => {
      const tile = db.marketing.promoTiles.find((t) => t.id === id);
      if (tile) tile.active = !tile.active;
    });
  }
  refresh();
}

// ── Flash deals ────────────────────────────────────────────────────────

/** Admin: campaign name, countdown target and which products take part. */
export async function updateFlashDeal(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireMarketing();
  await mutateDB((db) => {
    db.flash = {
      active: formData.get("active") === "on",
      name: String(formData.get("name")).trim() || "Flash Deals",
      endsAt: String(formData.get("endsAt") ?? "").trim(),
      productIds: formData.getAll("productIds").map(String),
    };
  });
  refresh();
  return { ok: true, message: "Flash deal campaign saved." };
}

/**
 * Seller: apply for one or more products to join the flash-deal campaign.
 * Products already having an open application are skipped.
 */
export async function requestFlashDeal(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAccess("products");
  const storeSlug =
    session.role === "seller" && session.store ? session.store : "sahra-fashion";

  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  if (productIds.length === 0) {
    return { ok: false, message: "Pick at least one product." };
  }

  const owned = (await getBaseProducts()).filter(
    (p) => productIds.includes(p.id) && p.store === storeSlug,
  );
  if (owned.length === 0) {
    return { ok: false, message: "You can only submit your own products." };
  }

  const pct = Math.min(90, Math.max(1, Number(formData.get("pct")) || 10));
  const note = String(formData.get("note") ?? "").trim() || undefined;
  const stamp = Date.now().toString(36);
  let added = 0;

  await mutateDB((db) => {
    owned.forEach((product, i) => {
      // One open application per product.
      if (db.flashRequests.some((r) => r.productId === product.id && r.status === "pending")) {
        return;
      }
      db.flashRequests.push({
        id: `fr-${stamp}-${i}`,
        store: storeSlug,
        productId: product.id,
        pct,
        note,
        status: "pending",
        date: new Date().toISOString().slice(0, 10),
      });
      added += 1;
    });
  });
  refresh();

  return added === 0
    ? { ok: false, message: "Those products already have open applications." }
    : {
        ok: true,
        message: `${added} application${added === 1 ? "" : "s"} submitted — our team will review them.`,
      };
}

/**
 * Admin decision on a seller's flash-deal application. Approving adds the
 * product to the campaign and creates the discount the seller offered.
 */
export async function decideFlashRequest(
  id: string,
  decision: "approved" | "rejected",
): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const request = db.flashRequests.find((r) => r.id === id);
    if (!request) return;
    request.status = decision;
    if (decision !== "approved") return;

    if (!db.flash.productIds.includes(request.productId)) {
      db.flash.productIds.push(request.productId);
    }
    db.promotions.push({
      id: "promo-flash-" + request.id,
      store: request.store,
      name: `${db.flash.name} — approved`,
      pct: request.pct,
      active: true,
      productIds: [request.productId],
    });
  });
  refresh();
}

export async function withdrawFlashRequest(id: string): Promise<void> {
  const session = await requireAccess("products");
  await mutateDB((db) => {
    const request = db.flashRequests.find((r) => r.id === id);
    if (!request) return;
    if (session.role !== "admin") assertOwnsStore(session, request.store);
    db.flashRequests = db.flashRequests.filter((r) => r.id !== id);
  });
  refresh();
}

// ── Admin Category Actions ─────────────────────────────────────────────

async function requireAdminSession(): Promise<Session> {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  return session;
}

/**
 * Validate a proposed parent for a category (Odoo `product.category.parent_id`).
 *
 * Rejects a cycle, because a category that is its own ancestor makes the
 * tree infinite: every walk up the parents — breadcrumbs, the navbar, the
 * "products in this branch" query — would never terminate.
 */
async function resolveParentCategory(
  submitted: string,
  ownSlug: string,
): Promise<string | null> {
  const parentSlug = submitted.trim();
  if (!parentSlug) return null;

  if (parentSlug === ownSlug) {
    throw new Error("A category cannot be its own parent.");
  }

  const { getCategories } = await import("@/lib/api");
  const categories = await getCategories(true);
  if (!categories.some((c) => c.slug === parentSlug)) {
    throw new Error(`"${parentSlug}" is not an existing category.`);
  }

  // Walk down from this category: meeting the proposed parent among our own
  // descendants means the link would close a loop.
  const descendants = await getCategoryWithDescendants(ownSlug);
  if (descendants.includes(parentSlug)) {
    throw new Error(
      `"${parentSlug}" sits below "${ownSlug}" already — filing it the other ` +
        `way round would make the category its own ancestor.`,
    );
  }

  return parentSlug;
}

export async function createCategory(formData: FormData): Promise<void> {
  await requireAdminSession();
  const name = String(formData.get("name") || "").trim();
  let slug = String(formData.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const icon = String(formData.get("icon") || "📦").trim() || "📦";
  const tagline = String(formData.get("tagline") || "").trim();

  if (!name) throw new Error("Category name is required.");
  if (!slug) {
    slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  }

  const parentSlug = await resolveParentCategory(
    String(formData.get("parentSlug") || ""),
    slug,
  );

  const category = {
    slug,
    name,
    icon,
    tagline,
    art: { from: "#e0f2fe", to: "#bae6fd" },
    hidden: false,
    // The Category type uses undefined for "no parent"; the mutation layer
    // needs null to actually CLEAR the column rather than leave it alone.
    parentSlug: parentSlug ?? undefined,
  };

  if (useSupabaseMutations()) {
    await upsertCategoryInSupabase({ ...category, parentSlug });
  } else {
    await mutateDB((db) => {
      db.categories = db.categories || [];
      const idx = db.categories.findIndex((c) => c.slug === slug);
      if (idx >= 0) db.categories[idx] = category;
      else db.categories.push(category);
    });
  }

  refresh();
}

export async function updateCategory(formData: FormData): Promise<void> {
  await requireAdminSession();
  const originalSlug = String(formData.get("originalSlug") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || originalSlug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const icon = String(formData.get("icon") || "📦").trim() || "📦";
  const tagline = String(formData.get("tagline") || "").trim();

  if (!name || !slug) throw new Error("Category name and slug are required.");

  const parentSlug = await resolveParentCategory(
    String(formData.get("parentSlug") || ""),
    originalSlug || slug,
  );

  const category = {
    slug,
    name,
    icon,
    tagline,
    art: { from: "#e0f2fe", to: "#bae6fd" },
    parentSlug: parentSlug ?? undefined,
  };

  if (useSupabaseMutations()) {
    await upsertCategoryInSupabase({ ...category, parentSlug });
  } else {
    await mutateDB((db) => {
      db.categories = db.categories || [];
      const idx = db.categories.findIndex((c) => c.slug === (originalSlug || slug));
      if (idx >= 0) db.categories[idx] = { ...db.categories[idx], ...category };
      else db.categories.push(category);
    });
  }

  refresh();
}

export async function toggleCategoryVisibility(slug: string): Promise<void> {
  await requireAdminSession();
  if (useSupabaseMutations()) {
    await toggleCategoryVisibilityInSupabase(slug);
  } else {
    await mutateDB((db) => {
      db.categories = db.categories || [];
      const cat = db.categories.find((c) => c.slug === slug);
      if (cat) cat.hidden = !cat.hidden;
    });
  }
  refresh();
}

export async function deleteCategory(slug: string): Promise<void> {
  await requireAdminSession();
  if (useSupabaseMutations()) {
    await deleteCategoryFromSupabase(slug);
  } else {
    await mutateDB((db) => {
      db.categories = (db.categories || []).filter((c) => c.slug !== slug);
    });
  }
  refresh();
}
