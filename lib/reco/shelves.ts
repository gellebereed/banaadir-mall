/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHELVES — what each page actually asks for.
 * ─────────────────────────────────────────────────────────────────────────
 * A surface is a stack of shelves, each with its own blend of strategies,
 * its own title, and its own honest explanation of where it came from.
 *
 * ── Two rules govern the whole stack ─────────────────────────────────────
 *
 * NOTHING APPEARS TWICE. Ids are excluded as they are used, top to bottom.
 * A product that shows up in three rails on one page does not read as three
 * good suggestions; it reads as a shop with eight products.
 *
 * SHELVES EARN THEIR PLACE. Every shelf is dropped when it cannot be filled
 * to its minimum, and the personalised ones are suppressed entirely below a
 * confidence floor. A "Chosen for you" rail assembled from two page views
 * is worse than no rail at all — it teaches the shopper that the label is
 * decoration, and then the label never works again.
 *
 * That second rule is what makes the home page feel alive rather than
 * merely dynamic. A first-time visitor sees momentum and discovery, which
 * genuinely change day to day because they are computed from yesterday's
 * orders. A returning one sees their own unfinished business at the top.
 * Same code, different page, no editorial work.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Blender } from "./engine";
import type { RecoContext } from "./strategies";
import { categoryName, storeName } from "./strategies";
import { topKeys } from "./taste";
import type { Shelf, Surface } from "./types";

interface ShelfSpec {
  id: string;
  title: string;
  subtitle?: string;
  why: string;
  glyph: string;
  tone: Shelf["tone"];
  layout: Shelf["layout"];
  limit: number;
  /** Below this many results the shelf is dropped rather than shown thin. */
  minimum: number;
  weights: Record<string, number>;
  /**
   * The strategy that owns the card copy on this shelf — set wherever the
   * title makes a specific promise, left unset where varied explanations
   * are the point ("Chosen for you"). See BlendSpec.reasonFrom.
   */
  reasonFrom?: string;
  href?: string;
  explore?: boolean;
  maxPerStore?: number;
  maxPerCategory?: number;
  /**
   * Show a product even when the page already displays it elsewhere.
   *
   * Only "Pick up where you left off" sets this. Its whole claim is that
   * YOU were looking at this — which stays true, and stays worth saying,
   * when the product also happens to be in the marketplace's trending rail
   * further down the page.
   */
  allowPageDuplicates?: boolean;
  /** Gate — return false and the shelf is never even blended. */
  when?: (ctx: RecoContext) => boolean;
}

/** Enough history for a shelf to be allowed to say "you". */
const PERSONAL_FLOOR = 0.15;

export function composeShelves(
  ctx: RecoContext,
  blender: Blender,
  surface: Surface,
  options: { firstName?: string; alreadyOnPage?: string[] } = {},
): Shelf[] {
  const specs = specsFor(surface, ctx, options.firstName);
  // What this stack has already spent, and what the page shows outside it.
  const used = new Set<string>();
  const onPage = new Set<string>(options.alreadyOnPage ?? []);
  const shelves: Shelf[] = [];

  for (const spec of specs) {
    if (spec.when && !spec.when(ctx)) continue;

    const items = blender.blend({
      weights: spec.weights,
      limit: spec.limit,
      minimum: spec.minimum,
      exclude: used,
      demote: spec.allowPageDuplicates ? undefined : onPage,
      reasonFrom: spec.reasonFrom,
      explore: spec.explore,
      maxPerStore: spec.maxPerStore,
      maxPerCategory: spec.maxPerCategory,
    });

    if (items.length < spec.minimum) continue;
    for (const item of items) used.add(item.product.id);

    shelves.push({
      id: spec.id,
      title: spec.title,
      subtitle: spec.subtitle,
      tone: spec.tone,
      glyph: spec.glyph,
      layout: spec.layout,
      href: spec.href,
      why: spec.why,
      items,
    });
  }

  return shelves;
}

// ── Per-surface stacks ─────────────────────────────────────────────────

function specsFor(surface: Surface, ctx: RecoContext, firstName?: string): ShelfSpec[] {
  switch (surface) {
    case "product":
      return productSpecs(ctx);
    case "cart":
      return cartSpecs(ctx);
    case "wishlist":
      return wishlistSpecs(ctx);
    case "confirmation":
      return confirmationSpecs(ctx);
    case "home":
    default:
      return homeSpecs(ctx, firstName);
  }
}

const personal = (ctx: RecoContext) => ctx.taste.confidence >= PERSONAL_FLOOR;

function homeSpecs(ctx: RecoContext, firstName?: string): ShelfSpec[] {
  const forYouTitle = firstName ? `Chosen for you, ${firstName}` : "Chosen for you";
  const favouriteStore = topKeys(ctx.taste.stores, 1)[0];

  return [
    {
      id: "continue",
      title: "Pick up where you left off",
      subtitle: "Still in your basket-to-be",
      why: "These are products you opened recently and haven't bought. Nothing else went into choosing them.",
      glyph: "↩",
      tone: "personal",
      layout: "rail",
      limit: 8,
      minimum: 2,
      maxPerStore: 4,
      maxPerCategory: 6,
      reasonFrom: "continue",
      allowPageDuplicates: true,
      weights: { continue: 1 },
    },
    {
      id: "price-drops",
      title: "Cheaper than when you looked",
      subtitle: "Live promotions on things you'd already found",
      why: "Products you saved or viewed whose price has genuinely fallen — the discount is a seller promotion running right now, not a struck-through price.",
      glyph: "↓",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 1,
      maxPerStore: 3,
      reasonFrom: "price-drop",
      weights: { "price-drop": 1 },
    },
    {
      id: "for-you",
      title: forYouTitle,
      subtitle: "Built from what you've browsed, saved and bought",
      why: "Ranked on the departments, shops, brands and price range you actually engage with — weighted so a purchase counts far more than a glance, and so last month counts less than last week. One slot is always kept for something outside your usual taste.",
      glyph: "✦",
      tone: "personal",
      layout: "grid",
      limit: 8,
      minimum: 4,
      explore: true,
      when: personal,
      weights: { taste: 1, saved: 0.55, rising: 0.2, "price-drop": 0.3, popular: 0.1 },
    },
    {
      id: "basket",
      title: "Finish what you started",
      subtitle: "Goes with what's already in your basket",
      why: "Products that real shoppers bought in the same order as the items in your basket. Only cross-department pairings count, so you get the thing that goes with it — not another one of it.",
      glyph: "🧺",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 2,
      when: (c) => c.cartIds.length > 0,
      reasonFrom: "basket",
      weights: { basket: 1, completes: 0.35 },
    },
    {
      id: "rising",
      title: "Moving fast this week",
      subtitle: ctx.momentum.city
        ? `What ${ctx.momentum.city} is buying more of`
        : "What the mall is buying more of",
      why: "Ranked by acceleration, not by all-time sales: how much more each product sold in the last seven days than the seven before. It changes on its own as orders come in.",
      glyph: "📈",
      tone: "social",
      layout: "rail",
      limit: 8,
      minimum: 3,
      reasonFrom: "rising",
      weights: { rising: 1, popular: 0.15 },
    },
    {
      id: "saved-like",
      title: "More like the things you saved",
      why: "Each of these is matched against a specific product on your wishlist — the card tells you which one.",
      glyph: "♡",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: (c) => c.taste.wished.size > 0,
      reasonFrom: "saved",
      weights: { saved: 1, taste: 0.3 },
    },
    {
      id: "new-from-stores",
      title: favouriteStore
        ? `Just landed at ${storeName(ctx, favouriteStore)}`
        : "Just landed",
      why: "New listings from the shops you return to most.",
      glyph: "✨",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: personal,
      reasonFrom: "new-from-stores",
      weights: { "new-from-stores": 1 },
    },
    {
      id: "loved",
      title: "Loved across the mall",
      subtitle: "Highly rated by shoppers who bought them",
      why: "Ranked on a rating adjusted for how many reviews it rests on, so one five-star review can't outrank a 4.6 from three hundred.",
      glyph: "★",
      tone: "social",
      layout: "grid",
      limit: 8,
      minimum: 4,
      when: (c) => !personal(c),
      reasonFrom: "popular",
      weights: { popular: 1, rising: 0.3 },
    },
    {
      id: "discover",
      title: "Worth a look",
      subtitle: "Outside your usual departments, on purpose",
      why: "Well-rated products from departments you haven't been browsing. Deliberately not personalised — a shop that only ever shows you more of the same stops being worth browsing.",
      glyph: "🧭",
      tone: "discovery",
      layout: "rail",
      limit: 6,
      minimum: 3,
      maxPerCategory: 2,
      reasonFrom: "discover",
      weights: { discover: 1 },
    },
  ];
}

function productSpecs(ctx: RecoContext): ShelfSpec[] {
  const seed = ctx.seed;
  const partnerTitle = completionTitle(ctx);

  return [
    {
      id: "completes",
      title: partnerTitle,
      subtitle: "What shoppers pair it with",
      why: "Taken from orders that contained this product: the items that appeared alongside it far more often than chance would explain, in a different department — so these go with it rather than replace it.",
      glyph: "＋",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 2,
      maxPerCategory: 2,
      reasonFrom: "completes",
      weights: { completes: 1, basket: 0.3 },
    },
    {
      id: "also-like",
      title: "You may also like",
      subtitle: seed ? `Alternatives to ${seed.name}` : undefined,
      why: "Alternatives to what you're looking at, matched on department, brand, materials and the distinctive words in the product names — then re-ordered so no two suggestions are near-duplicates of each other.",
      glyph: "◈",
      tone: "personal",
      layout: "grid",
      limit: 8,
      minimum: 3,
      explore: true,
      href: seed ? `/category/${seed.category}` : undefined,
      reasonFrom: "similar",
      weights: { similar: 1, "bought-together": 0.7, taste: 0.45, popular: 0.12 },
    },
    {
      id: "seed-store",
      title: seed ? `More from ${storeName(ctx, seed.store)}` : "More from this shop",
      why: "Everything else this seller lists, closest to the product you're viewing first.",
      glyph: "🏪",
      tone: "utility",
      layout: "rail",
      limit: 6,
      // Two is enough for this one: by the time it runs, the shelves above
      // have already taken the best of this seller's range, and "more from
      // this shop" reads fine with a short row.
      minimum: 2,
      maxPerStore: 6,
      maxPerCategory: 6,
      href: seed ? `/store/${seed.store}` : undefined,
      reasonFrom: "seed-store",
      weights: { "seed-store": 1 },
    },
    {
      id: "for-you-pdp",
      title: "Because of what you've been browsing",
      why: "Your own history, not this product: departments, shops and price range you engage with, weighted toward the last two weeks.",
      glyph: "✦",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: personal,
      weights: { taste: 1, continue: 0.4, saved: 0.4 },
    },
  ];
}

function cartSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "basket-completes",
      title: "Goes with what's in your basket",
      subtitle: "From orders that contained the same items",
      why: "Cross-department products that real orders paired with what you're buying. Nothing from the same department, so you won't be offered a second one of something you already have.",
      glyph: "🧺",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 2,
      maxPerCategory: 2,
      reasonFrom: "basket",
      weights: { basket: 1, completes: 0.5 },
    },
    {
      id: "cart-saved",
      title: "Still on your wishlist",
      subtitle: "Add them now and they ship together",
      why: "Products you saved earlier. Combining them into this order means one delivery instead of two.",
      glyph: "♡",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 1,
      when: (c) => c.taste.wished.size > 0,
      reasonFrom: "saved",
      weights: { continue: 0.4, saved: 1 },
    },
  ];
}

function wishlistSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "wishlist-drops",
      title: "Price dropped on your saved items",
      why: "A seller promotion is live on these right now. The percentage is the real difference from the price you first saw.",
      glyph: "↓",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 1,
      reasonFrom: "price-drop",
      weights: { "price-drop": 1 },
    },
    {
      id: "wishlist-like",
      title: "More like what you saved",
      why: "Each is matched to one specific product on your list — the card names it.",
      glyph: "♡",
      tone: "personal",
      layout: "grid",
      limit: 8,
      minimum: 3,
      explore: true,
      reasonFrom: "saved",
      weights: { saved: 1, taste: 0.45 },
    },
    {
      id: "wishlist-completes",
      title: "Would go with them",
      why: "Products that shoppers bought in the same order as the things on your list. The card names which saved item each one pairs with.",
      glyph: "＋",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 2,
      maxPerCategory: 2,
      // Seeded from the WISHLIST, not the basket — this page is about the
      // saved list, and a card here explaining itself in terms of what is
      // in the cart reads as the system talking about the wrong thing.
      reasonFrom: "saved-basket",
      weights: { "saved-basket": 1, basket: 0.3 },
    },
  ];
}

function confirmationSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "order-completes",
      title: "Goes with what you just ordered",
      subtitle: "Add before it ships and it travels in the same parcel",
      why: "Products that shoppers bought alongside the items in your order.",
      glyph: "📦",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 2,
      maxPerCategory: 2,
      reasonFrom: "basket",
      weights: { basket: 1, completes: 0.5 },
    },
    {
      id: "order-next",
      title: "For next time",
      why: "Your browsing history, kept for when you come back. Nothing here is based on the order you just placed alone.",
      glyph: "✦",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: personal,
      weights: { taste: 1, saved: 0.4, rising: 0.2 },
    },
  ];
}

/**
 * "Complete the look" for clothing, "complete the room" for homeware.
 *
 * A small thing that does real work: the generic phrasing reads as
 * boilerplate, while the specific one reads as a shop that knows what it
 * sells. Falls back to plain language rather than guessing wrong.
 */
function completionTitle(ctx: RecoContext): string {
  const seed = ctx.seed;
  if (!seed) return "Goes well with it";

  const haystack = `${seed.category} ${seed.subcategory ?? ""} ${categoryName(ctx, seed.category)}`.toLowerCase();

  if (/fashion|clothing|apparel|wear|shoe|dress|shirt|men|women|kids|bag|accessor/.test(haystack)) {
    return "Complete the look";
  }
  if (/home|living|kitchen|cook|bed|bath|furnitur|decor|textile/.test(haystack)) {
    return "Complete the room";
  }
  if (/beauty|cosmetic|care|fragrance|skin/.test(haystack)) {
    return "Completes your routine";
  }
  if (/electronic|phone|computer|tech|audio|gaming/.test(haystack)) {
    return "You'll want these with it";
  }
  return "Goes well with it";
}
