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
 * State persists to data/db.json so it survives restarts. Delete that file
 * to reset the demo to a clean state.
 *
 * When Odoo (or a real database) is connected, this file and the merge
 * logic in lib/api.ts are what get replaced — the dashboards themselves
 * only talk to the server actions in app/actions.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  Employee,
  FlashDeal,
  FlashRequest,
  MarketingSettings,
  Order,
  OrderStatus,
  Product,
  Promotion,
  Store,
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
  /** Status overrides per store slug (approve / reject / suspend). */
  storeStatus: Record<string, Store["status"]>;
  /** Store profile edits per slug (name, tagline, logo, banner, …). */
  storeOverrides: Record<string, Partial<Store>>;
  employees: Employee[];
  marketing: MarketingSettings;
  flash: FlashDeal;
  /** Seller applications to join the flash-deal campaign. */
  flashRequests: FlashRequest[];
}

/** Defaults — must match the storefront's original hard-coded content. */
const DEFAULT_DB: DB = {
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
  },
  flash: {
    active: true,
    name: "Flash Deals",
    endsAt: "",
    productIds: [],
  },
  flashRequests: [],
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
        // Sections gained keys over time — keep any the saved order misses.
        sections: mergeSections(raw.marketing?.sections),
      },
      flash: { ...structuredClone(DEFAULT_DB.flash), ...raw.flash },
    };
    cache = { data, mtimeMs: stat.mtimeMs };
    return data;
  } catch {
    // First run (or corrupted file): start from defaults.
    return structuredClone(DEFAULT_DB);
  }
}

async function saveDB(db: DB): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  cache = null;
}

/** Read-modify-write helper used by every server action. */
export async function mutateDB(fn: (db: DB) => void): Promise<void> {
  const db = structuredClone(await getDB());
  fn(db);
  await saveDB(db);
}

/** Resolved orders don't exist in db.ts — re-exported type convenience. */
export type { Order };
