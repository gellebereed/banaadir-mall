/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STAGE 4 (b) — cost price → shelf price.
 * ─────────────────────────────────────────────────────────────────────────
 * A supplier invoice carries what you PAID. Importing that number into
 * `Product.price` puts suits on the storefront at $58 and socks at $1.35,
 * and nothing in the system would flag it — the products look fine, they
 * are simply being sold at a loss.
 *
 * So the selling price is always calculated, and the calculation is a
 * decision the seller makes in the wizard rather than a constant hidden in
 * here. Cost varies by two orders of magnitude across one invoice —
 *
 *     SOCKS         $1.35 –   $3.43
 *     BASIC TSHIRT  $3.61 –   $6.47
 *     SUIT         $58.28 – $136.63
 *
 * — so a single global multiplier prices either the socks or the suits
 * wrongly. Markup is therefore per category, with a global fallback.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type RoundingMode = "none" | "ends-99" | "ends-90" | "whole";

export interface PricingRules {
  /** Currency the COST column is in. Display only — no rates are fetched. */
  currency: string;
  /** Multiply cost by this to reach store currency. 1 when already in it. */
  fxRate: number;
  /** Used when a category has no entry of its own. */
  defaultMarkup: number;
  /** Category slug → markup multiplier. */
  markupByCategory: Record<string, number>;
  rounding: RoundingMode;
  /**
   * Show the marked-up price as a struck-through "was" price and sell at a
   * discount. 0 disables it.
   */
  compareAtUplift: number;
}

/**
 * Starting points, not rules. Low-ticket items carry a higher multiple
 * because a 2× markup on a $1.35 sock is $2.70 — under the handling cost
 * — while 2× on a $137 suit is already a $137 gross margin.
 */
export const DEFAULT_MARKUPS: Record<string, number> = {
  socks: 3.0,
  underwear: 2.8,
  "t-shirts": 2.8,
  accessories: 2.8,
  ties: 2.8,
  "bow-ties-and-cummerbunds": 2.8,
  bracelets: 2.8,
  shirts: 2.5,
  "short-sleeve-shirts": 2.5,
  "non-iron-shirts": 2.5,
  "shirt-jackets": 2.4,
  trousers: 2.4,
  bags: 2.4,
  shoes: 2.2,
  jackets: 2.2,
  suits: 2.0,
};

export const DEFAULT_PRICING: PricingRules = {
  currency: "USD",
  fxRate: 1,
  defaultMarkup: 2.5,
  markupByCategory: DEFAULT_MARKUPS,
  rounding: "ends-99",
  compareAtUplift: 0,
};

/** The multiplier that applies to a category. */
export function markupFor(categorySlug: string | undefined, rules: PricingRules): number {
  const specific = categorySlug ? rules.markupByCategory[categorySlug] : undefined;
  const markup = specific ?? rules.defaultMarkup;
  // A markup below 1 would sell every item at a loss; almost always a typo.
  return Number.isFinite(markup) && markup > 0 ? markup : 1;
}

/**
 * Round to a price a shopper reads as a price.
 *
 * "ends-99" always rounds UP, never down — rounding $24.00 down to $23.99
 * would quietly shave the margin the markup was chosen to produce.
 */
export function roundPrice(value: number, mode: RoundingMode): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  switch (mode) {
    case "ends-99":
      return round2(Math.ceil(value + 0.01) - 0.01);
    case "ends-90":
      return round2(Math.ceil(value + 0.1) - 0.1);
    case "whole":
      return Math.ceil(value);
    default:
      return round2(value);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PricedItem {
  /** Cost per unit in store currency. */
  cost: number;
  /** Selling price. */
  price: number;
  /** Struck-through "was" price, when an uplift is configured. */
  compareAt?: number;
}

/**
 * Price one product.
 *
 * `suppliedPrice` wins when the file already carries a retail price —
 * a seller who has done the pricing work should not have it recalculated.
 */
export function priceItem(
  cost: number | undefined,
  suppliedPrice: number | undefined,
  categorySlug: string | undefined,
  rules: PricingRules,
): PricedItem {
  const costInStoreCurrency = round2((cost ?? 0) * (rules.fxRate || 1));

  const price =
    suppliedPrice !== undefined && suppliedPrice > 0
      ? round2(suppliedPrice * (rules.fxRate || 1))
      : roundPrice(costInStoreCurrency * markupFor(categorySlug, rules), rules.rounding);

  const compareAt =
    rules.compareAtUplift > 0
      ? roundPrice(price * (1 + rules.compareAtUplift / 100), rules.rounding)
      : undefined;

  return { cost: costInStoreCurrency, price, compareAt };
}
