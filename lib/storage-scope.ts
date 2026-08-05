/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PER-ACCOUNT BROWSER STORAGE.
 * ─────────────────────────────────────────────────────────────────────────
 * The cart, the wishlist and the taste profile all live in localStorage,
 * which is scoped to the DEVICE. On a personal laptop that is the same
 * thing as being scoped to the person. On a shared phone — which is how a
 * great many people in this marketplace's actual market shop — it is not:
 * signing in as somebody else left you looking at the previous person's
 * basket, their saved items, and recommendations built from their browsing.
 *
 * So every one of those keys is namespaced by who is signed in.
 *
 * ── The namespace is a hash, not the email ───────────────────────────────
 * `bm-cart:ayaan@example.com` sitting in localStorage tells anyone who
 * opens devtools on a shared machine which accounts have been used on it.
 * A short non-reversible digest identifies the namespace just as well and
 * discloses nothing.
 *
 * ── Guest data is adopted once, then handed over ─────────────────────────
 * Someone browses signed out, fills a basket, and signs in at checkout —
 * losing that basket at the moment of purchase would be indefensible. So
 * the first time an account is seen on a device, it ADOPTS whatever the
 * guest namespace holds.
 *
 * The counterpart matters just as much: signing OUT clears the guest
 * namespace. Without that, everything the previous person did would still
 * be sitting in the guest bucket, waiting to be adopted by the next account
 * that signs in on the same phone — which is the leak this module exists to
 * close, reappearing by the back door.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The namespace used when nobody is signed in. */
export const GUEST_SCOPE = "guest";

/**
 * Every per-shopper key in the app. Kept in one list so a new one cannot
 * be added without a decision about what happens to it on sign-out.
 *
 *   bm-cart / bm-wishlist / bm-taste  the basket, saved items, and the
 *                                     browsing history behind the shelves.
 *   banaadir_user_orders              a browser-side copy of orders placed,
 *                                     so tracking works before the server
 *                                     has caught up.
 *   banaadir_delivery_address         the saved name, phone and address.
 *                                     The most sensitive of the set — an
 *                                     unscoped copy pre-filled the next
 *                                     person's checkout with the previous
 *                                     person's delivery details, which is a
 *                                     disclosure and a misdelivery waiting
 *                                     to happen.
 */
export const SHOPPER_KEYS = [
  "bm-cart",
  "bm-wishlist",
  "bm-taste",
  "banaadir_user_orders",
  "banaadir_delivery_address",
] as const;

/**
 * A short, stable, non-reversible id for an account.
 *
 * FNV-1a. This is a namespacing device, not a security control — it keeps
 * addresses out of plain sight in devtools, and nothing here depends on it
 * being hard to reverse.
 */
export function scopeFor(email?: string | null): string {
  const clean = email?.trim().toLowerCase();
  if (!clean) return GUEST_SCOPE;

  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `u${hash.toString(36)}`;
}

/** `bm-cart` + `u1a2b3c` → `bm-cart:u1a2b3c`. Guest keeps the bare key. */
export function scopedKey(base: string, scope: string): string {
  return scope === GUEST_SCOPE ? base : `${base}:${scope}`;
}

/**
 * Move the guest namespace's data into an account's, the first time that
 * account is seen on this device. Returns true when something was adopted.
 *
 * Deliberately non-destructive toward the account: if the account already
 * has data under a key, the guest copy is discarded rather than merged.
 * Merging a stranger's basket into yours because you both used the same
 * phone is worse than losing an anonymous one.
 */
export function adoptGuestData(keys: string[], scope: string): boolean {
  if (typeof window === "undefined" || scope === GUEST_SCOPE) return false;

  let adopted = false;
  for (const base of keys) {
    try {
      const guestValue = window.localStorage.getItem(base);
      if (!guestValue) continue;

      const target = scopedKey(base, scope);
      if (window.localStorage.getItem(target) === null) {
        window.localStorage.setItem(target, guestValue);
        adopted = true;
      }
      // Either way the guest copy is done: it has been handed over, or it
      // belongs to a session this account should not inherit.
      window.localStorage.removeItem(base);
    } catch {
      // A full or blocked quota must never break sign-in.
    }
  }
  return adopted;
}

/** Wipe the guest namespace. Called on sign-out — see the note above. */
export function clearGuestData(keys: string[]): void {
  if (typeof window === "undefined") return;
  for (const base of keys) {
    try {
      window.localStorage.removeItem(base);
    } catch {
      // Ignore storage errors.
    }
  }
}
