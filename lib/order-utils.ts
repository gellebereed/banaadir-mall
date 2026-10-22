/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MULTI-VENDOR ORDER SPLITTING — safe to import from client and server.
 * ─────────────────────────────────────────────────────────────────────────
 * A cart can hold items from several stores. Each store packs and ships its
 * own parcel, so one checkout produces one order record PER STORE:
 *
 *   Cart: Karaca kettle + US Polo shirt
 *     BM-12345        ← the customer-facing base id
 *       ├─ BM-12345-KARA   store: karaca-home     (kettle)
 *       └─ BM-12345-USPO   store: us-polo-assn    (shirt)
 *
 * This module owns that id scheme. It used to live inline in
 * submitOrderAction while the checkout screen quoted the BASE id — so the
 * number a customer was shown, and sent to a vendor over WhatsApp, matched
 * no stored record at all. Anything that needs a vendor order id must come
 * through here so the two can never drift again.
 */

/** A cart line reduced to what the split cares about. */
export interface SplittableLine {
  /** Store slug the product belongs to. */
  store: string;
}

/**
 * Vendor order ids for one checkout, keyed by store slug.
 *
 * A single-store order keeps the plain base id — there is nothing to
 * disambiguate, and a bare "BM-12345" is what customers expect to read out
 * over the phone.
 *
 * The suffix is derived from the slug so it means something at a glance,
 * but slugs can share their first four characters ("karaca-home" and
 * "karaca-kids" both give "KARA"). Two identical ids in one order would
 * upsert over each other in Supabase and silently lose a vendor's parcel,
 * so collisions get a numeric tail.
 */
export function vendorOrderIds(baseId: string, storeSlugs: string[]): Map<string, string> {
  const unique = [...new Set(storeSlugs)];
  const ids = new Map<string, string>();

  if (unique.length <= 1) {
    if (unique.length === 1) ids.set(unique[0], baseId);
    return ids;
  }

  const used = new Set<string>();
  for (const slug of unique) {
    const stem = slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "STOR";
    let suffix = stem;
    let n = 2;
    while (used.has(suffix)) suffix = `${stem}${n++}`;
    used.add(suffix);
    ids.set(slug, `${baseId}-${suffix}`);
  }
  return ids;
}

/** The vendor order id for one store — see vendorOrderIds for the scheme. */
export function vendorOrderId(baseId: string, storeSlug: string, allStoreSlugs: string[]): string {
  return vendorOrderIds(baseId, allStoreSlugs).get(storeSlug) ?? baseId;
}

/**
 * Group cart lines by store, preserving the order stores first appear in
 * so the checkout screen and the saved records list parcels identically.
 */
export function groupByStore<T extends SplittableLine>(lines: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const line of lines) {
    const existing = grouped.get(line.store);
    if (existing) existing.push(line);
    else grouped.set(line.store, [line]);
  }
  return grouped;
}

/**
 * Does `candidate` belong to the order `baseId`? True for the base id
 * itself and for any vendor parcel beneath it.
 *
 * Tracking has to accept the base id, because that is the only number the
 * customer was ever given — while the records actually stored are the
 * per-vendor ones.
 */
export function belongsToOrder(candidate: string, baseId: string): boolean {
  const a = candidate.trim().toLowerCase();
  const b = baseId.trim().toLowerCase();
  return a === b || a.startsWith(`${b}-`);
}

/**
 * Rank used to decide an order's overall status from its parcels.
 * Cancelled sits outside the progression, so it is handled separately.
 */
const STATUS_RANK: Record<string, number> = {
  cancelled: -1, pending: 0, processing: 1, shipped: 2, delivered: 3,
};

/**
 * The status of a whole order given its parcels: the LEAST advanced one.
 *
 * An order is only "delivered" once every parcel has arrived — reporting
 * delivered while a second parcel is still with a courier is the kind of
 * thing customers open disputes over.
 *
 * A cancelled parcel does not hold the rest back. One vendor cancelling
 * shouldn't make the whole order read as cancelled while the others ship;
 * only an order where EVERY parcel is cancelled is cancelled.
 */
export function mergeParcelStatuses<T extends { status: string }>(parcels: T[]): string {
  if (parcels.length === 0) return "pending";

  const live = parcels.filter((p) => p.status !== "cancelled");
  if (live.length === 0) return "cancelled";

  return live.reduce(
    (worst, p) => (STATUS_RANK[p.status] < STATUS_RANK[worst] ? p.status : worst),
    live[0].status,
  );
}

/**
 * The customer-facing base id for any vendor parcel id:
 * "BM-12345-KARA" → "BM-12345". Ids are "BM-<digits>" plus an optional
 * suffix, so only a trailing non-numeric segment is stripped — a base id
 * that happens to contain a dash is left alone.
 */
export function baseOrderId(orderId: string): string {
  const match = orderId.trim().match(/^(.*?)-([A-Za-z][A-Za-z0-9]*)$/);
  return match ? match[1] : orderId.trim();
}

/**
 * A new customer-facing order number: "BM-" and ten random digits.
 *
 * It used to be five (BM-10000…BM-99999). With that few, two customers
 * were likely to share a number after a few hundred orders, and anyone
 * could type numbers into /track until one showed somebody's parcel.
 * Ten digits keeps the "BM-<digits>" shape every parser here expects
 * (baseOrderId, the tracking box), and submitOrderAction still refuses a
 * number that is already taken.
 */
export function newOrderId(): string {
  const digits = new Uint32Array(2);
  globalThis.crypto.getRandomValues(digits);
  const n = (digits[0] % 100_000) * 100_000 + (digits[1] % 100_000);
  return `BM-${String(n).padStart(10, "0")}`;
}

/**
 * Is this order the signed-in shopper's?
 *
 * Matched on the order's email ALONE. An order with no email belongs to no
 * account: it used to fall back to the customer's name, and since email is
 * optional at checkout that covered most guest orders — anyone who
 * registered as "Mohamed Ali" saw every email-less order placed under that
 * name, address and phone included. Signed-in orders always carry the
 * account's email (submitOrderAction), and a guest's own orders still show
 * from the copy kept on their phone (AccountOrdersClient).
 */
export function orderBelongsTo(
  order: { email?: string },
  user: { email: string },
): boolean {
  const email = user.email.trim().toLowerCase();
  return Boolean(email) && order.email?.trim().toLowerCase() === email;
}
