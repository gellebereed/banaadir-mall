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
  /** Optional image URL used instead of the emoji icon (e.g. on homepage). */
  image?: string;
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
  /**
   * The counter. Absent or disabled for every store that already has a
   * till of its own — see PosSettings.
   */
  pos?: PosSettings;
  /**
   * Where this store's products are allowed to appear.
   *
   * ── "own-store-only" is not the same as hidden ───────────────────────
   * The store stays fully open for business: its page works, its product
   * pages work, its link can be shared, its till rings up sales, and
   * checkout behaves exactly as it does for anybody else. What changes is
   * DISCOVERY — it stops appearing in marketplace browse, search, category
   * pages, recommendations, the home page rails and the store directory.
   *
   * That distinction is the whole point. A bakery that wants a shopfront
   * of its own and a till, without its cinnamon rolls turning up as a
   * suggestion beside somebody else's, is a real and reasonable shape of
   * business — and "hidden" would break the link they just printed on
   * their packaging.
   *
   * Absent means "marketplace", so every store that existed before this
   * setting keeps behaving exactly as it did.
   */
  listing?: "marketplace" | "own-store-only";
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /**
   * ISO timestamp of the last change, stamped by a database trigger (see
   * supabase/migration-product-updated-at.sql). Absent on databases where
   * that migration has not been applied, and on the bundled seed data.
   */
  updatedAt?: string;
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
  /**
   * Odoo `standard_price` — what the goods cost to buy, per unit.
   *
   * NEVER shown to a customer. It exists because the selling price of an
   * imported product is *derived* from it (see lib/import/pricing.ts), and
   * without it stored, re-pricing later means going back to the supplier's
   * invoice. Absent on products entered by hand.
   */
  cost?: number;
  /**
   * Where an imported product came from. Reference data — a customs code
   * and a shipment number are worth keeping and worth nothing on the
   * storefront, so they live here rather than becoming columns.
   */
  supplier?: SupplierMeta;
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
  /** Featured / favorite products pinned to the top of the seller's brand store page. */
  featured?: boolean;
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
 * Provenance for a product that arrived through a supplier file import.
 * Everything here is reference data: traceable, never merchandised.
 */
export interface SupplierMeta {
  /** Brand as the supplier writes it, e.g. "Altınyıldız Classics". */
  brand?: string;
  /** Sub-brand or range, e.g. "AC Basics". */
  line?: string;
  /** e.g. "2026 Summer" — what makes a product this season's arrival. */
  season?: string;
  /** Fabric make-up, already rewritten as "100% Cotton". */
  composition?: string;
  /** Customs tariff code. */
  hsCode?: string;
  /** Supplier invoice this stock arrived on. */
  invoiceNo?: string;
  /** ISO date of that invoice. */
  invoiceDate?: string;
  /** ISO timestamp of the import run that last wrote this product. */
  importedAt?: string;
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
  /**
   * Where the sale happened. Absent means the website, which is what every
   * order placed before the till existed was.
   *
   * A counter sale is a real order and is stored as one, deliberately: it
   * then flows through the same analytics, the same commission and the same
   * seller dashboard as everything else. A parallel table of "POS sales"
   * would mean every figure in the app had to remember to add them up, and
   * one of them always forgets.
   */
  channel?: "online" | "pos";
  /** How a counter sale was paid. Only set when `channel` is "pos". */
  payment?: PaymentMethod;
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
     * Store slug that sells it. Without this the cart rebuilds a product
     * with no store, and the checkout screen can't tell which shop each
     * parcel belongs to. The server re-resolves it from the catalogue
     * anyway (submitOrderAction) — this is what keeps the CONFIRMATION
     * screen's per-vendor grouping right.
     */
    store?: string;
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

/**
 * One thing a team member may do.
 *
 * Roles are presets over this list, not a replacement for it. Five fixed
 * roles could not express the case every shop actually has — "let Hodan
 * edit products but never see what we paid for them" — so the role picks a
 * starting set and the owner adjusts it per person from there.
 */
export type Permission =
  | "products.view"
  | "products.edit"
  | "products.import"
  | "products.delete"
  | "orders.view"
  | "orders.manage"
  | "promotions.manage"
  | "photos.manage"
  | "settings.manage"
  | "team.manage"
  | "marketing.manage"
  /** See cost price, margin and stock value. Off by default for everyone. */
  | "costs.view";

/** Where an invited team member is in the journey from invite to account. */
export type EmployeeStatus = "pending" | "active";

/** A team member of a store (or of the platform when store === "platform"). */
export interface Employee {
  id: string;
  /** Store slug, or "platform" for admin-side employees. */
  store: string;
  name: string;
  email: string;
  role: EmployeeRole;
  /**
   * Explicit grants. Absent means "whatever the role implies" — which is
   * what every employee added before this existed gets, so nobody's access
   * changed the day it shipped.
   */
  permissions?: Permission[];
  /** "pending" until they open their invite; "active" afterwards. */
  status?: EmployeeStatus;
  /** The secret in their invite link. Rotating it invalidates the old one. */
  inviteToken?: string;
  invitedAt?: string;
  acceptedAt?: string;
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
  /**
   * What the marketplace keeps from each sale.
   *
   * ── Why it lives on this record ──────────────────────────────────────
   * `marketing_settings` is, despite its name, the platform-settings row:
   * it already holds the delivery charge and the checkout promo code,
   * neither of which is marketing either. Giving commission its own table
   * would mean a second single-row table, a second cache tag and a second
   * migration for one object — so it joins the row it belongs to, and is
   * read through getCommissionSettings() rather than through this type, so
   * nothing has to know where it is stored.
   */
  commission: CommissionSettings;
}

export interface Review {
  author: string;
  rating: number;
  date: string;
  text: string;
}

// ── Point of sale: the counter, the pantry and what is made from it ────
//
// Built for the shop that has no till at all — a bakery selling cinnamon
// rolls, a café, a corner kitchen. The vocabulary below is deliberately the
// vocabulary its owner already uses: things you BOUGHT, a RECIPE, a BATCH
// you made, and a SALE. There is no "bill of materials" and no "stock
// keeping unit" anywhere in it, because the moment those words appear the
// person this is for stops reading.

/**
 * How a supply is counted.
 *
 * Three families, and conversion only ever happens INSIDE a family. Flour
 * bought by the sack and used by the gram is the normal case and has to
 * work; flour bought by the kilo and used by the litre is a mistake, and
 * silently converting it would hide the mistake rather than catch it.
 */
export type SupplyUnit = "g" | "kg" | "ml" | "l" | "piece" | "dozen";

/** Something the kitchen buys and uses up. Flour, eggs, sugar, cups. */
export interface Supply {
  id: string;
  store: string;
  name: string;
  /** The unit its stock is counted in — how the owner thinks of it. */
  unit: SupplyUnit;
  /** How much is on the shelf right now, in `unit`. */
  stock: number;
  /**
   * What one `unit` costs, averaged across everything ever bought.
   *
   * Derived from the purchases, never typed. A shop buys the same flour at
   * three prices in a month, and asking someone to keep a "current cost"
   * field up to date by hand is asking for a number that is wrong by the
   * second week — which then quietly poisons every price the app suggests.
   */
  unitCost: number;
  /** Warn below this. Absent means never warn. */
  lowAt?: number;
  /** Emoji shown on the chip in the recipe illustration. */
  icon?: string;
}

/** One delivery: "25 kg of flour, KES 2,500". */
export interface SupplyPurchase {
  id: string;
  store: string;
  supplyId: string;
  /** Quantity received, in the supply's unit. */
  qty: number;
  /** What was paid IN TOTAL, not per unit — nobody has the per-unit figure
   *  on the receipt in their hand, and making them divide it is where the
   *  typos come from. */
  totalCost: number;
  /** ISO date. */
  date: string;
  note?: string;
}

/** One line of a recipe: how much of a supply one batch uses. */
export interface RecipeItem {
  supplyId: string;
  qty: number;
  /**
   * The unit this line is measured in. May differ from the supply's own
   * unit as long as it is in the same family — 500 g out of a sack
   * counted in kg.
   */
  unit: SupplyUnit;
}

/** What one batch is made of, and how much of it comes out. */
export interface Recipe {
  id: string;
  store: string;
  /** The product this makes, which is what actually gets sold. */
  productId: string;
  name: string;
  items: RecipeItem[];
  /** How many sellable units one batch yields. */
  yield: number;
  /**
   * Per-batch cost that is not an ingredient — gas, boxes, the hour it
   * takes. Optional, and worth having: a price built from flour and sugar
   * alone is the reason small kitchens work all day for nothing.
   */
  overhead?: number;
  updatedAt?: string;
}

/** A batch actually made. Moves supplies off the shelf and stock onto it. */
export interface ProductionRun {
  id: string;
  store: string;
  recipeId: string;
  /** How many batches were made. */
  batches: number;
  /** Units produced — `batches × recipe.yield`, stored as it was at the time. */
  madeQty: number;
  /** What each unit cost to make, stamped at the time it was made. */
  unitCost: number;
  date: string;
}

/** How a counter sale was paid for. */
export type PaymentMethod = "cash" | "evc" | "edahab" | "card";

/** Everything the owner controls about their till. */
export interface PosSettings {
  /** Off by default. A shop with a till of its own never sees any of this. */
  enabled: boolean;
  /**
   * Target margin used to SUGGEST a price, as a percentage of the selling
   * price. A suggestion only — every screen that shows one lets the owner
   * type their own over it, because they know their street and this does
   * not.
   */
  targetMarginPct: number;
  /** Round suggested prices to this, e.g. 5 → KES 45, 50, 55. */
  roundTo: number;
  /** Payment methods offered at the counter. */
  methods: PaymentMethod[];
}

// ── Commission: what the marketplace keeps from each sale ──────────────

/**
 * One override in the commission stack.
 *
 * A single flat rate across a marketplace never survives contact with it:
 * electronics run on thin margins and cannot carry the rate that fashion
 * can, and the brand you spent six months signing will have negotiated
 * their own. So the rate is a stack of rules, and the DEFAULT is what
 * applies when none of them match.
 *
 * A rule with neither a store nor a category is meaningless — that is what
 * `defaultPct` is — and is rejected on save.
 */
export interface CommissionRule {
  id: string;
  /** Store slug this applies to. Absent means every store. */
  store?: string;
  /** Category slug this applies to. Absent means every category. */
  category?: string;
  /** Percentage of the line value the marketplace keeps, 0–100. */
  pct: number;
  /** Off keeps the rule for later without applying it. */
  active: boolean;
  /** Free text for whoever reads this in six months. */
  note?: string;
}

/** Everything the admin controls about what the marketplace earns. */
export interface CommissionSettings {
  /** Master switch. Off means every payout is the full sale value. */
  enabled: boolean;
  /** Rate applied to a line no rule matches, 0–100. */
  defaultPct: number;
  /**
   * Fixed amount taken once per order, on top of the percentage.
   *
   * This is where payment-processing costs live. They are charged per
   * transaction rather than per dollar, so a marketplace of $4 orders
   * loses money on a pure percentage no matter how the percentage is set.
   */
  orderFee: number;
  /**
   * Whether the delivery the customer paid is commissionable.
   *
   * Off by default, and that is the honest default: the seller collected
   * that money to hand to a driver, so taking a cut of it is taking a cut
   * of someone else's wage.
   */
  chargeOnDelivery: boolean;
  /**
   * Show sellers the fee and their resulting payout in their dashboard.
   *
   * On by default. A commission a seller cannot see is one they find out
   * about when the money arrives short, and that conversation costs more
   * than the transparency does.
   */
  showToSellers: boolean;
  rules: CommissionRule[];
}

// ── Discovery: admin control over recommendations & product stories ────

/**
 * Where a home-page recommendation shelf sits relative to the admin's own
 * sections. Splitting the stack across the page is what stops it reading as
 * one long block of "more stuff" bolted onto the bottom.
 */
export type ShelfSlot = "top" | "early" | "mid" | "late";

/** Admin overrides for one shelf. */
export interface RecoShelfSetting {
  /** Shelf id, e.g. "for-you" — see lib/reco/shelves.ts. */
  key: string;
  visible: boolean;
  /** Replaces the engine's title when set. */
  title?: string;
  /** Moves the shelf up or down the page. */
  slot?: ShelfSlot;
}

/**
 * A product the admin is deliberately pushing.
 *
 * Pins do NOT bypass the engine — they enter it as one more strongly
 * weighted opinion, so a pinned product still has to pass the stock,
 * mute and diversity checks. That matters: a pinned item that is out of
 * stock, or that a shopper has already rejected, damages the shelf it sits
 * on more than the push is worth.
 */
export interface RecoPin {
  id: string;
  productId: string;
  /** Shelf id to force it into, or "auto" to let the engine place it. */
  shelf: string;
  /** Replaces the reason line on the card. Say something true. */
  note?: string;
  /** ISO datetime bounds — lets a push expire on its own. */
  startsAt?: string;
  endsAt?: string;
  active: boolean;
}

/** Everything the admin controls about the recommender. */
export interface RecoSettings {
  /** Master switch. Off means no personalised shelves anywhere. */
  enabled: boolean;
  shelves: RecoShelfSetting[];
  pins: RecoPin[];
  /** Product ids kept out of every recommendation. */
  blocked: string[];
  /**
   * How much weight a pin carries against the engine's own ranking, 1–100.
   * At 100 pins lead every eligible shelf; at 20 they are a nudge.
   */
  pinStrength: number;
  prompts: PromptSettings;
}

/** The timed onboarding / feedback prompts shown to shoppers. */
export interface PromptSettings {
  enabled: boolean;
  /** Ask which departments they shop — the single most useful answer. */
  askDepartments: boolean;
  /** Ask a comfortable price range. */
  askBudget: boolean;
  /** Ask a returning customer to rate something they actually received. */
  askReview: boolean;
  /** Seconds on site before the first prompt may appear. */
  delaySeconds: number;
  /** Days before a dismissed prompt may be asked again. */
  cooldownDays: number;
}

/** One chapter of a product story. */
export interface StoryChapter {
  heading: string;
  body: string;
  image?: string;
}

/**
 * A product story — the "episode" attached to a product: how to use it,
 * what it is actually for, how people live with it.
 *
 * This is the part of a listing a photo and a spec table cannot carry. A
 * shopper who has watched two minutes on how a stand mixer is cleaned is a
 * different shopper from one who has read "535W".
 */
export interface ProductStory {
  id: string;
  title: string;
  subtitle?: string;
  kind: StoryKind;
  /** Products this story is attached to. */
  productIds: string[];
  /** Whole categories it covers, so one story can serve a range. */
  categorySlugs?: string[];
  /** Store slug when a seller owns the story. */
  store?: string;
  /** YouTube / Vimeo / direct mp4. */
  videoUrl?: string;
  /** Still shown before the video plays. */
  poster?: string;
  heroImage?: string;
  chapters: StoryChapter[];
  /** Photos of the product in use — the most persuasive images there are. */
  gallery?: string[];
  /** How long it takes to read or watch, e.g. "3 min". */
  duration?: string;
  published: boolean;
  updatedAt: string;
}

export type StoryKind = "how-to" | "benefits" | "care" | "stories" | "compare";

/** A review a real customer left, as opposed to the generated samples. */
export interface ProductReview {
  id: string;
  productId: string;
  author: string;
  rating: number;
  text?: string;
  /** ISO date. */
  date: string;
  /** True when we can tie it to an order the reviewer actually received. */
  verified?: boolean;
  orderId?: string;
}
