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

export async function updateProductFields(
  id: string,
  fields: Partial<Product>
): Promise<boolean> {
  if (!useSupabaseMutations()) return false;
  try {
    const supabase = await createClient();
    // Map camelCase fields to snake_case columns (only existing columns)
    const row: Record<string, unknown> = {};
    if (fields.name !== undefined) row.name = fields.name;
    if (fields.price !== undefined) row.price = fields.price;
    if (fields.compareAt !== undefined) row.compare_at = fields.compareAt ?? null;
    if (fields.stock !== undefined) {
      // 'stock' column doesn't exist; map to in_stock boolean
      row.in_stock = fields.stock > 0;
    }
    if (fields.category !== undefined) row.category = fields.category;
    if (fields.badge !== undefined) row.badge = fields.badge ?? null;
    if (fields.description !== undefined) row.description = fields.description;
    if (fields.features !== undefined) {
      row.specs = fields.features.map((f) => {
        const parts = f.split(":");
        return parts.length > 1
          ? { name: parts[0].trim(), value: parts.slice(1).join(":").trim() }
          : { name: f, value: "" };
      });
    }
    if (fields.hidden !== undefined) row.hidden = fields.hidden;
    if (fields.images !== undefined) row.images = fields.images;
    if (fields.variants !== undefined) row.variants = fields.variants;
    // Note: icon, art, colors, sizes, default_variant_id columns don't exist in DB
    // They are handled by the read layer in db-api.ts

    if (Object.keys(row).length === 0) return true;

    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) {
      console.error("[Supabase Mutations] updateProductFields error:", error.message);
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
    // Note: icon, followers, joinedYear, verified, official, category, art
    // columns don't exist in the stores table

    if (Object.keys(row).length === 0) return true;

    const { error } = await supabase.from("stores").update(row).eq("slug", slug);
    if (error) {
      console.error("[Supabase Mutations] updateStoreFields error:", error.message);
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
