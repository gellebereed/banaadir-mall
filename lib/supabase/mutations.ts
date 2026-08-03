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
  Employee,
  EmployeeRole,
  MarketingSettings,
  Order,
  OrderStatus,
  Product,
  Promotion,
  Store,
} from "../types";

/** True when Supabase is available and mutations should go through it. */
export function useSupabaseMutations(): boolean {
  return isSupabaseConfigured();
}

// ── Products ───────────────────────────────────────────────────────────
// Actual columns: id, slug, name, store, category, price, compare_at,
//   rating, reviews_count, sold, in_stock, badge, description, specs,
//   images, variants, hidden, created_at

export async function upsertProduct(product: Product): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
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
      return false;
    }
    return true;
  } catch (err) {
    // A duplicate code is the seller's to fix — let the message reach them
    // instead of being flattened into "could not save".
    if (err instanceof CatalogCodeError) throw err;
    console.error("[Supabase Mutations] upsertProduct exception:", err);
    return false;
  }
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

    let { error } = await supabase.from("orders").upsert(row, { onConflict: "id" });

    // `timeline` arrived with migration-order-delivery.sql. On a database
    // without it the whole insert would fail — and a failed insert here
    // means the customer's order is silently lost at checkout. Retry
    // without it so the order always lands.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] orders is missing `timeline` — run " +
          "supabase/migration-order-delivery.sql. Saving the order without " +
          "its placed-at stamp.",
      );
      delete row.timeline;
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
// Actual columns: id, store, name, email, role, added_at

export async function insertEmployee(emp: {
  id: string;
  store: string;
  name: string;
  email: string;
  role: EmployeeRole;
}): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("employees").insert({
      id: emp.id,
      store: emp.store,
      name: emp.name,
      email: emp.email,
      role: emp.role,
    });
    if (error) {
      console.error("[Supabase Mutations] insertEmployee error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Mutations] insertEmployee exception:", err);
    return false;
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

// ── Categories ─────────────────────────────────────────────────────────

export async function upsertCategoryInSupabase(category: {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  hidden?: boolean;
  /** Odoo product.category.parent_id. Pass null to move it back to a root. */
  parentSlug?: string | null;
}): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();

    const row: Record<string, unknown> = {
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

    let { error } = await supabase.from("categories").upsert(row, { onConflict: "slug" });

    // parent_slug arrived with migration-odoo-catalog.sql — retry without it
    // so category edits still work on a database that hasn't been migrated.
    if (error && isMissingColumnError(error)) {
      console.warn(
        "[Supabase] categories is missing parent_slug — run " +
          "supabase/migration-odoo-catalog.sql. Saving without the parent link.",
      );
      delete row.parent_slug;
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
