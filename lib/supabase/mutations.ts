/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SUPABASE MUTATIONS — persistent writes for serverless environments.
 * ─────────────────────────────────────────────────────────────────────────
 * On local dev, mutations go to the JSON overlay (lib/db.ts).
 * On Netlify / Vercel, every Lambda invocation is stateless, so we write
 * directly to Supabase tables here instead.
 *
 * IMPORTANT: Column mappings match the ACTUAL Supabase schema. Only columns
 * that exist in the database are written. Additional Product/Store fields
 * (stock, icon, art, colors, sizes, defaultVariantId on products; icon,
 * followers, joinedYear, verified, official, category, art on stores)
 * are stored inside the JSONB fields or derived from existing columns.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "./server";
import { isSupabaseConfigured } from "./storage";
import type {
  CommissionSettings,
  Employee,
  EmployeeRole,
  EmployeeStatus,
  MarketingSettings,
  Permission,
  Order,
  OrderStatus,
  PosSettings,
  Product,
  ProductionRun,
  ProductReview,
  ProductStory,
  Promotion,
  Recipe,
  RecoSettings,
  Store,
  Supply,
  SupplyPurchase,
  Variant,
} from "../types";

/** True when Supabase is available and mutations should go through it. */
export function useSupabaseMutations(): boolean {
  return isSupabaseConfigured();
}

// ── Products ───────────────────────────────────────────────────────────
// Actual columns: id, slug, name, store, category, price, compare_at,
//   rating, reviews_count, sold, in_stock, badge, description, specs,
//   images, variants, hidden, created_at

/**
 * Save a product, returning WHY it failed rather than just that it did.
 *
 * The boolean-only `upsertProduct` below is what the hand-editing forms
 * use: they fall back to the JSON store on false, so the reason is only
 * ever logged. A bulk import cannot work that way — 104 products failing
 * for one reason must be able to state that reason once, instead of
 * printing a guess a hundred times.
 */
export async function upsertProductWithError(
  product: Product,
): Promise<{ ok: boolean; error?: string }> {
  if (!useSupabaseMutations()) return { ok: false };
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {
      id: product.id,
      slug: product.slug,
      name: product.name,
      store: product.store,
      category: product.category,
      subcategory: product.subcategory || null,
      // Odoo identity fields. NULL — never "" — because the unique indexes
      // are partial (`WHERE ... IS NOT NULL`): empty strings would all
      // collide with each other on the second product saved without a code.
      internal_reference: product.internalReference || null,
      barcode: product.barcode || null,
      uom: product.uom || "Units",
      price: product.price,
      compare_at: product.compareAt ?? null,
      // Supplier provenance (supabase/migration-supplier-import.sql).
      cost: product.cost ?? null,
      supplier_meta: product.supplier ?? null,
      rating: product.rating ?? 5,
      reviews_count: product.reviewCount ?? 0,
      sold: product.sold ?? 0,
      in_stock: (product.stock ?? 0) > 0,
      stock: Number(product.stock ?? 0),
      badge: product.badge ?? null,
      icon: product.icon || "🛍️",
      art: product.art || null,
      colors: product.colors ?? [],
      sizes: product.sizes ?? [],
      default_variant_id: product.defaultVariantId ?? null,
      description: product.description || "",
      features: product.features ?? [],
      specs: product.features?.map((f) => {
        const parts = f.split(":");
        return parts.length > 1
          ? { name: parts[0].trim(), value: parts.slice(1).join(":").trim() }
          : { name: f, value: "" };
      }) ?? [],
      hidden: product.hidden ?? false,
      images: product.images ?? [],
      variants: product.variants ?? [],
    };

    let { error } = await supabase.from("products").upsert(row, { onConflict: "id" });

    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] products table is missing newer columns — run supabase/migration.sql. " +
          "Saving core columns.",
      );
      const core = { ...row };
      for (const column of EXTENDED_PRODUCT_COLUMNS) delete core[column];
      ({ error } = await supabase.from("products").upsert(core, { onConflict: "id" }));
    }

    if (error) {
      assertNotConstraintViolation(error);
      console.error("[Supabase Mutations] upsertProduct error:", error.message);
      return { ok: false, error: describeWriteError(error) };
    }
    return { ok: true };
  } catch (err) {
    // A duplicate code is the seller's to fix — let the message reach them
    // instead of being flattened into "could not save".
    if (err instanceof CatalogCodeError) throw err;
    console.error("[Supabase Mutations] upsertProduct exception:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertProduct(product: Product): Promise<boolean> {
  return (await upsertProductWithError(product)).ok;
}

/**
 * Turn a Postgres error into something the person who caused it can act on.
 *
 * The FK case is the one that matters: "violates foreign key constraint
 * products_category_fkey" names the constraint, not the problem. A seller
 * needs to read "the category doesn't exist yet".
 */
function describeWriteError(error: { code?: string; message?: string; details?: string }): string {
  const details = error.details ?? "";

  if (error.code === "23503") {
    const missing = details.match(/Key \((\w+)\)=\(([^)]*)\) is not present in table "(\w+)"/);
    if (missing) {
      const [, column, value, table] = missing;
      return `The ${column} "${value}" does not exist in ${table} yet.`;
    }
    return `A value on this product refers to something that does not exist. ${details}`.trim();
  }

  if (error.code === "23502") {
    const column = details.match(/column "(\w+)"/)?.[1] ?? error.message?.match(/column "(\w+)"/)?.[1];
    return column
      ? `The database requires a value for "${column}" and none was supplied.`
      : (error.message ?? "The database rejected the write.");
  }

  return [error.message, details].filter(Boolean).join(" ").trim() || "The database rejected the write.";
}

/**
 * Columns added by supabase/migration.sql. If that migration hasn't been
 * run yet these don't exist, so a write including them fails wholesale —
 * we detect that and retry with the core columns rather than losing the
 * entire edit.
 */
const EXTENDED_PRODUCT_COLUMNS = [
  "stock",
  "icon",
  "art",
  "colors",
  "sizes",
  "default_variant_id",
  "features",
  "subcategory",
  // Added by supabase/migration-odoo-catalog.sql.
  "internal_reference",
  "barcode",
  "uom",
  // Added by supabase/migration-supplier-import.sql.
  "cost",
  "supplier_meta",
] as const;

/** Store columns added by supabase/migration.sql. */
const EXTENDED_STORE_COLUMNS = [
  "icon",
  "official",
  "verified",
  "category",
  "followers",
  "joined_year",
  "art",
  // Added by supabase/migration-vendor-whatsapp.sql.
  "whatsapp",
  // Added by supabase/migration-order-delivery.sql.
  "couriers",
] as const;

/** PostgREST reports an unknown column as PGRST204 / "column ... does not exist". */
function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "")
  );
}

/**
 * Constraint violations from supabase/migration-odoo-catalog.sql — a
 * duplicate barcode or internal reference, or a recursive category.
 *
 * These are the one class of database error the SELLER can fix, and the
 * trigger already phrases them as a sentence ("Barcode 869… already belongs
 * to another product"). Returning false here would surface the generic
 * "could not save" message and hide the only useful part, so they are
 * re-thrown and travel up to the form (see SafeForm).
 */
export class CatalogCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogCodeError";
  }
}

function assertNotConstraintViolation(error: { code?: string; message?: string }): void {
  const isUniqueOrCheck = error.code === "23505" || error.code === "23514";
  const mentionsCode = /barcode|internal reference|ancestor|own parent/i.test(
    error.message ?? "",
  );
  if (isUniqueOrCheck || mentionsCode) {
    throw new CatalogCodeError(
      error.message || "That code is already used by another product.",
    );
  }
}

/**
 * A product's photos as they are RIGHT NOW, straight from the row.
 *
 * Deliberately bypasses the cached catalogue read. A bulk photo upload
 * arrives as several requests, and each one merges its new photos onto
 * what is already there — so it has to see what the previous request
 * wrote. Reading the cached list instead means every batch merges onto the
 * state from before the upload started and overwrites the batch before it:
 * fourteen photos go up, three survive, and nothing reports a failure.
 */
export async function fetchProductPhotoState(
  id: string,
): Promise<{ images: string[]; variants: Variant[] } | null> {
  if (!useSupabaseMutations()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("images,variants")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return {
      images: Array.isArray(data.images) ? (data.images as string[]) : [],
      variants: Array.isArray(data.variants) ? (data.variants as Variant[]) : [],
    };
  } catch {
    return null;
  }
}

export async function updateProductFields(
  id: string,
  fields: Partial<Product>
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {};

    // ── Core columns (always present) ──────────────────────────────
    if (fields.name !== undefined) row.name = fields.name;
    if (fields.price !== undefined) row.price = fields.price;
    if (fields.compareAt !== undefined) row.compare_at = fields.compareAt ?? null;
    if (fields.category !== undefined) row.category = fields.category;
    if (fields.subcategory !== undefined) row.subcategory = fields.subcategory || null;
    if (fields.badge !== undefined) row.badge = fields.badge ?? null;
    if (fields.description !== undefined) row.description = fields.description;
    if (fields.hidden !== undefined) row.hidden = fields.hidden;
    if (fields.featured !== undefined) row.featured = fields.featured;
    if (fields.images !== undefined) row.images = fields.images;
    if (fields.variants !== undefined) row.variants = fields.variants ?? [];
    // Keep the legacy boolean in sync so old readers still behave.
    if (fields.stock !== undefined) row.in_stock = fields.stock > 0;

    // ── Extended columns (added by the migration) ──────────────────
    // Codes normalise "" → NULL so clearing one in the form really clears
    // it, rather than storing a blank that trips the unique index.
    if (fields.internalReference !== undefined) {
      row.internal_reference = fields.internalReference || null;
    }
    if (fields.barcode !== undefined) row.barcode = fields.barcode || null;
    if (fields.uom !== undefined) row.uom = fields.uom || "Units";
    if (fields.stock !== undefined) row.stock = fields.stock;
    if (fields.icon !== undefined) row.icon = fields.icon;
    if (fields.art !== undefined) row.art = fields.art;
    if (fields.colors !== undefined) row.colors = fields.colors ?? [];
    if (fields.sizes !== undefined) row.sizes = fields.sizes ?? [];
    if (fields.defaultVariantId !== undefined) {
      row.default_variant_id = fields.defaultVariantId ?? null;
    }
    if (fields.features !== undefined) row.features = fields.features;

    if (Object.keys(row).length === 0) return true;

    /**
     * `.select()` makes PostgREST return the rows it changed. Without it an
     * UPDATE whose filter matches nothing reports success while changing
     * nothing — a save that silently does nothing. We also retry on `slug`
     * because dashboard routes sometimes carry a slug where the table's
     * primary key is a separate id (e.g. "karaca-hatir-mod" vs "prod-1").
     */
    const runUpdate = async (payload: Record<string, unknown>) => {
      let res = await supabase.from("products").update(payload).eq("id", id).select("id");
      if (!res.error && (res.data?.length ?? 0) === 0) {
        res = await supabase.from("products").update(payload).eq("slug", id).select("id");
      }
      return res;
    };

    let { data, error } = await runUpdate(row);

    // Retry without the post-migration columns so the edit still lands.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] products is missing newer columns — run supabase/migration.sql. " +
          "Saving core fields only; stock/icon/colours/sizes/default variant will not persist.",
      );
      const core = { ...row };
      for (const column of EXTENDED_PRODUCT_COLUMNS) delete core[column];
      ({ data, error } = await runUpdate(core));
    }

    if (error) {
      assertNotConstraintViolation(error);
      console.error("[Supabase Mutations] updateProductFields error:", error.message);
      return false;
    }
    if ((data?.length ?? 0) === 0) {
      console.error(
        `[Supabase Mutations] updateProductFields matched no row for id/slug "${id}".`,
      );
      return false;
    }
    return true;
  } catch (err) {
    if (err instanceof CatalogCodeError) throw err;
    console.error("[Supabase Mutations] updateProductFields exception:", err);
    return false;
  }
}

export async function deleteProductFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] deleteProduct error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] deleteProduct exception:", err);
    return false;
  }
}

// ── Stores ─────────────────────────────────────────────────────────────
// Actual columns: id, slug, name, tagline, description, logo, banner,
//   rating, reviews_count, status, owner, location, created_at

export async function updateStoreFields(
  slug: string,
  fields: Partial<Store>
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {};
    if (fields.name !== undefined) row.name = fields.name;
    if (fields.tagline !== undefined) row.tagline = fields.tagline;
    if (fields.city !== undefined) row.location = fields.city;
    if (fields.logo !== undefined) row.logo = fields.logo ?? null;
    if (fields.banner !== undefined) row.banner = fields.banner ?? null;
    if (fields.status !== undefined) row.status = fields.status;
    // Added by supabase/migration.sql — dropped automatically on databases
    // that haven't been migrated yet (see the retry below).
    if (fields.icon !== undefined) row.icon = fields.icon;
    if (fields.official !== undefined) row.official = fields.official;
    if (fields.verified !== undefined) row.verified = fields.verified;
    if (fields.category !== undefined) row.category = fields.category;
    if (fields.followers !== undefined) row.followers = fields.followers;
    if (fields.joinedYear !== undefined) row.joined_year = fields.joinedYear;
    if (fields.art !== undefined) row.art = fields.art;
    // Kept in sync with `phone` so the older column stays truthful for
    // anything still reading it (and for a seller who only ever filled one).
    if (fields.whatsapp !== undefined) {
      row.whatsapp = fields.whatsapp || null;
      row.phone = fields.whatsapp || null;
    }
    if (fields.couriers !== undefined) row.couriers = fields.couriers ?? [];

    if (Object.keys(row).length === 0) return true;

    // `.select()` so an UPDATE that matches nothing is reported as a failure
    // rather than a silent no-op.
    let { data, error } = await supabase
      .from("stores").update(row).eq("slug", slug).select("slug");

    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] stores is missing newer columns — run supabase/migration.sql. " +
          "Saving core fields only.",
      );
      const core = { ...row };
      for (const column of EXTENDED_STORE_COLUMNS) delete core[column];
      ({ data, error } = await supabase
        .from("stores").update(core).eq("slug", slug).select("slug"));
    }

    if (error) {
      console.error("[Supabase Mutations] updateStoreFields error:", error.message);
      return false;
    }
    if ((data?.length ?? 0) === 0) {
      console.error(`[Supabase Mutations] updateStoreFields matched no store "${slug}".`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] updateStoreFields exception:", err);
    return false;
  }
}

export async function setStoreStatusInSupabase(
  slug: string,
  status: Store["status"]
): Promise<boolean> {
  return updateStoreFields(slug, { status });
}

// ── Orders ─────────────────────────────────────────────────────────────
// Actual columns: id, date, customer, email, phone, address, city,
//   store, total, items, status, created_at

export async function createOrderInSupabase(order: Order): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {
      id: order.id,
      date: order.date || new Date().toISOString().slice(0, 10),
      customer: order.customer,
      email: order.email || "",
      phone: order.phone || "",
      address: order.address || "",
      city: order.city || "",
      store: order.store,
      total: order.total,
      items: order.items || [],
      status: order.status || "pending",
      // Stamp the moment it was placed. Without this a new parcel starts
      // with an empty history and its "Order placed" step can only show the
      // date, losing the time the customer actually ordered.
      timeline: order.timeline ?? [
        { status: order.status || "pending", at: new Date().toISOString() },
      ],
    };

    // Only sent when they mean something, so an online order does not carry
    // a null `payment` column on a database that has never seen a till.
    if (order.channel) row.channel = order.channel;
    if (order.payment) row.payment = order.payment;

    let { error } = await supabase.from("orders").upsert(row, { onConflict: "id" });

    // `timeline` arrived with migration-order-delivery.sql, `channel` and
    // `payment` with migration-pos.sql. On a database without them the
    // whole insert would fail — and a failed insert here means the
    // customer's order is silently lost at checkout. Retry without the
    // optional columns so the order always lands.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] orders is missing `timeline`, `channel` or `payment` — run " +
          "supabase/migration-order-delivery.sql and supabase/migration-pos.sql. " +
          "Saving the order without them.",
      );
      delete row.timeline;
      delete row.channel;
      delete row.payment;
      ({ error } = await supabase.from("orders").upsert(row, { onConflict: "id" }));
    }

    if (error) {
      console.error("[Supabase Mutations] createOrderInSupabase error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] createOrderInSupabase exception:", err);
    return false;
  }
}

export async function setOrderStatusInSupabase(
  orderId: string,
  status: OrderStatus
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);
    if (error) {
      console.error("[Supabase Mutations] setOrderStatus error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] setOrderStatus exception:", err);
    return false;
  }
}

/**
 * Mark parcels as seen by the seller — what clears the unread badge.
 *
 * Only ever stamps rows that are still NULL, so re-opening the orders page
 * doesn't keep moving the timestamp and lose when they were first seen.
 */
export async function markOrdersSeenInSupabase(orderIds: string[]): Promise<boolean> {
  if (!useSupabaseMutations() || orderIds.length === 0) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update({ seen_at: new Date().toISOString() })
      .in("id", orderIds)
      .is("seen_at", null);

    if (error) {
      // Pre-migration the column doesn't exist. Nothing is broken — there
      // is simply no badge to clear — so don't shout about it.
      if (isMissingColumnError(error)) return false;
      console.error("[Supabase Mutations] markOrdersSeen error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] markOrdersSeen exception:", err);
    return false;
  }
}

/**
 * Status, courier and timeline in ONE write.
 *
 * These three always change together — a parcel becomes "shipped" *because*
 * it was handed to a driver, at a particular moment. Writing them
 * separately leaves windows where a parcel is shipped with no contact, or
 * has a driver but still reads as being packed.
 */
export async function updateOrderDeliveryInSupabase(
  orderId: string,
  fields: Partial<Pick<Order, "status" | "delivery" | "timeline">>,
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {};
    if (fields.status !== undefined) row.status = fields.status;
    if (fields.delivery !== undefined) row.delivery = fields.delivery ?? null;
    if (fields.timeline !== undefined) row.timeline = fields.timeline ?? [];
    if (Object.keys(row).length === 0) return true;

    let { data, error } = await supabase
      .from("orders").update(row).eq("id", orderId).select("id");

    // delivery/timeline arrived with migration-order-delivery.sql — retry
    // with just the status so the seller's update still lands.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] orders is missing delivery/timeline — run " +
          "supabase/migration-order-delivery.sql. Saving the status only; " +
          "courier details will NOT persist.",
      );
      ({ data, error } = await supabase
        .from("orders").update({ status: fields.status }).eq("id", orderId).select("id"));
    }

    if (error) {
      console.error("[Supabase Mutations] updateOrderDelivery error:", error.message);
      return false;
    }
    if ((data?.length ?? 0) === 0) {
      console.error(`[Supabase Mutations] updateOrderDelivery matched no order "${orderId}".`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] updateOrderDelivery exception:", err);
    return false;
  }
}

// ── Promotions ─────────────────────────────────────────────────────────
// Actual columns: id, store, name, pct, code, active, product_ids, created_at

export async function insertPromotion(promo: Promotion): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {
      id: promo.id,
      store: promo.store,
      name: promo.name,
      pct: promo.pct,
      active: promo.active,
      product_ids: promo.productIds ?? [],
      starts_at: promo.startsAt ?? null,
      ends_at: promo.endsAt ?? null,
    };

    let { error } = await supabase.from("promotions").insert(row);

    // The schedule columns arrived later — retry without them so creating a
    // promotion still works on a database that hasn't been migrated.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] promotions is missing starts_at/ends_at — run " +
          "supabase/migration-promotion-schedule.sql. Saving without a schedule.",
      );
      delete row.starts_at;
      delete row.ends_at;
      ({ error } = await supabase.from("promotions").insert(row));
    }

    if (error) {
      console.error("[Supabase Mutations] insertPromotion error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] insertPromotion exception:", err);
    return false;
  }
}

export async function togglePromotionInSupabase(
  id: string,
  active: boolean
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("promotions")
      .update({ active })
      .eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] togglePromotion error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] togglePromotion exception:", err);
    return false;
  }
}

export async function deletePromotionFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] deletePromotion error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] deletePromotion exception:", err);
    return false;
  }
}

// ── Employees ──────────────────────────────────────────────────────────
// Base columns: id, store, name, email, role, added_at
// Added by supabase/migration-employee-permissions.sql:
//   permissions, status, invite_token, invited_at, accepted_at

/**
 * Does this PostgREST error mean the column simply isn't there yet?
 *
 * The invitation columns arrive in a migration the operator applies by
 * hand. Between deploying this code and running that SQL, an insert
 * carrying those columns is rejected outright — and losing the whole
 * employee because the optional half of the row could not be stored is a
 * far worse outcome than storing the half that fits. So the writers below
 * fall back to the base columns and log what was dropped.
 */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "")
  );
}

/** Columns that exist only after the invitation migration. */
type EmployeeExtras = Partial<{
  permissions: Permission[] | null;
  status: EmployeeStatus;
  invite_token: string | null;
  invited_at: string | null;
  accepted_at: string | null;
}>;

export async function insertEmployee(emp: {
  id: string;
  store: string;
  name: string;
  email: string;
  role: EmployeeRole;
  permissions?: Permission[];
  status?: EmployeeStatus;
  inviteToken?: string;
  invitedAt?: string;
}): Promise<EmployeeWriteResult> {
  if (!useSupabaseMutations()) return { ok: false, droppedColumns: false };

  const base = {
    id: emp.id,
    store: emp.store,
    name: emp.name,
    email: emp.email,
    role: emp.role,
  };
  const extras: EmployeeExtras = {
    permissions: emp.permissions ?? null,
    status: emp.status ?? "pending",
    invite_token: emp.inviteToken ?? null,
    invited_at: emp.invitedAt ?? null,
  };

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("employees").insert({ ...base, ...extras });
    if (!error) return { ok: true, droppedColumns: false };

    if (!isMissingColumn(error)) {
      console.error("[Supabase Mutations] insertEmployee error:", error.message);
      return { ok: false, droppedColumns: false };
    }

    console.warn(
      "[Supabase Mutations] employees table is missing the invitation columns — " +
        "storing name/email/role only. Apply supabase/migration-employee-permissions.sql.",
    );
    const retry = await supabase.from("employees").insert(base);
    if (retry.error) {
      console.error("[Supabase Mutations] insertEmployee error:", retry.error.message);
      return { ok: false, droppedColumns: true };
    }
    return { ok: true, droppedColumns: true };
  } catch (err) {
    console.error("[Supabase Mutations] insertEmployee exception:", err);
    return { ok: false, droppedColumns: false };
  }
}

export interface EmployeeUpdate {
  name?: string;
  role?: EmployeeRole;
  permissions?: Permission[] | null;
  status?: EmployeeStatus;
  inviteToken?: string | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
}

/**
 * The outcome of an employee write, in enough detail to tell the truth
 * about it.
 *
 * `ok` alone cannot: a write that stored the role and dropped the
 * permissions because the column does not exist is neither a success nor a
 * failure, and reporting it as either misleads whoever pressed the button.
 * `droppedColumns` is what lets the caller say "saved, but the permissions
 * need that migration".
 */
export interface EmployeeWriteResult {
  ok: boolean;
  droppedColumns: boolean;
}

/**
 * Change an existing employee: their role, their exact grants, or where
 * they are in the invitation flow. Only the fields passed are touched.
 */
export async function updateEmployeeInSupabase(
  id: string,
  changes: EmployeeUpdate,
): Promise<EmployeeWriteResult> {
  if (!useSupabaseMutations()) return { ok: false, droppedColumns: false };

  const base: Record<string, unknown> = {};
  if (changes.name !== undefined) base.name = changes.name;
  if (changes.role !== undefined) base.role = changes.role;

  const extras: EmployeeExtras = {};
  if (changes.permissions !== undefined) extras.permissions = changes.permissions;
  if (changes.status !== undefined) extras.status = changes.status;
  if (changes.inviteToken !== undefined) extras.invite_token = changes.inviteToken;
  if (changes.invitedAt !== undefined) extras.invited_at = changes.invitedAt;
  if (changes.acceptedAt !== undefined) extras.accepted_at = changes.acceptedAt;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("employees")
      .update({ ...base, ...extras })
      .eq("id", id);
    if (!error) return { ok: true, droppedColumns: false };

    if (!isMissingColumn(error)) {
      console.error("[Supabase Mutations] updateEmployee error:", error.message);
      return { ok: false, droppedColumns: false };
    }

    // Nothing left to write once the missing columns are removed, so there
    // is no half-measure to fall back to — this write did not happen.
    if (Object.keys(base).length === 0) return { ok: false, droppedColumns: true };

    const retry = await supabase.from("employees").update(base).eq("id", id);
    if (retry.error) {
      console.error("[Supabase Mutations] updateEmployee error:", retry.error.message);
      return { ok: false, droppedColumns: true };
    }
    return { ok: true, droppedColumns: true };
  } catch (err) {
    console.error("[Supabase Mutations] updateEmployee exception:", err);
    return { ok: false, droppedColumns: false };
  }
}

export async function deleteEmployeeFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] deleteEmployee error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] deleteEmployee exception:", err);
    return false;
  }
}

// ── Marketing Settings ─────────────────────────────────────────────────
// Actual columns: id, announcement, hero_badge, hero_title_top,
//   hero_title_highlight, hero_subtitle, sections, banners,
//   promo_tiles, campaign

export async function updateMarketingInSupabase(
  settings: MarketingSettings
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const fullPayload = {
      id: 1,
      announcement: settings.announcement,
      announcement_bg_color: settings.announcementBgColor,
      announcement_text_color: settings.announcementTextColor,
      announcement_scroll: settings.announcementScroll,
      announcement_speed: settings.announcementSpeed,
      hero_badge: settings.heroBadge,
      hero_title_top: settings.heroTitleTop,
      hero_title_highlight: settings.heroTitleHighlight,
      hero_subtitle: settings.heroSubtitle,
      sections: settings.sections,
      banners: settings.banners,
      promo_tiles: settings.promoTiles,
      campaign: settings.campaign,
      delivery: settings.delivery,
      promo: settings.promo,
    };

    const { error } = await supabase.from("marketing_settings").upsert(
      fullPayload,
      { onConflict: "id" }
    );
    if (!error) return true;

    console.warn("[Supabase Mutations] updateMarketing full upsert failed, retrying base fields:", error.message);

    // Fallback if optional announcement styling columns don't exist in schema
    const fallbackPayload = {
      id: 1,
      announcement: settings.announcement,
      hero_badge: settings.heroBadge,
      hero_title_top: settings.heroTitleTop,
      hero_title_highlight: settings.heroTitleHighlight,
      hero_subtitle: settings.heroSubtitle,
      sections: settings.sections,
      banners: settings.banners,
      promo_tiles: settings.promoTiles,
      campaign: settings.campaign,
      delivery: settings.delivery,
      promo: settings.promo,
    };

    const { error: fallbackErr } = await supabase.from("marketing_settings").upsert(
      fallbackPayload,
      { onConflict: "id" }
    );
    if (fallbackErr) {
      console.error("[Supabase Mutations] updateMarketing fallback error:", fallbackErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] updateMarketing exception:", err);
    return false;
  }
}

/**
 * Save the commission settings, and ONLY those.
 *
 * ── Why this is not part of updateMarketingInSupabase ────────────────────
 * Two reasons, both about not losing someone's work.
 *
 * The marketing writer sends the whole record, so an admin saving the home
 * page carousel would also write back whatever commission they last read —
 * clobbering a rate someone changed in the meantime. Writing one column
 * makes the two screens independent.
 *
 * And it can say what happened. `marketing_settings.commission` does not
 * exist until supabase/migration-commission.sql has been run, and the
 * marketing writer's response to an unknown column is to retry without it —
 * which for commission would mean reporting a successful save of settings
 * that went nowhere. Money settings do not get to fail quietly.
 */
export async function updateCommissionInSupabase(
  commission: CommissionSettings,
): Promise<{ ok: boolean; migrationRequired: boolean }> {
  if (!useSupabaseMutations()) return { ok: false, migrationRequired: false };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("marketing_settings")
      .upsert({ id: 1, commission }, { onConflict: "id" });

    if (!error) return { ok: true, migrationRequired: false };

    if (isMissingColumnError(error)) {
      console.warn(
        "[Supabase] marketing_settings has no `commission` column — " +
          "run supabase/migration-commission.sql.",
      );
      return { ok: false, migrationRequired: true };
    }

    console.error("[Supabase Mutations] updateCommission error:", error.message);
    return { ok: false, migrationRequired: false };
  } catch (err) {
    console.error("[Supabase Mutations] updateCommission exception:", err);
    return { ok: false, migrationRequired: false };
  }
}

// ── Point of sale ──────────────────────────────────────────────────────
//
// Every writer here returns a plain boolean and logs the reason, matching
// the rest of this module. The one thing they must never do is report
// success for a write that did not land — a pantry that says it has 25 kg
// of flour it does not have is worse than no pantry at all.

/** Turn the counter on or off, and save its pricing preferences. */
export async function updatePosSettingsInSupabase(
  storeSlug: string,
  pos: PosSettings,
): Promise<{ ok: boolean; migrationRequired: boolean }> {
  if (!useSupabaseMutations()) return { ok: false, migrationRequired: false };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stores")
      .update({ pos })
      .eq("slug", storeSlug)
      .select("slug");

    if (error) {
      if (isMissingColumnError(error)) {
        console.warn("[Supabase] stores has no `pos` column — run supabase/migration-pos.sql.");
        return { ok: false, migrationRequired: true };
      }
      console.error("[Supabase Mutations] updatePosSettings error:", error.message);
      return { ok: false, migrationRequired: false };
    }
    return { ok: (data?.length ?? 0) > 0, migrationRequired: false };
  } catch (err) {
    console.error("[Supabase Mutations] updatePosSettings exception:", err);
    return { ok: false, migrationRequired: false };
  }
}

export async function upsertSupplyInSupabase(supply: Supply): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("supplies").upsert(
      {
        id: supply.id,
        store: supply.store,
        name: supply.name,
        unit: supply.unit,
        stock: supply.stock,
        unit_cost: supply.unitCost,
        low_at: supply.lowAt ?? null,
        icon: supply.icon ?? null,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[Supabase Mutations] upsertSupply error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] upsertSupply exception:", err);
    return false;
  }
}

export async function deleteSupplyFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("supplies").delete().eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] deleteSupply error:", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function insertSupplyPurchaseInSupabase(
  purchase: SupplyPurchase,
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("supply_purchases").insert({
      id: purchase.id,
      store: purchase.store,
      supply_id: purchase.supplyId,
      qty: purchase.qty,
      total_cost: purchase.totalCost,
      date: purchase.date,
      note: purchase.note ?? null,
    });
    if (error) {
      console.error("[Supabase Mutations] insertSupplyPurchase error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] insertSupplyPurchase exception:", err);
    return false;
  }
}

export async function upsertRecipeInSupabase(recipe: Recipe): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("recipes").upsert(
      {
        id: recipe.id,
        store: recipe.store,
        product_id: recipe.productId,
        name: recipe.name,
        items: recipe.items,
        yield_qty: recipe.yield,
        overhead: recipe.overhead ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[Supabase Mutations] upsertRecipe error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] upsertRecipe exception:", err);
    return false;
  }
}

export async function deleteRecipeFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] deleteRecipe error:", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function insertProductionRunInSupabase(run: ProductionRun): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("production_runs").insert({
      id: run.id,
      store: run.store,
      recipe_id: run.recipeId,
      batches: run.batches,
      made_qty: run.madeQty,
      unit_cost: run.unitCost,
      date: run.date,
    });
    if (error) {
      console.error("[Supabase Mutations] insertProductionRun error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] insertProductionRun exception:", err);
    return false;
  }
}

/**
 * Move several supplies' stock at once, after a batch is made.
 *
 * ── Not a transaction, and what that costs ───────────────────────────────
 * PostgREST has no multi-statement transaction, so five ingredients are
 * five UPDATEs. If the third fails, the first two have already moved. The
 * failure is REPORTED with the names that did not land rather than
 * swallowed, so the owner can correct the pantry by hand — which is
 * recoverable, unlike a silent partial write they never hear about.
 *
 * The proper fix is a Postgres function called over RPC, and that is the
 * thing to do the day this stops being a single kitchen per shop.
 */
export async function applyStockMovesInSupabase(
  moves: { supplyId: string; stock: number }[],
): Promise<{ ok: boolean; failed: string[] }> {
  if (!useSupabaseMutations()) return { ok: false, failed: [] };
  const failed: string[] = [];
  try {
    const supabase = await createClient();
    for (const move of moves) {
      const { error } = await supabase
        .from("supplies")
        .update({ stock: move.stock })
        .eq("id", move.supplyId);
      if (error) {
        console.error("[Supabase Mutations] stock move failed:", move.supplyId, error.message);
        failed.push(move.supplyId);
      }
    }
    return { ok: failed.length === 0, failed };
  } catch (err) {
    console.error("[Supabase Mutations] applyStockMoves exception:", err);
    return { ok: false, failed: moves.map((m) => m.supplyId) };
  }
}

// ── Categories ─────────────────────────────────────────────────────────

export async function upsertCategoryInSupabase(category: {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  hidden?: boolean;
  /** Cover photo. Pass null to clear it and fall back to the emoji glyph. */
  image?: string | null;
  /** Odoo product.category.parent_id. Pass null to move it back to a root. */
  parentSlug?: string | null;
}): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();

    // `categories.id` is a TEXT primary key with NO default (schema.sql), so
    // an insert that omits it is rejected outright with a not-null violation.
    // Because this is an upsert keyed on slug, that only ever bit when a
    // category was NEW — every EDIT worked, which is why creating a category
    // appeared to succeed and then silently didn't exist.
    //
    // The existing id is reused when the row is already there: ids follow a
    // "cat-<slug>" convention but are not derivable from the slug in every
    // case (one seeded row is "cat-7"), and rewriting a primary key on an
    // ordinary edit is not something a save should ever do.
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", category.slug)
      .maybeSingle();

    const row: Record<string, unknown> = {
      id: existing?.id ?? `cat-${category.slug}`,
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      description: category.hidden ? `[HIDDEN] ${category.tagline}` : category.tagline,
    };

    if (typeof category.hidden === "boolean") {
      row.hidden = category.hidden;
    }
    // `undefined` means "don't touch the parent"; null means "make it a root".
    if (category.parentSlug !== undefined) {
      row.parent_slug = category.parentSlug || null;
    }
    // Same convention for the cover photo: undefined leaves it alone, so
    // editing a category's name can never silently drop its artwork.
    if (category.image !== undefined) {
      row.image = category.image || null;
    }

    let { error } = await supabase.from("categories").upsert(row, { onConflict: "slug" });

    // parent_slug arrived with migration-odoo-catalog.sql and image with
    // migration-category-images.sql — retry without whichever is missing so
    // category edits still work on a database that hasn't been migrated.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] categories is missing parent_slug or image — run " +
          "supabase/migration-odoo-catalog.sql and " +
          "supabase/migration-category-images.sql. Saving the rest.",
      );
      delete row.parent_slug;
      delete row.image;
      ({ error } = await supabase.from("categories").upsert(row, { onConflict: "slug" }));
    }

    if (error) {
      assertNotConstraintViolation(error);
      console.error("[Supabase Mutations] upsertCategory error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    if (err instanceof CatalogCodeError) throw err;
    console.error("[Supabase Mutations] upsertCategory exception:", err);
    return false;
  }
}

export async function deleteCategoryFromSupabase(slug: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("categories").delete().eq("slug", slug);
    if (error) {
      console.error("[Supabase Mutations] deleteCategory error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] deleteCategory exception:", err);
    return false;
  }
}

export async function toggleCategoryVisibilityInSupabase(slug: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { data: existing } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
    if (!existing) return false;

    const currentlyHidden = Boolean(existing.hidden) || String(existing.description || "").startsWith("[HIDDEN]");
    const newHidden = !currentlyHidden;
    const cleanTagline = String(existing.description || "").replace(/^\[HIDDEN\]\s*/, "");

    const updatePayload: Record<string, unknown> = {
      description: newHidden ? `[HIDDEN] ${cleanTagline}` : cleanTagline,
      hidden: newHidden,
    };

    const { error } = await supabase.from("categories").update(updatePayload).eq("slug", slug);
    if (error) {
      const { error: fbErr } = await supabase
        .from("categories")
        .update({ description: newHidden ? `[HIDDEN] ${cleanTagline}` : cleanTagline })
        .eq("slug", slug);
      if (fbErr) {
        console.error("[Supabase Mutations] toggleCategoryVisibility error:", fbErr.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] toggleCategoryVisibility exception:", err);
    return false;
  }
}

// ── Discovery: reco settings, stories, reviews ─────────────────────────

export async function updateRecoSettingsInSupabase(
  settings: RecoSettings,
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("reco_settings").upsert(
      {
        id: 1,
        enabled: settings.enabled,
        pin_strength: settings.pinStrength,
        shelves: settings.shelves,
        pins: settings.pins,
        blocked: settings.blocked,
        prompts: settings.prompts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      // A missing table is the expected case before the discovery migration
      // has been run — the JSON overlay keeps the change, so this is a
      // warning rather than a failure.
      console.warn("[Supabase Mutations] updateRecoSettings:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] updateRecoSettings exception:", err);
    return false;
  }
}

export async function upsertStoryInSupabase(story: ProductStory): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("product_stories").upsert(
      {
        id: story.id,
        title: story.title,
        subtitle: story.subtitle ?? null,
        kind: story.kind,
        product_ids: story.productIds,
        category_slugs: story.categorySlugs ?? [],
        store: story.store ?? null,
        video_url: story.videoUrl ?? null,
        poster: story.poster ?? null,
        hero_image: story.heroImage ?? null,
        chapters: story.chapters,
        gallery: story.gallery ?? [],
        duration: story.duration ?? null,
        published: story.published,
        updated_at: story.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("[Supabase Mutations] upsertStory:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] upsertStory exception:", err);
    return false;
  }
}

export async function deleteStoryFromSupabase(id: string): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("product_stories").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function upsertReviewInSupabase(review: ProductReview): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("product_reviews").upsert(
      {
        id: review.id,
        product_id: review.productId,
        author: review.author,
        rating: review.rating,
        text: review.text ?? null,
        order_id: review.orderId ?? null,
        verified: review.verified ?? false,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("[Supabase Mutations] upsertReview:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] upsertReview exception:", err);
    return false;
  }
}
