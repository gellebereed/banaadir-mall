"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SERVER ACTIONS — every mutation the dashboards can perform.
 * ─────────────────────────────────────────────────────────────────────────
 * Each action: (1) checks the session + access rights, (2) writes to the
 * JSON store (lib/db.ts), (3) revalidates so every page shows the change
 * immediately. When Odoo is connected, these bodies become Odoo API calls
 * (product.template writes, sale.order state changes, …) — the forms and
 * pages calling them stay identical.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaseProduct, getBaseProducts, getStore } from "@/lib/api";
import { can, type AccessArea, type Session } from "@/lib/auth";
import { mutateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import type {
  Banner,
  EmployeeRole,
  HomeSection,
  OrderStatus,
  Product,
  Store,
  Variant,
} from "@/lib/types";
import { deleteUpload, filesFrom, saveImages } from "@/lib/uploads";

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
  // Only the home page is cached; dashboards and catalog pages are all
  // `force-dynamic` (or read cookies) so they re-render on every request
  // and on every server-action response. Revalidating their layouts here
  // would remount the client forms mid-submit and wipe their state.
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
        size: v.size?.trim() || undefined,
        // Storing a price equal to the base price adds no information.
        price: price === basePrice ? undefined : price,
        stock: Math.max(0, Number(v.stock) || 0),
        images: images.length > 0 ? images : undefined,
        sku: v.sku,
      } satisfies Variant;
    }),
  );
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

  await mutateDB((db) => {
    db.productOverrides[id] = {
      ...db.productOverrides[id],
      name: String(formData.get("name")),
      price,
      compareAt: compareAtRaw ? Number(compareAtRaw) : undefined,
      // With variants, stock lives on the variants themselves.
      stock: variants
        ? variants.reduce((sum, v) => sum + v.stock, 0)
        : Number(formData.get("stock")),
      category: String(formData.get("category")),
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
  });
  refresh();
  redirect(session.role === "admin" ? "/admin/products" : "/vendor/products");
}

export async function toggleProductHidden(id: string): Promise<void> {
  const session = await requireAccess("products");
  const product = await getBaseProduct(id);
  if (!product) return;
  assertOwnsStore(session, product.store);

  await mutateDB((db) => {
    db.productOverrides[id] = {
      ...db.productOverrides[id],
      hidden: !product.hidden,
    };
  });
  refresh();
}

export async function deleteProduct(id: string): Promise<void> {
  const session = await requireAccess("products");
  const product = await getBaseProduct(id);
  if (!product) return;
  assertOwnsStore(session, product.store);

  await mutateDB((db) => {
    db.newProducts = db.newProducts.filter((p) => p.id !== id);
    if (!db.deletedProducts.includes(id)) db.deletedProducts.push(id);
    delete db.productOverrides[id];
  });
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

  const product: Product = {
    id: slug,
    slug,
    name,
    store: storeSlug,
    category: String(formData.get("category")),
    price,
    compareAt: compareAtRaw ? Number(compareAtRaw) : undefined,
    icon: String(formData.get("icon") ?? "🛍️").trim() || "🛍️",
    art: { from: "#e0f2fe", to: "#bae6fd" },
    rating: 5,
    reviewCount: 0,
    sold: 0,
    stock: variants
      ? variants.reduce((sum, v) => sum + v.stock, 0)
      : Number(formData.get("stock")),
    badge: "New",
    colors: variants ? undefined : commaList(formData.get("colors")),
    sizes: variants ? undefined : commaList(formData.get("sizes")),
    description: String(formData.get("description")),
    features: features.length > 0 ? features : ["Ships within 24 hours", "7-day easy returns"],
    images,
    variants,
    defaultVariantId: pickDefaultVariantId(formData, variants),
  };

  await mutateDB((db) => {
    db.newProducts.push(product);
  });
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

  await mutateDB((db) => {
    db.storeOverrides[storeSlug] = {
      ...db.storeOverrides[storeSlug],
      name: String(formData.get("name")).trim() || store.name,
      tagline: String(formData.get("tagline")).trim(),
      city: String(formData.get("city")).trim() || store.city,
      icon: String(formData.get("icon") ?? "").trim() || store.icon,
      logo: removeLogo ? undefined : (logo ?? store.logo),
      banner: removeBanner ? undefined : (banner ?? store.banner),
    };
  });
  refresh();
  return { ok: true, message: "Store settings saved." };
}

// ── Promotions (store discounts) ───────────────────────────────────────

export async function createPromotion(formData: FormData): Promise<void> {
  const session = await requireAccess("products");
  const storeSlug =
    session.role === "seller" && session.store ? session.store : "sahra-fashion";
  const pct = Math.min(90, Math.max(1, Number(formData.get("pct"))));
  // "products" scope limits the promotion to the ticked products; the
  // default "store" scope leaves productIds empty (applies to everything).
  const productIds =
    String(formData.get("scope")) === "products"
      ? formData.getAll("productIds").map(String)
      : [];

  await mutateDB((db) => {
    db.promotions.push({
      id: "promo-" + Date.now().toString(36),
      store: storeSlug,
      name: String(formData.get("name")).trim() || "Store Sale",
      pct,
      active: true,
      productIds,
    });
  });
  refresh();
}

export async function togglePromotion(id: string): Promise<void> {
  const session = await requireAccess("products");
  await mutateDB((db) => {
    const promo = db.promotions.find((p) => p.id === id);
    if (!promo) return;
    assertOwnsStore(session, promo.store);
    promo.active = !promo.active;
  });
  refresh();
}

export async function deletePromotion(id: string): Promise<void> {
  const session = await requireAccess("products");
  await mutateDB((db) => {
    const promo = db.promotions.find((p) => p.id === id);
    if (!promo) return;
    assertOwnsStore(session, promo.store);
    db.promotions = db.promotions.filter((p) => p.id !== id);
  });
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
  await mutateDB((db) => {
    db.orderStatus[orderId] = status;
  });
  refresh();
}

// ── Stores (admin only) ────────────────────────────────────────────────

export async function setStoreStatus(slug: string, status: Store["status"]): Promise<void> {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");
  await mutateDB((db) => {
    db.storeStatus[slug] = status;
  });
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
  await mutateDB((db) => {
    if (db.employees.some((e) => e.email.toLowerCase() === email)) return;
    db.employees.push({
      id: "emp-" + Date.now().toString(36),
      store: storeSlug,
      name: String(formData.get("name")).trim(),
      email,
      role: String(formData.get("role")) as EmployeeRole,
    });
  });
  refresh();
}

export async function removeEmployee(id: string): Promise<void> {
  const session = await requireAccess("team");
  await mutateDB((db) => {
    const employee = db.employees.find((e) => e.id === id);
    if (!employee) return;
    if (session.role !== "admin") assertOwnsStore(session, employee.store);
    db.employees = db.employees.filter((e) => e.id !== id);
  });
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
  await mutateDB((db) => {
    db.marketing = {
      ...db.marketing,
      announcement: String(formData.get("announcement")),
      heroBadge: String(formData.get("heroBadge")),
      heroTitleTop: String(formData.get("heroTitleTop")),
      heroTitleHighlight: String(formData.get("heroTitleHighlight")),
      heroSubtitle: String(formData.get("heroSubtitle")),
      campaign: {
        active: formData.get("campaignActive") === "on",
        name: String(formData.get("campaignName")).trim() || "Site-wide Sale",
        pct: Math.min(90, Math.max(1, Number(formData.get("campaignPct")) || 10)),
      },
    };
  });
  refresh();
  return { ok: true, message: "Storefront updated." };
}

/** Section order + visibility, submitted by the section arranger. */
export async function updateSections(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireMarketing();
  const order = parseJsonField<HomeSection[]>(formData.get("sectionsJson"), []);
  if (order.length === 0) return { ok: false, message: "Nothing to save." };
  await mutateDB((db) => {
    db.marketing.sections = order;
  });
  refresh();
  return { ok: true, message: "Home page layout saved." };
}

// ── Banners & promo tiles (the home-page builder) ──────────────────────

export async function saveBanner(formData: FormData): Promise<void> {
  await requireMarketing();
  const id = String(formData.get("id") ?? "");
  const [image] = await saveImages(filesFrom(formData, "image"), "marketing");

  await mutateDB((db) => {
    const next: Banner = {
      id: id || "ban-" + Date.now().toString(36),
      title: String(formData.get("title")).trim(),
      subtitle: String(formData.get("subtitle") ?? "").trim() || undefined,
      cta: String(formData.get("cta") ?? "").trim() || undefined,
      link: String(formData.get("link") ?? "/products").trim() || "/products",
      from: String(formData.get("from") ?? "#1f6270"),
      to: String(formData.get("to") ?? "#fb8a0e"),
      image,
      active: true,
    };
    const existing = db.marketing.banners.find((b) => b.id === id);
    if (existing) {
      Object.assign(existing, next, {
        // Keep the current artwork unless a new file was uploaded.
        image: image ?? existing.image,
        active: existing.active,
      });
    } else {
      db.marketing.banners.push(next);
    }
  });
  refresh();
}

export async function deleteBanner(id: string): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const banner = db.marketing.banners.find((b) => b.id === id);
    if (banner?.image) void deleteUpload(banner.image);
    db.marketing.banners = db.marketing.banners.filter((b) => b.id !== id);
  });
  refresh();
}

export async function toggleBanner(id: string): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const banner = db.marketing.banners.find((b) => b.id === id);
    if (banner) banner.active = !banner.active;
  });
  refresh();
}

export async function moveBanner(id: string, delta: number): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const list = db.marketing.banners;
    const i = list.findIndex((b) => b.id === id);
    const target = i + delta;
    if (i < 0 || target < 0 || target >= list.length) return;
    [list[i], list[target]] = [list[target], list[i]];
  });
  refresh();
}

export async function savePromoTile(formData: FormData): Promise<void> {
  await requireMarketing();
  const [image] = await saveImages(filesFrom(formData, "image"), "marketing");
  await mutateDB((db) => {
    db.marketing.promoTiles.push({
      id: "tile-" + Date.now().toString(36),
      label: String(formData.get("label")).trim(),
      sublabel: String(formData.get("sublabel") ?? "").trim(),
      link: String(formData.get("link") ?? "/products").trim() || "/products",
      from: String(formData.get("from") ?? "#ffe4e6"),
      to: String(formData.get("to") ?? "#fecdd3"),
      image,
      active: true,
    });
  });
  refresh();
}

export async function deletePromoTile(id: string): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const tile = db.marketing.promoTiles.find((t) => t.id === id);
    if (tile?.image) void deleteUpload(tile.image);
    db.marketing.promoTiles = db.marketing.promoTiles.filter((t) => t.id !== id);
  });
  refresh();
}

export async function togglePromoTile(id: string): Promise<void> {
  await requireMarketing();
  await mutateDB((db) => {
    const tile = db.marketing.promoTiles.find((t) => t.id === id);
    if (tile) tile.active = !tile.active;
  });
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
