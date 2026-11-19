/**
 * PHONE SIGN-IN — the shared rules for "sign in with a code by SMS".
 *
 * ── Why a phone number needs a stand-in email ────────────────────────────
 * Everything that belongs to a shopper is keyed on `session.email`: their
 * orders (orderBelongsTo), wishlist sync, reward wallet, reviews. A shopper
 * who signs up with only a phone number has no email, so they are given a
 * stable stand-in built from the number — `252617778899@phone.banaadirmall.com`.
 * It is never shown, never mailed, and is reserved (isReservedEmail), so
 * nobody can register it with a password and inherit that shopper's orders.
 *
 * Kept outside the "use server" files because the pages need it too.
 */

import { COUNTRIES } from "@/lib/data/locations";

export const PHONE_EMAIL_SUFFIX = "@phone.banaadirmall.com";

/** The dialling codes we send codes to, one per code (+1 is US and Canada). */
export const PHONE_COUNTRIES = COUNTRIES.filter(
  (country, i) => COUNTRIES.findIndex((c) => c.phoneCode === country.phoneCode) === i,
);

/**
 * Country code + what the shopper typed → "+252617778899", or null.
 *
 * Shoppers write their own number every way there is: "061 777 8899",
 * "61-777-8899", "+252 61…", "00252 61…". The leading trunk 0 is dropped
 * (Somali numbers are dialled 061… at home and +252 61… from abroad), and a
 * number typed with its own +code wins over the picker — but only a code
 * we offer, which keeps the SMS bill to the countries we actually serve.
 */
export function toE164(countryCode: string, raw: string): string | null {
  const typed = raw.trim();
  let digits: string;
  if (typed.startsWith("+") || typed.startsWith("00")) {
    digits = typed.replace(/\D/g, "").replace(/^00/, "");
  } else {
    const code = countryCode.replace(/\D/g, "");
    digits = code + typed.replace(/\D/g, "").replace(/^0+/, "");
  }
  const allowed = PHONE_COUNTRIES.some((c) => digits.startsWith(c.phoneCode.replace(/\D/g, "")));
  // E.164: at most 15 digits; anything under 8 is not a mobile number.
  if (!allowed || digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** "+252617778899" → "252617778899@phone.banaadirmall.com" */
export function phoneLoginEmail(e164: string): string {
  return `${e164.replace(/\D/g, "")}${PHONE_EMAIL_SUFFIX}`;
}

export function isPhoneLoginEmail(email: string | undefined | null): boolean {
  return Boolean(email && email.trim().toLowerCase().endsWith(PHONE_EMAIL_SUFFIX));
}

/** What to show where an email would go: the phone number for phone logins. */
export function accountLabel(session: { email: string; phone?: string }): string {
  if (!isPhoneLoginEmail(session.email)) return session.email;
  return session.phone || `+${session.email.slice(0, -PHONE_EMAIL_SUFFIX.length)}`;
}
