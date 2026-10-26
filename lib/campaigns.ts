/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CAMPAIGNS — everything on the marketplace that is on offer right now,
 *  seen as one list.
 * ─────────────────────────────────────────────────────────────────────────
 * Four things in this codebase are campaigns to a shopper, though each was
 * built separately and stored in its own place:
 *
 *   • the site-wide sale     marketing.campaign   admin runs, shops join
 *   • flash deals            flash                admin curates
 *   • a shop's promotion     promotions           "25% off everything"
 *   • a shop's offer         offers               "buy 2, get 1 free"
 *
 * The home page used to know about none of them: its banners and the
 * "Today's Campaigns" tiles were typed in by hand, so a shop could launch
 * a sale and nobody arriving on the front page would ever hear of it. This
 * module reads all four into one shape, so the home page can fill itself
 * from what is actually running, the admin can see and curate that in one
 * place (/admin/banners), and every campaign has a page and a link a shop
 * can post.
 *
 * Nothing here changes a price. Pricing still happens where it always has
 * (lib/api.ts discountPctFor, lib/offers.ts) — this only describes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PALETTES, shopPalette } from "@/lib/scenes";
import {
  getAllStores,
  getFlashDeal,
  getFlashProducts,
  getMarketingSettings,
  getOffers,
  getProducts,
  getPromotions,
  isListedOnMarketplace,
} from "./api";
import {
  campaignFeed,
  campaignPath,
  FLASH_CAMPAIGN_ID,
  SALE_CAMPAIGN_ID,
  scheduleStatus,
  type CampaignKind,
  type ScheduleStatus,
} from "./campaign-utils";
import { flashState, isLegacyFlashPromotion } from "./flash";
import { discountPct, money } from "./format";
import { translator, type T } from "./i18n";
import { offerReaches, rankPicks } from "./offer-picks";
import { offerHeadline } from "./offers";
import type { MarketingSettings, Offer, Product, Promotion, Store } from "./types";

export interface Campaign {
  id: string;
  kind: CampaignKind;
  /** What the campaign is called: "Eid Mega Sale", "Weekend sale". */
  name: string;
  /** What it gives, in a few words: "25% off", "Buy 2, get 1 free". */
  headline: string;
  /** The percentage, when the campaign is one. Drives ranking. */
  pct?: number;
  status: ScheduleStatus;
  startsAt?: string;
  endsAt?: string;
  /** The shop running it (promotions and offers). */
  store?: Store;
  /** The shops taking part — just `store` for a shop's own campaign. */
  stores: Store[];
  /** The products it covers, best first, as shoppers see them priced. */
  products: Product[];
  /** The public page. */
  path: string;
  from: string;
  to: string;
  /** Artwork to stand behind it: the shop's banner, when it has one. */
  image?: string;
}

/** Best sellers first, then the deepest markdown. */
function rank(products: Product[]): Product[] {
  const off = (p: Product) => (p.compareAt && p.compareAt > p.price ? discountPct(p.price, p.compareAt) : 0);
  return [...products].sort((a, b) => off(b) - off(a) || (b.sold ?? 0) - (a.sold ?? 0));
}

/**
 * Every campaign, running or not — the admin's list and the campaign pages
 * need the scheduled and ended ones too. `t` words the shop offers'
 * headlines; English when absent (link-preview cards, the admin panel).
 */
export async function getCampaigns(t: T = translator("en")): Promise<Campaign[]> {
  const [marketing, flash, flashProducts, promotions, offers, stores, products] = await Promise.all([
    getMarketingSettings(),
    getFlashDeal(),
    getFlashProducts(),
    getPromotions(),
    getOffers(),
    getAllStores(),
    getProducts(),
  ]);
  const storeBySlug = new Map(stores.map((s) => [s.slug, s]));
  const byStore = new Map<string, Product[]>();
  for (const p of products) byStore.set(p.store, [...(byStore.get(p.store) ?? []), p]);

  const campaigns: Campaign[] = [];

  // ── The site-wide sale ──────────────────────────────────────────────
  const sale = marketing.campaign;
  if (sale.name || sale.active) {
    const joined = (sale.stores ?? []).map((slug) => storeBySlug.get(slug)).filter((s): s is Store => Boolean(s));
    campaigns.push({
      id: SALE_CAMPAIGN_ID,
      kind: "sale",
      name: sale.name || "Site-wide sale",
      headline: `${sale.pct}% off`,
      pct: sale.pct,
      // "Live" with nobody joined would promise a sale nobody is giving.
      status: !sale.active ? "paused" : joined.length > 0 ? "live" : "scheduled",
      stores: joined,
      products: rank(joined.flatMap((s) => (byStore.get(s.slug) ?? []).filter((p) => (p.compareAt ?? 0) > p.price))),
      path: campaignPath({ id: SALE_CAMPAIGN_ID, kind: "sale" }),
      ...PALETTES.emerald,
    });
  }

  // ── Flash deals ─────────────────────────────────────────────────────
  if (flash.name || flash.active) {
    const best = Math.max(
      0,
      ...flashProducts.map((p) => (p.compareAt && p.compareAt > p.price ? discountPct(p.price, p.compareAt) : 0)),
    );
    const state = flashState(flash);
    campaigns.push({
      id: FLASH_CAMPAIGN_ID,
      kind: "flash",
      name: flash.name || "Flash deals",
      headline: best > 0 ? `Up to ${best}% off` : "Flash deals",
      pct: best || undefined,
      status: state,
      endsAt: flash.endsAt || undefined,
      stores: [...new Set(flashProducts.map((p) => p.store))]
        .map((slug) => storeBySlug.get(slug))
        .filter((s): s is Store => Boolean(s)),
      products: flashProducts,
      path: campaignPath({ id: FLASH_CAMPAIGN_ID, kind: "flash" }),
      ...PALETTES.ember,
    });
  }

  // ── Shops' price promotions ─────────────────────────────────────────
  for (const promo of promotions) {
    // Approvals once created these and they never ended; the flash
    // campaign above is what they really are.
    if (isLegacyFlashPromotion(promo.id)) continue;
    const store = storeBySlug.get(promo.store);
    if (!store) continue;
    campaigns.push(fromPromotion(promo, store, byStore.get(store.slug) ?? []));
  }

  // ── Shops' offers ───────────────────────────────────────────────────
  for (const offer of offers) {
    // A coupon's code is for the shop's own followers: no public page.
    if (offer.code) continue;
    const store = storeBySlug.get(offer.store);
    if (!store) continue;
    campaigns.push(fromOffer(offer, store, byStore.get(store.slug) ?? [], t));
  }

  const order: Record<ScheduleStatus, number> = { live: 0, scheduled: 1, paused: 2, ended: 3 };
  const kindOrder: Record<CampaignKind, number> = { sale: 0, flash: 1, promotion: 2, offer: 3 };
  return campaigns.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (b.pct ?? 0) - (a.pct ?? 0) ||
      b.products.length - a.products.length,
  );
}

function fromPromotion(promo: Promotion, store: Store, storeProducts: Product[]): Campaign {
  const covered = promo.productIds?.length
    ? storeProducts.filter((p) => promo.productIds!.includes(p.id))
    : storeProducts;
  return {
    id: promo.id,
    kind: "promotion",
    name: promo.name,
    headline: `${promo.pct}% off`,
    pct: promo.pct,
    status: scheduleStatus(promo),
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    store,
    stores: [store],
    products: rank(covered),
    path: campaignPath({ id: promo.id, kind: "promotion" }),
    ...shopPalette(store.slug),
    image: store.banner,
  };
}

function fromOffer(offer: Offer, store: Store, storeProducts: Product[], t: T): Campaign {
  return {
    id: offer.id,
    kind: "offer",
    name: offer.name,
    headline: offerHeadline(offer, t, money),
    pct: offer.pct,
    status: scheduleStatus(offer),
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    store,
    stores: [store],
    products: rankPicks(storeProducts.filter((p) => offerReaches(offer, p))),
    path: campaignPath({ id: offer.id, kind: "offer" }),
    ...shopPalette(store.slug),
    image: store.banner,
  };
}

export async function getCampaign(id: string, t?: T): Promise<Campaign | undefined> {
  return (await getCampaigns(t)).find((c) => c.id === id);
}

/** The campaigns a shop is running or taking part in — for its dashboard. */
export async function getCampaignsForStore(slug: string): Promise<Campaign[]> {
  return (await getCampaigns()).filter((c) => c.stores.some((s) => s.slug === slug) || c.store?.slug === slug);
}

/**
 * Which campaigns may appear on the home page at all: running, not taken
 * off by the admin, with at least one product to show, and — for a
 * shop's own campaign — from a shop that is listed on the marketplace (a
 * shop that opted out of discovery asked not to be put in front of people).
 */
export function homeEligible(campaigns: Campaign[], marketing: MarketingSettings): Campaign[] {
  const { hidden } = campaignFeed(marketing);
  return campaigns.filter(
    (c) =>
      c.status === "live" &&
      !hidden.includes(c.id) &&
      c.products.length > 0 &&
      (!c.store || isListedOnMarketplace(c.store)),
  );
}

/** The hero's slides, in order, as decided once for the page and the admin. */
export type HeroPlanItem =
  | { type: "brand" }
  | { type: "banner"; id: string }
  | { type: "campaign"; campaign: Campaign }
  | { type: "new" }
  | { type: "brands" };

export const MAX_HERO_SLIDES = 6;
/** How many shop promotions may take a hero slide at once. */
const MAX_SHOP_SLIDES = 2;

/**
 * The order of the hero, shared by the home page and the admin's preview
 * of it so the two can never disagree.
 *
 * The marketplace's own slide, then the admin's banners (paid placements
 * and the campaigns they designed artwork for go first), then campaigns
 * that are running — the site-wide sale, flash deals, the strongest shop
 * sales, the best shop offer — and finally the evergreen slides. The
 * evergreen ones are what get cut when the frame is full.
 */
export function planHero({
  marketing,
  bannerIds,
  campaigns,
  hasNewArrivals,
  officialBrandCount,
}: {
  marketing: MarketingSettings;
  /** The banners up right now, in the admin's order. */
  bannerIds: string[];
  /** homeEligible() campaigns. */
  campaigns: Campaign[];
  hasNewArrivals: boolean;
  officialBrandCount: number;
}): HeroPlanItem[] {
  const visible = (key: string) => marketing.sections.some((s) => s.key === key && s.visible);
  const feed = campaignFeed(marketing);

  const plan: HeroPlanItem[] = [{ type: "brand" }];
  // The banners join only while the admin has the "banners" section on,
  // so that switch still means what it always meant.
  if (visible("banners")) plan.push(...bannerIds.map((id) => ({ type: "banner" as const, id })));

  const smart: HeroPlanItem[] = [];
  // Flash has always followed its own section's switch, not the feed's.
  const flash = campaigns.find((c) => c.kind === "flash");
  if (flash && visible("flash")) smart.push({ type: "campaign", campaign: flash });
  if (feed.hero) {
    const sale = campaigns.find((c) => c.kind === "sale");
    if (sale) smart.push({ type: "campaign", campaign: sale });
    for (const c of campaigns.filter((c) => c.kind === "promotion").slice(0, MAX_SHOP_SLIDES)) {
      smart.push({ type: "campaign", campaign: c });
    }
    // The offer with the most products behind it.
    const offer = campaigns
      .filter((c) => c.kind === "offer")
      .sort((a, b) => b.products.length - a.products.length)[0];
    if (offer) smart.push({ type: "campaign", campaign: offer });
  }
  if (visible("new") && hasNewArrivals) smart.push({ type: "new" });
  if (visible("brands") && officialBrandCount >= 2) smart.push({ type: "brands" });

  return [...plan, ...smart.slice(0, Math.max(0, MAX_HERO_SLIDES - plan.length))];
}

/** "Today's Campaigns" fills to this many cards — two full rows of three on a computer. */
export const MAX_TILES = 6;

/** The campaigns that get an automatic tile, after the admin's own tiles. */
export function planTiles(marketing: MarketingSettings, campaigns: Campaign[], manualCount: number): Campaign[] {
  if (!campaignFeed(marketing).tiles) return [];
  return campaigns.slice(0, Math.max(0, MAX_TILES - manualCount));
}
