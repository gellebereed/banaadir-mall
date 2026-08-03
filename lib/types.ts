/**
 * Core domain types for Banaadir Mall.
 *
 * These mirror the shapes you would get from an Odoo backend:
 *   Category  -> product.category   (a TREE: parentSlug === Odoo parent_id)
 *   Store     -> res.partner (vendor) / website multi-company
 *   Product   -> product.template
 *   Variant   -> product.product    (the sellable unit that owns the barcode)
 *   Order     -> sale.order
 *
 * Keep these types stable — the whole UI is written against them, so
 * connecting Odoo later only means mapping Odoo records into these shapes
 * inside lib/odoo/mapping.ts.
 *
 * ── The identity fields (see lib/barcode.ts) ─────────────────────────────
 * Three fields carry a product's identity between the two systems, and they
 * behave exactly as they do in Odoo:
 *
 *   internalReference  Odoo `default_code`. The human key printed on price
 *                      tags and typed into purchase orders. Unique.
 *   barcode            Odoo `barcode`. The scannable GTIN. Unique across
 *                      every sellable unit — product AND variant alike.
 *   odooId             Odoo's own database id, written by the sync only.
 *                      Never shown to sellers, never typed by hand.
 *
 * A product with variants keeps the template-level reference/barcode as the
 * FALLBACK; each variant may carry its own, which is what actually gets
 * scanned. That is Odoo's `product.template.barcode` vs
 * `product.product.barcode` relationship.
 */

/** Gradient pair used to render generated product/category artwork. */
export type Art = { from: string; to: string };

export interface Category {
  slug: string;
  name: string;
  /** Emoji used as the category glyph across the UI. */
  icon: string;
  tagline: string;
  art: Art;
  /** If true, hidden from customer navbar and homepage category lists. */
  hidden?: boolean;
  /**
   * Parent category slug — this is what makes categories a TREE rather than
   * a flat list, matching Odoo's `product.category.parent_id`. A product
   * filed under a child also appears on its ancestors' pages
   * (see getProductsByCategory).
   */
  parentSlug?: string;
  /** Odoo `product.category` id, set by the sync. */
  odooId?: number;
}

/**
 * A category with its position in the tree resolved. Built by
 * getCategoryTree() / getCategoryPath() rather than stored.
 */
export interface CategoryNode extends Category {
  /** 0 for a root category, 1 for its children, and so on. */
  depth: number;
  /** Odoo `complete_name`, e.g. "Home & Living / Cookware". */
  completeName: string;
  children: CategoryNode[];
}

export interface Store {
  /** Slug doubles as the store id everywhere. */
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  city: string;
  /** Primary category slug the store sells in. */
  category: string;
  rating: number;
  reviewCount: number;
  followers: number;
  joinedYear: number;
  verified: boolean;
  /**
   * Official brand franchises (e.g. Karaca, U.S. Polo Assn.) get an
   * "Official Brand" badge and appear in the home-page brand row.
   */
  official?: boolean;
  /**
   * Lifecycle: pending stores appear in the admin approval queue;
   * rejected/suspended stores are hidden from the storefront.
   */
  status: "active" | "pending" | "rejected" | "suspended";
  art: Art;
  /** Uploaded store logo URL — replaces the emoji icon when set. */
  logo?: string;
  /** Uploaded banner URL — replaces the gradient banner when set. */
  banner?: string;
  /**
   * WhatsApp number orders are sent to, in international form
   * ("252613334444"). Sellers type it every possible way, so it is
   * normalised on save — see lib/whatsapp.ts.
   *
   * Falls back to the older `stores.phone` column on read, so a number
   * already entered there starts working without being re-typed. When it
   * is missing entirely, order notifications go to the platform number
   * instead of rendering a dead button.
   */
  whatsapp?: string;
  /**
   * Drivers this shop uses regularly. Saved once, then picked from a list
   * when dispatching a parcel.
   *
   * Retyping a name and phone number on every order is the step that
   * actually gets skipped in a busy shop — and a parcel dispatched without
   * a contact is one the customer cannot chase.
   */
  couriers?: Courier[];
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Store slug this product belongs to. */
  store: string;
  /** Category slug. */
  category: string;
  /**
   * Odoo `default_code` — the seller's own product code, e.g. "KRC-TENC-24".
   * Uppercased and unique across the marketplace (lib/barcode.ts), so an
   * Odoo import can match on it instead of creating duplicates.
   */
  internalReference?: string;
  /**
   * Odoo `barcode` — the GTIN printed on the packaging (EAN-13, UPC-A…).
   * On a product WITH variants this is the template-level fallback; the
   * variant's own barcode is what a scanner resolves to.
   */
  barcode?: string;
  /**
   * Odoo `uom_id` name, e.g. "Units", "kg", "Litre". Sales here are always
   * in whole sellable units, so this is descriptive — it exists so the
   * value round-trips to Odoo instead of being silently reset to Units.
   */
  uom?: string;
  /** Odoo `product.template` id. Written by the sync, never by a seller. */
  odooId?: number;
  /**
   * Free-text grouping inside a category, e.g. "Cookware" under
   * Home & Living. Created simply by a seller typing it on a product —
   * see lib/api.ts#getSubcategories.
   */
  subcategory?: string;
  /** Current selling price in USD. */
  price: number;
  /** Original price when the product is on sale. */
  compareAt?: number;
  icon: string;
  art: Art;
  rating: number;
  reviewCount: number;
  sold: number;
  stock: number;
  badge?: "Sale" | "Bestseller" | "New";
  colors?: string[];
  sizes?: string[];
  description: string;
  features: string[];
  /** Hidden products stay in dashboards but disappear from the storefront. */
  hidden?: boolean;
  /**
   * Uploaded photo URLs (see lib/uploads.ts). The first one is the main
   * image. When empty, the generated gradient artwork is shown instead.
   */
  images?: string[];
  /**
   * Buyable variations. When present they own stock (and optionally price
   * and photos) — see lib/product-utils.ts for the resolution helpers.
   */
  variants?: Variant[];
  /**
   * Variant preselected on the product page, and whose photo represents the
   * product in catalogue listings. Falls back to the first variant.
   */
  defaultVariantId?: string;
}

/**
 * A concrete buyable variation of a product — e.g. "Black · M".
 * Each variant carries its own stock, and may override the product's
 * price and photos. Products without variants just use their own
 * price/stock/images fields.
 *
 * This is Odoo's `product.product`: the record a warehouse actually counts
 * and a scanner actually resolves to. Everything a picker needs to identify
 * one physical item — sku, barcode, stock — lives here, not on the product.
 */
export interface Variant {
  id: string;
  color?: string;
  /** Custom hex color override set via color picker or eyedropper. */
  colorHex?: string;
  size?: string;
  /** Overrides the product price when set. */
  price?: number;
  stock: number;
  /** Variant-specific photos; falls back to the product's photos. */
  images?: string[];
  /**
   * Odoo `default_code` on product.product — this variant's own internal
   * reference. Falls back to the product's when empty.
   */
  sku?: string;
  /**
   * Odoo `barcode` on product.product — the GTIN on THIS colour/size's
   * packaging. Unique across the whole catalogue; falls back to the
   * product's barcode when empty.
   */
  barcode?: string;
  /** Odoo `product.product` id. Written by the sync, never by a seller. */
  odooId?: number;
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderItem {
  productId: string;
  qty: number;
  store?: string;
  /**
   * The store's display name, captured at checkout. Tracking otherwise has
   * to de-slugify `store`, which turns "sahra-fashion" into "Sahra Fashion"
   * when the shop is actually called "Sahra Fashion House".
   */
  storeName?: string;
  name?: string;
  price?: number;
  image?: string;
  selectedColor?: string;
  selectedSize?: string;
}

/**
 * Who is carrying a parcel, and how to reach them.
 *
 * Marketplaces split an order into one shipment per seller, and each
 * shipment travels with its own driver. The customer's question is never
 * "what is the status of my order" — it is "where is the box with my shoes
 * in it, and who do I call". That needs a contact per parcel, not per order.
 */
export interface Courier {
  name: string;
  /** International digits, normalised on save (see lib/whatsapp.ts). */
  phone: string;
  /** Delivery firm, or the shop's own name when they deliver themselves. */
  company?: string;
}

/** Delivery details a seller attaches to one parcel. */
export interface ParcelDelivery {
  courier?: Courier;
  /** Waybill / tracking code from the delivery firm, when there is one. */
  trackingCode?: string;
  /** Free note from the seller, e.g. "Call before arriving, gate is locked". */
  note?: string;
  /** ISO date the seller expects it to arrive. */
  estimatedAt?: string;
}

/**
 * One stamped step in a parcel's journey. The status alone says WHAT;
 * these say *when*, which is the difference between "shipped" and
 * "shipped four days ago and nobody has touched it since".
 */
export interface ParcelEvent {
  status: OrderStatus;
  /** ISO timestamp. */
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  customer: string;
  email?: string;
  phone?: string;
  address?: string;
  city: string;
  /** Store slug that fulfils this order. */
  store: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  /** ISO date string, e.g. "2026-07-28". */
  date: string;
  /**
   * Who is delivering THIS parcel. Set by the seller when they hand it to a
   * driver — an order spanning three shops has three of these, and they are
   * usually three different drivers.
   */
  delivery?: ParcelDelivery;
  /** Stamped status history, oldest first. */
  timeline?: ParcelEvent[];
  /**
   * When the seller first opened this parcel. `undefined` means NEW — it is
   * what the unread badge counts.
   *
   * Deliberately server-side rather than in the browser: a seller who
   * checks orders on their phone and then their laptop should not be shown
   * the same "new" order twice.
   */
  seenAt?: string;
}

/** A line in the client-side shopping cart (persisted to localStorage). */
export interface CartItem {
  productId: string;
  qty: number;
  color?: string;
  size?: string;
  /**
   * Price/name captured at add-to-cart time. Lets the cart render products
   * that were created at runtime (seller dashboard) and keeps the price
   * the customer saw when adding.
   */
  snapshot?: {
    name: string;
    price: number;
    icon: string;
    slug: string;
    /**
     * Photo shown in the cart and checkout. Without it those screens fall
     * back to the emoji icon, because the catalog they used to look the
     * product up in is now Supabase, not the bundled seed data.
     */
    image?: string;
  };
  /** Variant id when the product has variants. */
  variantId?: string;
}

// ── Marketplace management (stored in data/db.json, see lib/db.ts) ────

/** A percentage discount a seller runs on their store or chosen products. */
export interface Promotion {
  id: string;
  /** Store slug the promotion belongs to. */
  store: string;
  name: string;
  /** Discount percentage, 1–90. */
  pct: number;
  active: boolean;
  /**
   * Product ids the promotion applies to. Empty or missing means the
   * whole store.
   */
  productIds?: string[];
  /**
   * Optional schedule (ISO datetime). Lets a seller queue a promotion for
   * a future date or have it expire by itself, instead of remembering to
   * switch it off. See isPromotionLive() in lib/api.ts.
   */
  startsAt?: string;
  endsAt?: string;
}

export type EmployeeRole = "manager" | "products" | "orders" | "marketing" | "viewer";

/** A team member of a store (or of the platform when store === "platform"). */
export interface Employee {
  id: string;
  /** Store slug, or "platform" for admin-side employees. */
  store: string;
  name: string;
  email: string;
  role: EmployeeRole;
}

/** A full-width promotional banner in the home-page carousel. */
export interface Banner {
  id: string;
  /**
   * All copy is optional. Uploaded artwork usually already contains the
   * headline, so an image-only banner is a normal case — it renders with
   * no text overlay and no darkening scrim.
   */
  title?: string;
  subtitle?: string;
  cta?: string;
  /** Where the banner links to, e.g. /category/electronics. */
  link: string;
  /** Uploaded artwork; falls back to the gradient below. */
  image?: string;
  /**
   * Optional portrait artwork for phones. The desktop frame is 2.67:1 but
   * the mobile frame is 1.25:1, so one wide image loses most of its sides
   * on a phone. Supplying this is what separates a banner that looks
   * designed from one that looks cropped.
   */
  mobileImage?: string;
  from: string;
  to: string;
  active: boolean;
  /**
   * How the artwork fills its frame. "cover" crops to fill (good for
   * photos), "contain" shows the whole image (good for ready-made banner
   * graphics that must not be cut off).
   */
  fit?: "cover" | "contain";
}

/** A small tile in the "shop by discount / campaign" strip. */
export interface PromoTile {
  id: string;
  /** Big text, e.g. "50%" or "4 AL 3 ÖDE". */
  label: string;
  sublabel: string;
  link: string;
  image?: string;
  from: string;
  to: string;
  active: boolean;
}

/** Home-page sections, in the order the admin arranges them. */
export type SectionKey =
  | "banners"
  | "promoTiles"
  | "categories"
  | "brands"
  | "flash"
  | "value"
  | "trending"
  | "stores"
  | "new";

export interface HomeSection {
  key: SectionKey;
  visible: boolean;
}

/** Flash-deal campaign curated by the admin. */
export interface FlashDeal {
  active: boolean;
  name: string;
  /** ISO datetime the countdown runs to. */
  endsAt: string;
  /** Products admitted to the campaign. */
  productIds: string[];
}

/** A seller asking for one of their products to join the flash deals. */
export interface FlashRequest {
  id: string;
  store: string;
  productId: string;
  /** Discount the seller is offering for the campaign. */
  pct: number;
  note?: string;
  status: "pending" | "approved" | "rejected";
  date: string;
}

/** Storefront content the admin controls from /admin/marketing. */
export interface MarketingSettings {
  /** Text in the bar above the header. */
  announcement: string;
  /** Announcement bar background color hex (e.g. #0c2b34). */
  announcementBgColor?: string;
  /** Announcement bar text color hex (e.g. #ffffff). */
  announcementTextColor?: string;
  /** Whether the announcement bar continuously auto-scrolls. Default true. */
  announcementScroll?: boolean;
  /** Marquee auto-scroll speed in seconds (e.g. 15 to 40). Default 25. */
  announcementSpeed?: number;
  heroBadge: string;
  heroTitleTop: string;
  heroTitleHighlight: string;
  heroSubtitle: string;
  /** Ordered home-page sections with their visibility. */
  sections: HomeSection[];
  banners: Banner[];
  promoTiles: PromoTile[];
  /** Site-wide sale applied to every product when active. */
  campaign: { active: boolean; name: string; pct: number };
  /**
   * Checkout rules the admin controls, instead of constants buried in the
   * cart page. `freeThreshold` of 0 means delivery is always charged.
   */
  delivery: {
    fee: number;
    freeThreshold: number;
    /** Shown on the cart and checkout, e.g. "2–4 days nationwide". */
    estimate: string;
  };
  /** Single promo code accepted at checkout. Empty disables the field. */
  promo: { code: string; pct: number };
}

export interface Review {
  author: string;
  rating: number;
  date: string;
  text: string;
}
