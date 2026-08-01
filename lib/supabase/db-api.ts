import { createClient } from "./server";
import type { Category, Employee, MarketingSettings, Order, Product, Promotion, Store } from "../types";
import { isSupabaseConfigured } from "./storage";

export { isSupabaseConfigured };

const DEFAULT_ART = { from: "from-blue-500", to: "to-cyan-400" };

export async function fetchStoresFromSupabase(): Promise<Store[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("stores").select("*");
    if (error || !data || data.length === 0) return null;
    return data.map((s) => ({
      slug: s.slug,
      name: s.name,
      icon: s.logo ? "" : "🛍️",
      tagline: s.tagline || "",
      city: s.location || "Mogadishu",
      category: s.category || "general",
      rating: Number(s.rating || 0),
      reviewCount: s.reviews_count || 0,
      followers: s.followers || 100,
      joinedYear: s.joined_year || 2026,
      verified: s.verified ?? true,
      official: s.official ?? false,
      status: (s.status || "active") as Store["status"],
      art: s.art || DEFAULT_ART,
      logo: s.logo || undefined,
      banner: s.banner || undefined,
    }));
  } catch {
    return null;
  }
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("categories").select("*");
    if (error || !data || data.length === 0) return null;
    return data.map((c) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon || "📦",
      tagline: c.description || "",
      art: c.art || DEFAULT_ART,
    }));
  } catch {
    return null;
  }
}

export async function fetchProductsFromSupabase(): Promise<Product[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("products").select("*");
    if (error || !data || data.length === 0) return null;
    return data.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      store: p.store,
      category: p.category,
      price: Number(p.price),
      compareAt: p.compare_at ? Number(p.compare_at) : undefined,
      icon: p.icon || "🛍️",
      art: p.art || DEFAULT_ART,
      rating: Number(p.rating || 0),
      reviewCount: p.reviews_count || 0,
      sold: p.sold || 0,
      stock: p.in_stock ? 50 : 0,
      badge: p.badge || undefined,
      colors: p.colors || [],
      sizes: p.sizes || [],
      description: p.description || "",
      features: p.specs ? p.specs.map((s: { name: string; value: string }) => `${s.name}: ${s.value}`) : [],
      hidden: p.hidden ?? false,
      images: p.images || [],
      variants: p.variants || [],
      defaultVariantId: p.default_variant_id || undefined,
    }));
  } catch {
    return null;
  }
}

export async function fetchOrdersFromSupabase(): Promise<Order[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("orders").select("*");
    if (error || !data || data.length === 0) return null;
    return data.map((o) => ({
      id: o.id,
      date: o.date,
      customer: o.customer,
      email: o.email || "",
      phone: o.phone || "",
      address: o.address || "",
      city: o.city || "",
      store: o.store,
      total: Number(o.total),
      items: o.items || [],
      status: o.status as Order["status"],
    }));
  } catch {
    return null;
  }
}

export async function fetchPromotionsFromSupabase(): Promise<Promotion[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("promotions").select("*");
    if (error || !data) return null;
    return data.map((p) => ({
      id: p.id,
      store: p.store,
      name: p.name,
      pct: p.pct,
      code: p.code || undefined,
      active: p.active ?? true,
      productIds: p.product_ids || undefined,
    }));
  } catch {
    return null;
  }
}

export async function fetchEmployeesFromSupabase(): Promise<Employee[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("employees").select("*");
    if (error || !data) return null;
    return data.map((e) => ({
      id: e.id,
      store: e.store,
      name: e.name,
      email: e.email,
      role: e.role as Employee["role"],
      addedAt: e.added_at || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

export async function fetchMarketingFromSupabase(): Promise<MarketingSettings | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("marketing_settings").select("*").eq("id", 1).single();
    if (error || !data) return null;
    return {
      announcement: data.announcement,
      heroBadge: data.hero_badge,
      heroTitleTop: data.hero_title_top,
      heroTitleHighlight: data.hero_title_highlight,
      heroSubtitle: data.hero_subtitle,
      sections: data.sections || [],
      banners: data.banners || [],
      promoTiles: data.promo_tiles || [],
      campaign: data.campaign || { active: false, name: "Eid Mega Sale", pct: 10 },
    };
  } catch {
    return null;
  }
}
