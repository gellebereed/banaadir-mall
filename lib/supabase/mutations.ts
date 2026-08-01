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
    const { error } = await supabase.from("products").upsert(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        store: product.store,
        category: product.category,
        price: product.price,
        compare_at: product.compareAt ?? null,
        rating: product.rating ?? 5,
        reviews_count: product.reviewCount ?? 0,
        sold: product.sold ?? 0,
        in_stock: (product.stock ?? 0) > 0,
        badge: product.badge ?? null,
        description: product.description || "",
        specs: product.features?.map((f) => {
          const parts = f.split(":");
          return parts.length > 1
            ? { name: parts[0].trim(), value: parts.slice(1).join(":").trim() }
            : { name: f, value: "" };
        }) ?? [],
        hidden: product.hidden ?? false,
        images: product.images ?? [],
        variants: product.variants ?? [],
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("[Supabase Mutations] upsertProduct error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
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
] as const;

/** PostgREST reports an unknown column as PGRST204 / "column ... does not exist". */
function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? "")
  );
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

// ── Promotions ─────────────────────────────────────────────────────────
// Actual columns: id, store, name, pct, code, active, product_ids, created_at

export async function insertPromotion(promo: Promotion): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("promotions").insert({
      id: promo.id,
      store: promo.store,
      name: promo.name,
      pct: promo.pct,
      active: promo.active,
      product_ids: promo.productIds ?? [],
    });
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
    const { error } = await supabase.from("marketing_settings").upsert(
      {
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
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("[Supabase Mutations] updateMarketing error:", error.message);
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

    const { error } = await supabase.from("categories").upsert(row, { onConflict: "slug" });
    if (error) {
      console.error("[Supabase Mutations] upsertCategory error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
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
