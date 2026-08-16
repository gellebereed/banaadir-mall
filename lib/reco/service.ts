/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE SERVICE — one call, one page of explained recommendations.
 * ─────────────────────────────────────────────────────────────────────────
 * Loads the catalogue through the normal data layer (lib/api.ts, so
 * promotions and the site-wide campaign are already applied), builds the
 * expensive indices once and caches them, derives the shopper's taste from
 * the events their browser posted, and hands the whole thing to the shelf
 * composer.
 *
 * ── Why the indices are cached and the taste is not ──────────────────────
 * The similarity index and the co-purchase graph are functions of the
 * catalogue and the order book — the same for every shopper, expensive to
 * build, and slow to change. They are memoised across requests.
 *
 * The taste vector is a function of one person's last month of browsing.
 * It is cheap, different for everyone, and would be a privacy problem to
 * hold on to. It is rebuilt per request and discarded.
 *
 * That split is the reason the whole system needs no user table, no
 * tracking cookie, and no profile store: the heavy shared structure lives
 * on the server, the personal part lives in the shopper's own browser, and
 * they meet for the length of one request.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  getCategories,
  getListedStores,
  getMarketingSettings,
  getMarketplaceProducts,
  getOrders,
  getRecoSettings,
} from "../api";
import type {
  Category,
  MarketingSettings,
  Order,
  Product,
  RecoPin,
  RecoSettings,
  Store,
} from "../types";
import { choosePrompt } from "./prompts";
import { buildAffinityGraph, type AffinityGraph } from "./affinity";
import { createBlender } from "./engine";
import { buildMomentum, shopperCity, type MomentumIndex } from "./momentum";
import { buildBundle, deliveryGoal } from "./psychology";
import { composeShelves } from "./shelves";
import { buildSimilarityIndex, type SimilarityIndex } from "./similarity";
import { deriveTaste } from "./taste";
import type { RecoContext } from "./strategies";
import { emptyProfile } from "./profile";
import type { RecoRequest, RecoResponse } from "./types";

/**
 * How long a built index is trusted. Short enough that a seller who edits a
 * price sees it reflected almost immediately, long enough that a burst of
 * page loads doesn't rebuild the graph on every one.
 */
const INDEX_TTL_MS = 90_000;

interface CachedIndices {
  signature: string;
  builtAt: number;
  index: SimilarityIndex;
  graph: AffinityGraph;
  momentum: MomentumIndex;
}

let cache: CachedIndices | null = null;

/**
 * Cheap change detector. Catches products added, removed, re-priced or
 * restocked, and orders arriving — which is everything that should
 * invalidate the indices — without hashing the whole catalogue.
 */
function signatureOf(products: Product[], orders: Order[]): string {
  let priceSum = 0;
  let stockSum = 0;
  for (const product of products) {
    priceSum += product.price;
    stockSum += product.stock + (product.variants?.length ?? 0);
  }
  return `${products.length}:${Math.round(priceSum)}:${stockSum}:${orders.length}`;
}

function indicesFor(
  products: Product[],
  orders: Order[],
  city: string | undefined,
  now: number,
): CachedIndices {
  const signature = `${signatureOf(products, orders)}:${city ?? ""}`;
  if (cache && cache.signature === signature && now - cache.builtAt < INDEX_TTL_MS) {
    return cache;
  }

  cache = {
    signature,
    builtAt: now,
    index: buildSimilarityIndex(products),
    graph: buildAffinityGraph(orders, products),
    momentum: buildMomentum(orders, { city, now: new Date(now) }),
  };
  return cache;
}

export interface Identity {
  firstName?: string;
  email?: string;
  name?: string;
}

/**
 * The whole request. Never throws: a page that cannot get recommendations
 * should render without them, not fall over.
 */
export async function recommend(
  request: RecoRequest,
  identity: Identity = {},
): Promise<RecoResponse> {
  const now = Date.now();

  const [products, orders, storeList, categoryList, marketing, settings] = await Promise.all([
    // A recommendation is the definition of being shown something you did
    // not ask for, so an unlisted store never appears in one.
    getMarketplaceProducts(),
    getOrders(),
    getListedStores(),
    getCategories(true),
    getMarketingSettings(),
    getRecoSettings(),
  ]);

  // The master switch. Off means the storefront behaves as it did before
  // the recommender existed — no shelves, no prompts, nothing to explain.
  if (!settings.enabled) return { shelves: [], confidence: 0 };

  const byId = new Map(products.map((product) => [product.id, product]));

  // Only ever the shopper's own past orders — see momentum.ts.
  const city = shopperCity(orders, { email: identity.email, name: identity.name });
  const { index, graph, momentum } = indicesFor(products, orders, city, now);

  const profile = request.profile ?? emptyProfile();
  const taste = deriveTaste(profile, byId, now);

  // The browser's own wishlist wins over whatever the event log implies —
  // see RecoRequest.wishlist.
  if (request.wishlist) {
    taste.wished = new Set(request.wishlist.filter((id) => byId.has(id)));
  }

  // Admin blocks join the shopper's own mutes. Both end up in the same set
  // because they mean the same thing to every downstream filter: never
  // show this. The admin's list is the blunter instrument — it applies to
  // everyone — which is why it lives beside the personal one rather than
  // as a separate check somebody could forget to make.
  for (const id of settings.blocked) taste.muted.add(id);

  const cartIds = (request.cart ?? [])
    .map((line) => line.productId)
    .filter((id) => byId.has(id));

  const ctx: RecoContext = {
    products,
    byId,
    stores: new Map<string, Store>(storeList.map((store) => [store.slug, store])),
    categories: new Map<string, Category>(categoryList.map((c) => [c.slug, c])),
    taste,
    index,
    graph,
    momentum,
    seed: request.seedId ? byId.get(request.seedId) : undefined,
    cartIds,
    pins: livePins(settings, byId, now),
    now,
  };

  const blender = createBlender(ctx);
  const shelves = composeShelves(ctx, blender, request.surface, {
    firstName: identity.firstName,
    alreadyOnPage: request.excludeIds,
    settings,
  });

  return {
    shelves,
    bundle: ctx.seed ? buildBundle(ctx.seed, ctx) : undefined,
    goal: goalFor(request, marketing, ctx),
    prompt: choosePrompt({
      surface: request.surface,
      settings: settings.prompts,
      profile,
      taste,
      categories: categoryList,
      orders,
      byId,
      identity,
      now,
    }),
    promptSettings: settings.prompts,
    firstName: identity.firstName,
    city,
    confidence: taste.confidence,
  };
}

/**
 * Pins that are actually running: inside their date window, switched on,
 * and pointing at a product that still exists and is still buyable.
 *
 * The stock check is here rather than left to the ranker so the reason is
 * recorded once, in the place a merchandiser would look: a push at a
 * sold-out product is not a push, it is a dead slot on the shelf.
 */
function livePins(
  settings: RecoSettings,
  byId: Map<string, Product>,
  now: number,
): { productId: string; shelf: string; note?: string }[] {
  return settings.pins
    .filter((pin) => isPinLive(pin, now))
    .filter((pin) => {
      const product = byId.get(pin.productId);
      return Boolean(product && !product.hidden);
    })
    .map((pin) => ({ productId: pin.productId, shelf: pin.shelf, note: pin.note }));
}

export function isPinLive(pin: RecoPin, now = Date.now()): boolean {
  if (!pin.active) return false;
  if (pin.startsAt && Date.parse(pin.startsAt) > now) return false;
  if (pin.endsAt && Date.parse(pin.endsAt) < now) return false;
  return true;
}

/**
 * The free-delivery meter, only where a basket exists. Showing "you're $12
 * from free delivery" on a product page with an empty basket is a nudge
 * toward a goal the shopper has not adopted, which is the manipulative
 * version of the same mechanic.
 */
function goalFor(
  request: RecoRequest,
  marketing: MarketingSettings,
  ctx: RecoContext,
) {
  if (request.subtotal === undefined || request.subtotal <= 0) return undefined;
  if (request.surface !== "cart" && request.surface !== "home") return undefined;
  return deliveryGoal(request.subtotal, marketing, ctx);
}

/** Test/debug hook — drops the memoised indices. */
export function resetRecoCache(): void {
  cache = null;
}
