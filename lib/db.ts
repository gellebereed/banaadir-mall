/**
 * ─────────────────────────────────────────────────────────────────────────
 *  RUNTIME DATA STORE — a tiny JSON-file database (server-only).
 * ─────────────────────────────────────────────────────────────────────────
 * Everything the dashboards change at runtime lives here, layered on top
 * of the seed catalog in lib/data/*:
 *   - productOverrides / newProducts / deletedProducts  (seller edits)
 *   - promotions                                        (store discounts)
 *   - orderStatus                                       (fulfilment)
 *   - storeStatus                                       (admin approvals)
 *   - employees                                         (team + access)
 *   - marketing                                         (admin storefront control)
 *
 * State persists to data/db.json so it survives restarts. On serverless platforms
 * (Netlify/Vercel) where local disk is read-only, in-memory state is maintained.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_COMMISSION } from "./commission";
import { isSupabaseConfigured } from "./supabase/storage";
import type {
  Category,
  Employee,
  FlashDeal,
  FlashRequest,
  MarketingSettings,
  Order,
  OrderStatus,
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
} from "./types";

export interface DB {
  /** Field-level edits per product id (price, stock, hidden, …). */
  productOverrides: Record<string, Partial<Product>>;
  /** Products created from the dashboards at runtime. */
  newProducts: Product[];
  /** Seed products removed from the catalog. */
  deletedProducts: string[];
  promotions: Promotion[];
  /** Status overrides per order id. */
  orderStatus: Record<string, OrderStatus>;
  /**
   * Courier + stamped timeline per order id, for the local-dev path where
   * Supabase isn't configured. Kept separate from orderStatus so an older
   * db.json without it still loads.
   */
  orderDelivery?: Record<string, Pick<Order, "delivery" | "timeline">>;
  /** orderId → ISO timestamp the seller first opened it (unread badge). */
  ordersSeen?: Record<string, string>;
  /** Status overrides per store slug (approve / reject / suspend). */
  storeStatus: Record<string, Store["status"]>;
  /** Store profile edits per slug (name, tagline, logo, banner, …). */
  storeOverrides: Record<string, Partial<Store>>;
  employees: Employee[];
  marketing: MarketingSettings;
  flash: FlashDeal;
  /** Seller applications to join the flash-deal campaign. */
  flashRequests: FlashRequest[];
  categories?: Category[];
  stores?: Store[];
  /** Admin control over the recommender (see /admin/discovery). */
  reco?: RecoSettings;
  /**
   * The counter, for the local-dev path where Supabase isn't configured.
   * All four are optional so a db.json written before the till existed
   * still loads.
   */
  supplies?: Supply[];
  supplyPurchases?: SupplyPurchase[];
  recipes?: Recipe[];
  productionRuns?: ProductionRun[];
  /** "How to use this" episodes attached to products. */
  stories?: ProductStory[];
  /** Reviews left by real customers, newest last. */
  reviews?: ProductReview[];
}

/**
 * Shipped defaults for the recommender.
 *
 * Everything is ON out of the box. A discovery system the admin has to go
 * and switch on is a discovery system that never gets switched on — and the
 * engine is designed to stay quiet by itself when it has nothing worth
 * saying, so "on" is not the same as "noisy".
 */
export const DEFAULT_RECO: RecoSettings = {
  enabled: true,
  shelves: [],
  pins: [],
  blocked: [],
  pinStrength: 55,
  prompts: {
    enabled: true,
    askDepartments: true,
    askBudget: true,
    askReview: true,
    // Long enough that the shopper has started doing something before they
    // are interrupted. A prompt that fires on arrival is an obstacle.
    delaySeconds: 45,
    cooldownDays: 14,
  },
};

/** Defaults — must match the storefront's original hard-coded content. */
const DEFAULT_DB: DB = {
  categories: [],
  productOverrides: {},
  newProducts: [],
  deletedProducts: [],
  promotions: [],
  orderStatus: {},
  storeStatus: {},
  storeOverrides: {},
  employees: [],
  marketing: {
    announcement:
      "Free delivery in Mogadishu on orders over $25 · Pay with EVC Plus, Zaad & eDahab",
    heroBadge: "🇸🇴 Proudly Somali · 8 categories · Trusted local stores",
    heroTitleTop: "The whole market,",
    heroTitleHighlight: "in your pocket.",
    heroSubtitle:
      "Shop electronics, fashion, beauty and more from Somalia's best stores. Pay with EVC Plus, Zaad, eDahab or cash on delivery.",
    sections: [
      { key: "banners", visible: true },
      { key: "promoTiles", visible: true },
      { key: "categories", visible: true },
      { key: "brands", visible: true },
      { key: "flash", visible: true },
      { key: "value", visible: true },
      { key: "trending", visible: true },
      { key: "stores", visible: true },
      { key: "new", visible: true },
    ],
    banners: [],
    promoTiles: [],
    campaign: { active: false, name: "Eid Mega Sale", pct: 10 },
    delivery: { fee: 3, freeThreshold: 25, estimate: "Same-day in Mogadishu · 2–4 days nationwide" },
    promo: { code: "BANAADIR10", pct: 10 },
    // Off until an admin sets it up. A marketplace that starts charging a
    // commission the day it is upgraded, without anyone deciding to, would
    // be taking money from sellers by release note.
    commission: DEFAULT_COMMISSION,
  },
  flash: {
    active: true,
    name: "Flash Deals",
    endsAt: "",
    productIds: [],
  },
  flashRequests: [],
  reco: DEFAULT_RECO,
  stories: [],
  reviews: [],
};

/**
 * Keep the admin's saved section order, then append any section keys added
 * to the app since that order was saved, so new features still appear.
 */
function mergeSections(saved?: MarketingSettings["sections"]): MarketingSettings["sections"] {
  const defaults = DEFAULT_DB.marketing.sections;
  if (!saved?.length) return structuredClone(defaults);
  const known = new Set(defaults.map((s) => s.key));
  const kept = saved.filter((s) => known.has(s.key));
  const missing = defaults.filter((d) => !kept.some((s) => s.key === d.key));
  return [...kept, ...missing];
}

const DB_PATH = path.join(process.cwd(), "data", "db.json");

/** In-process cache, invalidated when the file changes on disk. */
let cache: { data: DB; mtimeMs: number } | null = null;

export async function getDB(): Promise<DB> {
  try {
    const stat = await fs.stat(DB_PATH);
    // The cache is only good while the file is unchanged. Returning it
    // without this check — which is what the code used to do, despite the
    // comment above — meant a worker that had read the file before a save
    // kept serving the old data indefinitely, so a seller's saved settings
    // read back as empty and looked like they hadn't saved at all.
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const raw = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as Partial<DB>;
    // Merge over defaults so adding new fields never breaks an old db.json.
    const data: DB = {
      ...structuredClone(DEFAULT_DB),
      ...raw,
      marketing: {
        ...structuredClone(DEFAULT_DB.marketing),
        ...raw.marketing,
        campaign: {
          ...structuredClone(DEFAULT_DB.marketing.campaign),
          ...raw.marketing?.campaign,
        },
        delivery: {
          ...structuredClone(DEFAULT_DB.marketing.delivery),
          ...raw.marketing?.delivery,
        },
        promo: {
          ...structuredClone(DEFAULT_DB.marketing.promo),
          ...raw.marketing?.promo,
        },
        commission: {
          ...structuredClone(DEFAULT_DB.marketing.commission),
          ...raw.marketing?.commission,
          // Rules are a list, not a record — spreading defaults over them
          // would leave a stale rule behind after the last one is deleted.
          rules: raw.marketing?.commission?.rules ?? [],
        },
        // Sections gained keys over time — keep any the saved order misses.
        sections: mergeSections(raw.marketing?.sections),
      },
      flash: { ...structuredClone(DEFAULT_DB.flash), ...raw.flash },
      // Same treatment as marketing: a db.json written before the
      // recommender existed must still load, with every new switch at its
      // default rather than undefined.
      reco: {
        ...structuredClone(DEFAULT_RECO),
        ...raw.reco,
        prompts: { ...structuredClone(DEFAULT_RECO.prompts), ...raw.reco?.prompts },
      },
      stories: raw.stories ?? [],
      reviews: raw.reviews ?? [],
      supplies: raw.supplies ?? [],
      supplyPurchases: raw.supplyPurchases ?? [],
      recipes: raw.recipes ?? [],
      productionRuns: raw.productionRuns ?? [],
    };
    cache = { data, mtimeMs: stat.mtimeMs };
    return data;
  } catch {
    // No readable file. On a read-only filesystem (Netlify / Vercel) the
    // in-memory copy is the only state there is, so keep it rather than
    // resetting every mutation back to the defaults.
    if (cache) return cache.data;
    // First run, or a corrupted file: start from defaults.
    const data = structuredClone(DEFAULT_DB);
    cache = { data, mtimeMs: 0 };
    return data;
  }
}

/** Writes to disk. Returns false when the filesystem is read-only. */
async function saveDB(db: DB): Promise<boolean> {
  // Cache with mtime 0 first: if the write fails we still hold the newest
  // data, and any real file will have a different mtime and be re-read.
  cache = { data: db, mtimeMs: 0 };
  try {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
    // Adopt the file's real mtime so the next read is served from cache
    // instead of parsing the file again.
    cache = { data: db, mtimeMs: (await fs.stat(DB_PATH)).mtimeMs };
    return true;
  } catch {
    // Serverless platforms (Netlify / Vercel) have a read-only filesystem.
    return false;
  }
}

/**
 * Read-modify-write helper used by every server action.
 *
 * Throws when the change cannot outlive the request — a read-only
 * filesystem AND no Supabase to fall back on. That combination happens on
 * Netlify when the Supabase env vars are missing: the write lands in a
 * per-Lambda in-memory object, so the dashboard reports success and the
 * change is gone on the very next request. Failing loudly is the only
 * honest outcome. Visit /api/health to see which piece is missing.
 */
export async function mutateDB(fn: (db: DB) => void): Promise<void> {
  const db = structuredClone(await getDB());
  fn(db);
  const persisted = await saveDB(db);

  if (!persisted && !isSupabaseConfigured()) {
    throw new Error(
      "This change could not be saved. The server's filesystem is read-only and " +
        "Supabase is not configured, so nothing would survive the next request. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your " +
        "hosting environment and redeploy — see /api/health.",
    );
  }
}

/** Resolved orders don't exist in db.ts — re-exported type convenience. */
export type { Order };
