/**
 * The promo code a shopper applied in the cart, carried to checkout.
 *
 * Kept in sessionStorage — it belongs to this shopping trip, not to the
 * device — and only ever as the code they typed. What it is worth is
 * decided by the marketing settings, and checked again by the server when
 * the order is placed (submitOrderAction).
 */
export const PROMO_KEY = "bm-promo";

export function promoMatches(input: string, promo: { code: string; pct: number }): boolean {
  const code = promo.code.trim().toUpperCase();
  return Boolean(code) && promo.pct > 0 && input.trim().toUpperCase() === code;
}

/**
 * The code applied earlier in this visit, if any. Not checked here: the
 * code may be the marketplace promo or a shop's own coupon, and only the
 * server knows which (priceCartAction says, every time it prices).
 */
export function readAppliedPromo(): string | null {
  try {
    const saved = sessionStorage.getItem(PROMO_KEY)?.trim().toUpperCase();
    return saved && /^[A-Z0-9]{3,20}$/.test(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeAppliedPromo(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(PROMO_KEY, code.trim().toUpperCase());
    else sessionStorage.removeItem(PROMO_KEY);
  } catch {
    // Private mode: the code just has to be typed again at checkout.
  }
}
