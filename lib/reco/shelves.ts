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

import type { RecoSettings, ShelfSlot } from "../types";
import type { Blender } from "./engine";
import type { RecoContext } from "./strategies";
import { categoryName, storeName } from "./strategies";
import { topKeys } from "./taste";
import type { Shelf, Surface } from "./types";

interface ShelfSpec {
  id: string;
  title: string;
  subtitle?: string;
  /** Kicker above the title. See Shelf.eyebrow. */
  eyebrow: string;
  why: string;
  glyph: string;
  tone: Shelf["tone"];
  layout: Shelf["layout"];
  /** Where it lands on the home page. Ignored on other surfaces. */
  slot: ShelfSlot;
  /** Give it a tinted full-bleed band — reserved for the few that earn it. */
  feature?: boolean;
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
  /**
   * Keep admin pushes out of this shelf entirely.
   *
   * Set on the shelves whose whole value is that they are NOT merchandised
   * — "Pick up where you left off" is the shopper's own history, and
   * slipping a promoted product into it is the one thing that would make
   * the row untrustworthy. Same for the deliberate-serendipity rail.
   */
  noPins?: boolean;
  /** Gate — return false and the shelf is never even blended. */
  when?: (ctx: RecoContext) => boolean;
}

/** Enough history for a shelf to be allowed to say "you". */
const PERSONAL_FLOOR = 0.15;

export function composeShelves(
  ctx: RecoContext,
  blender: Blender,
  surface: Surface,
  options: {
    firstName?: string;
    alreadyOnPage?: string[];
    settings?: RecoSettings;
  } = {},
): Shelf[] {
  const specs = specsFor(surface, ctx, options.firstName);
  // What this stack has already spent, and what the page shows outside it.
  const used = new Set<string>();
  const onPage = new Set<string>(options.alreadyOnPage ?? []);
  const shelves: Shelf[] = [];

  const overrides = new Map(
    (options.settings?.shelves ?? []).map((setting) => [setting.key, setting]),
  );
  /**
   * How much an admin push argues for itself, converted from the 1–100
   * dial into the same scale the strategy weights use. At the shipped 55
   * a pin is comparable to the shelf's own headline signal; at 100 it
   * leads; at 10 it is a tiebreaker.
   */
  const pinWeight = ((options.settings?.pinStrength ?? 55) / 100) * 1.8;

  for (const spec of specs) {
    const override = overrides.get(spec.id);
    if (override?.visible === false) continue;
    if (spec.when && !spec.when(ctx)) continue;

    // Pins can target a shelf by id, so the strategy has to know which
    // shelf it is being asked about.
    ctx.shelfId = spec.id;

    const weights = { ...spec.weights };
    if (ctx.pins.length > 0 && pinWeight > 0 && !spec.noPins) {
      weights.pins = pinWeight;
    }

    const items = blender.blend({
      weights,
      limit: spec.limit,
      minimum: spec.minimum,
      exclude: used,
      demote: spec.allowPageDuplicates ? undefined : onPage,
      // A pinned product must survive a shelf that filters by its headline
      // strategy, or an admin push would silently vanish from most of the
      // page and the control would look broken.
      reasonFrom: spec.reasonFrom,
      keepFrom: weights.pins ? "pins" : undefined,
      explore: spec.explore,
      maxPerStore: spec.maxPerStore,
      maxPerCategory: spec.maxPerCategory,
    });

    if (items.length < spec.minimum) continue;
    for (const item of items) used.add(item.product.id);

    shelves.push({
      id: spec.id,
      title: override?.title?.trim() || spec.title,
      subtitle: spec.subtitle,
      eyebrow: spec.eyebrow,
      tone: spec.tone,
      glyph: spec.glyph,
      layout: spec.layout,
      slot: override?.slot ?? spec.slot,
      feature: spec.feature,
      href: spec.href,
      why: spec.why,
      items,
    });
  }

  ctx.shelfId = undefined;
  return surface === "home" ? distribute(shelves, overrides) : shelves;
}

/** Slots in page order. */
const SLOT_ORDER: ShelfSlot[] = ["top", "early", "mid", "late"];

/** More than this in one slot and the page reads as a block of filler. */
const MAX_PER_SLOT = 2;

/**
 * Spread the surviving shelves down the page.
 *
 * Each shelf carries a default slot, but which shelves actually survive
 * depends entirely on the shopper — a first-time visitor might fill only
 * "mid", a regular might fill "early" three times over. Rendering those
 * defaults literally produces exactly the failure this was meant to avoid:
 * a run of four recommendation rows stacked together, with the marketplace's
 * own sections orphaned above and below them.
 *
 * So the defaults are treated as a PREFERENCE, not an instruction. Shelves
 * keep their slot while it has room, and overflow moves to the nearest slot
 * that doesn't — always downward first, since a shelf arriving earlier than
 * intended is more disruptive than one arriving later.
 *
 * Two things are never moved:
 *
 *   AN ADMIN'S CHOICE. If somebody positioned a shelf in /admin/discovery,
 *   that is a decision, not a default, and an algorithm quietly overriding
 *   it is how operators stop trusting the panel.
 *
 *   "PICK UP WHERE YOU LEFT OFF". Its whole value is being the first thing
 *   a returning shopper sees. A version of it three screens down is not a
 *   worse version of the feature, it is a different and useless one.
 */
function distribute(
  shelves: Shelf[],
  overrides: Map<string, { slot?: ShelfSlot }>,
): Shelf[] {
  const counts = new Map<ShelfSlot, number>(SLOT_ORDER.map((slot) => [slot, 0]));
  const lastTone = new Map<ShelfSlot, Shelf["tone"]>();
  const pinnedSlots = new Set(["continue"]);

  const place = (shelf: Shelf, slot: ShelfSlot) => {
    shelf.slot = slot;
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
    lastTone.set(slot, shelf.tone);
  };

  for (const shelf of shelves) {
    if (pinnedSlots.has(shelf.id) || overrides.get(shelf.id)?.slot !== undefined) {
      place(shelf, shelf.slot);
      continue;
    }

    const preferred = SLOT_ORDER.indexOf(shelf.slot);
    // Search downward from the preferred slot, then upward as a last resort:
    // arriving later than intended is less disruptive than arriving earlier.
    const search = [
      ...SLOT_ORDER.slice(preferred),
      ...SLOT_ORDER.slice(0, preferred).reverse(),
    ];
    const hasRoom = search.filter((slot) => (counts.get(slot) ?? 0) < MAX_PER_SLOT);

    /*
     * Prefer a slot that won't stack two rows of the same TONE together.
     *
     * Tone is the band colour, and two personal rows back to back read as
     * one very tall personal row — the visual separation that tells a
     * shopper "this is a different kind of thing" disappears exactly when
     * two rows need it most. Only a preference: a shelf is never dropped or
     * pushed somewhere silly to satisfy it.
     */
    const landing =
      hasRoom.find((slot) => lastTone.get(slot) !== shelf.tone) ??
      hasRoom[0] ??
      shelf.slot;

    place(shelf, landing);
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
      eyebrow: "Where you left off",
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
      slot: "top",
      noPins: true,
      weights: { continue: 1 },
    },
    {
      id: "price-drops",
      eyebrow: "Price watch",
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
      slot: "early",
      weights: { "price-drop": 1 },
    },
    {
      id: "for-you",
      eyebrow: "Yours",
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
      slot: "early",
      feature: true,
      weights: { taste: 1, saved: 0.55, rising: 0.2, "price-drop": 0.3, popular: 0.1 },
    },
    {
      id: "basket",
      eyebrow: "Your basket",
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
      slot: "early",
      weights: { basket: 1, completes: 0.35 },
    },
    {
      id: "rising",
      eyebrow: "Right now",
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
      slot: "mid",
      feature: true,
      weights: { rising: 1, popular: 0.15 },
    },
    {
      id: "saved-like",
      eyebrow: "From your wishlist",
      title: "More like the things you saved",
      why: "Each of these is matched against a specific product on your wishlist — the card tells you which one.",
      glyph: "♡",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: (c) => c.taste.wished.size > 0,
      reasonFrom: "saved",
      slot: "mid",
      weights: { saved: 1, taste: 0.3 },
    },
    {
      id: "new-from-stores",
      eyebrow: "New in",
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
      slot: "mid",
      weights: { "new-from-stores": 1 },
    },
    {
      id: "loved",
      eyebrow: "Most loved",
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
      slot: "mid",
      feature: true,
      weights: { popular: 1, rising: 0.3 },
    },
    {
      id: "discover",
      eyebrow: "Something new",
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
      slot: "late",
      noPins: true,
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
      eyebrow: "Goes together",
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
      slot: "mid",
      weights: { completes: 1, basket: 0.3 },
    },
    {
      id: "also-like",
      eyebrow: "Alternatives",
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
      slot: "mid",
      feature: true,
      weights: { similar: 1, "bought-together": 0.7, taste: 0.45, popular: 0.12 },
    },
    {
      id: "seed-store",
      eyebrow: "This shop",
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
      slot: "late",
      weights: { "seed-store": 1 },
    },
    {
      id: "for-you-pdp",
      eyebrow: "Yours",
      title: "Because of what you've been browsing",
      why: "Your own history, not this product: departments, shops and price range you engage with, weighted toward the last two weeks.",
      glyph: "✦",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: personal,
      slot: "late",
      weights: { taste: 1, continue: 0.4, saved: 0.4 },
    },
  ];
}

function cartSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "basket-completes",
      eyebrow: "Your basket",
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
      slot: "mid",
      feature: true,
      weights: { basket: 1, completes: 0.5 },
    },
    {
      id: "cart-saved",
      eyebrow: "From your wishlist",
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
      slot: "late",
      weights: { continue: 0.4, saved: 1 },
    },
  ];
}

function wishlistSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "wishlist-drops",
      eyebrow: "Price watch",
      title: "Price dropped on your saved items",
      why: "A seller promotion is live on these right now. The percentage is the real difference from the price you first saw.",
      glyph: "↓",
      tone: "utility",
      layout: "rail",
      limit: 6,
      minimum: 1,
      reasonFrom: "price-drop",
      slot: "top",
      weights: { "price-drop": 1 },
    },
    {
      id: "wishlist-like",
      eyebrow: "From your wishlist",
      title: "More like what you saved",
      why: "Each is matched to one specific product on your list — the card names it.",
      glyph: "♡",
      tone: "personal",
      layout: "grid",
      limit: 8,
      minimum: 3,
      explore: true,
      reasonFrom: "saved",
      slot: "mid",
      feature: true,
      weights: { saved: 1, taste: 0.45 },
    },
    {
      id: "wishlist-completes",
      eyebrow: "Goes together",
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
      slot: "late",
      weights: { "saved-basket": 1, basket: 0.3 },
    },
  ];
}

function confirmationSpecs(ctx: RecoContext): ShelfSpec[] {
  return [
    {
      id: "order-completes",
      eyebrow: "Your order",
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
      slot: "mid",
      feature: true,
      weights: { basket: 1, completes: 0.5 },
    },
    {
      id: "order-next",
      eyebrow: "Next time",
      title: "For next time",
      why: "Your browsing history, kept for when you come back. Nothing here is based on the order you just placed alone.",
      glyph: "✦",
      tone: "personal",
      layout: "rail",
      limit: 6,
      minimum: 3,
      when: personal,
      slot: "late",
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
