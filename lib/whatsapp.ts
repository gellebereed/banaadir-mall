/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHATSAPP ORDER NOTIFICATIONS — number handling + message composition.
 * ─────────────────────────────────────────────────────────────────────────
 * Safe to import from client and server; nothing here touches the network.
 *
 * A Banaadir Mall order can span several stores. Each store packs and ships
 * its own parcel, so each one gets its OWN message containing only its own
 * items and its own order id — the same split `submitOrderAction` already
 * performs when it writes the order records.
 *
 * Two rules this module exists to enforce:
 *
 *   1. A vendor is never shown the whole-order total. They are owed for
 *      their items only. Sending the grand total to three vendors means
 *      three vendors each believing they are owed the full amount, which
 *      surfaces as a payment dispute a week later.
 *
 *   2. The order id in the message is the vendor's REAL id
 *      ("BM-12345-KARA"), not the customer-facing base id. Quoting an id
 *      that matches no record is worse than quoting none — the vendor
 *      searches, finds nothing, and stops trusting the system.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Amounts in these messages are always written to two decimals.
 *
 * The shared `money()` helper drops trailing zeros — right for a price tag
 * ("$49"), wrong for an order document, where it produces "$29.5" and makes
 * a column of figures impossible to scan. A vendor reconciling payments is
 * reading an invoice, not browsing a catalogue.
 */
const amount = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (n: number) => amount.format(n);

/**
 * Platform number used when a store has not saved its own. Override with
 * NEXT_PUBLIC_SUPPORT_WHATSAPP; the fallback keeps the button working on a
 * fresh install rather than rendering a dead link.
 */
export const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "252610000000";

/**
 * wa.me needs bare international digits: no `+`, spaces, dashes or
 * brackets, and no `00` trunk prefix. Sellers type numbers every one of
 * those ways, so normalise rather than reject.
 *
 * Returns "" when what's left could not be a real number — the caller uses
 * that to fall back to the platform number instead of building a link that
 * opens WhatsApp on an error screen.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";

  // "+252…" and "00252…" are the same number written two ways.
  const withoutPrefix = digits.replace(/^\+/, "").replace(/^00/, "");

  // A local Somali mobile typed without its country code ("061 234 5678"
  // or "61 234 5678") is by far the most common entry mistake here.
  if (/^0\d{8,9}$/.test(withoutPrefix)) return `252${withoutPrefix.slice(1)}`;
  if (/^6\d{8}$/.test(withoutPrefix)) return `252${withoutPrefix}`;

  // Beyond that, only sanity-check the length: country codes are 1–3
  // digits and subscriber numbers 4–14, so anything outside 8–15 is a typo.
  return withoutPrefix.length >= 8 && withoutPrefix.length <= 15 ? withoutPrefix : "";
}

export function isValidWhatsAppNumber(raw: string | null | undefined): boolean {
  return normalizeWhatsAppNumber(raw).length > 0;
}

/**
 * Display form for a normalised number: "252613334444" → "+252 613 334 444".
 *
 * Grouped in threes from the RIGHT, which leaves the country code as the
 * leading remainder for every country worth supporting here — +252 613 334
 * 444 and +254 798 100 616 both come out right without a table of dialling
 * plans. An unbroken run of twelve digits is the kind of thing people
 * mis-key when reading it off a screen.
 */
export function formatWhatsAppNumber(raw: string | null | undefined): string {
  const digits = normalizeWhatsAppNumber(raw);
  if (!digits) return "";

  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return `+${groups.join(" ")}`;
}

/**
 * A click-to-chat URL. `encodeURIComponent` is what turns the newlines and
 * `*` characters below into a message WhatsApp renders correctly — building
 * this string by hand elsewhere is how the formatting gets mangled.
 */
export function whatsappLink(number: string, message: string): string {
  const digits = normalizeWhatsAppNumber(number) || SUPPORT_WHATSAPP;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// ── Message composition ────────────────────────────────────────────────

/** One line of a vendor's parcel. */
export interface VendorOrderLine {
  name: string;
  qty: number;
  /** Unit price the customer was charged. */
  price: number;
  /** "Navy · M", when the customer picked a variant. */
  options?: string;
  /** Internal reference / SKU — what the picker looks for on the shelf. */
  reference?: string;
}

export interface VendorOrderMessage {
  /** The vendor's own order id, e.g. "BM-12345-KARA". */
  orderId: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  /** Full delivery address, already assembled. */
  address: string;
  city: string;
  paymentMethod: string;
  lines: VendorOrderLine[];
  /** When the order was placed. Defaults to now. */
  placedAt?: Date;
  /** Where the vendor manages the order, e.g. "banaadirmall.com/vendor/orders". */
  dashboardUrl?: string;
}

/** WhatsApp renders *this* bold. Only works when it hugs a non-space character. */
const b = (text: string) => `*${text}*`;

/**
 * Address lines, without repeating the city.
 *
 * Checkout assembles the address as "District, City, Country", so printing
 * the city underneath it produced:
 *
 *     Hodan District, Mogadishu (Xamar), Somalia
 *     Mogadishu (Xamar)
 *
 * which reads like a mistake on an otherwise precise document.
 */
function addressLines(address: string, city: string): string[] {
  const lines = [address].filter(Boolean);
  const trimmedCity = city.trim();
  if (trimmedCity && !address.toLowerCase().includes(trimmedCity.toLowerCase())) {
    lines.push(trimmedCity);
  }
  return lines;
}

/** "3 Aug 2026, 14:22" — unambiguous for a bilingual audience, unlike 03/08. */
function stamp(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
}

/**
 * Long orders would otherwise blow past what a click-to-chat URL can carry
 * and get truncated mid-item — which reads as a corrupted order rather than
 * a long one. Cap the list and say plainly that more items exist.
 */
const MAX_LINES_IN_MESSAGE = 20;

/**
 * The message a customer sends to ONE vendor. Plain text with WhatsApp's
 * own markers — no markdown links or tables, neither of which it renders.
 */
export function buildVendorOrderMessage(input: VendorOrderMessage): string {
  const {
    orderId, storeName, customerName, customerPhone,
    address, city, paymentMethod, lines,
    placedAt = new Date(), dashboardUrl,
  } = input;

  const shown = lines.slice(0, MAX_LINES_IN_MESSAGE);
  const hidden = lines.length - shown.length;

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  const itemBlocks = shown.map((line, i) => {
    const parts = [`${i + 1}. ${line.name}`];
    if (line.options) parts.push(`   Options: ${line.options}`);
    // The internal reference is what makes this pickable from a shelf
    // without opening the dashboard — include it whenever it exists.
    if (line.reference) parts.push(`   Ref: ${line.reference}`);
    parts.push(`   ${line.qty} × ${money(line.price)} = ${b(money(line.price * line.qty))}`);
    return parts.join("\n");
  });

  if (hidden > 0) {
    itemBlocks.push(`…and ${hidden} more item${hidden === 1 ? "" : "s"} — full list in your dashboard.`);
  }

  return [
    `🛍️ ${b("NEW ORDER — BANAADIR MALL")}`,
    ``,
    `${b("Order:")} ${orderId}`,
    `${b("Store:")} ${storeName}`,
    `${b("Placed:")} ${stamp(placedAt)}`,
    ``,
    b("CUSTOMER"),
    customerName,
    customerPhone,
    ``,
    b("DELIVERY ADDRESS"),
    ...addressLines(address, city),
    ``,
    b(`ITEMS TO PACK (${lines.length})`),
    ``,
    itemBlocks.join("\n\n"),
    ``,
    b(`YOUR SUBTOTAL: ${money(subtotal)}`),
    // Spelled out because it is the single most likely thing to be
    // misread, and misreading it means a vendor invoices for the wrong sum.
    `_${units} unit${units === 1 ? "" : "s"} — your items only. Delivery is charged once on the full order and settled by Banaadir Mall._`,
    ``,
    `${b("Customer pays by:")} ${paymentMethod}`,
    ``,
    `Please reply ${b("CONFIRM")} to accept this order, or tell us which item is out of stock.`,
    ...(dashboardUrl ? [`Manage this order: ${dashboardUrl}`] : []),
  ].join("\n");
}

/**
 * The customer's own copy — for forwarding to whoever is paying or
 * receiving the delivery. Covers the WHOLE order, so unlike the vendor
 * message it does show the grand total.
 */
export interface CustomerReceipt {
  orderId: string;
  customerName: string;
  address: string;
  city: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** One entry per store in the order. */
  parcels: { storeName: string; orderId: string; itemCount: number; subtotal: number }[];
  placedAt?: Date;
  trackUrl?: string;
}

export function buildCustomerReceipt(input: CustomerReceipt): string {
  const {
    orderId, customerName, address, city, paymentMethod,
    subtotal, deliveryFee, total, parcels, placedAt = new Date(), trackUrl,
  } = input;

  const parcelLines = parcels.map(
    (p) =>
      `• ${p.storeName} — ${p.itemCount} item${p.itemCount === 1 ? "" : "s"} · ${money(p.subtotal)}\n  Parcel ref: ${p.orderId}`,
  );

  return [
    `🧾 ${b("ORDER CONFIRMATION — BANAADIR MALL")}`,
    ``,
    `${b("Order:")} ${orderId}`,
    `${b("Placed:")} ${stamp(placedAt)}`,
    `${b("Name:")} ${customerName}`,
    ``,
    b("DELIVERING TO"),
    ...addressLines(address, city),
    ``,
    // Only worth explaining when it actually applies — a single-vendor
    // order arriving in one parcel needs no explanation.
    b(parcels.length > 1 ? `${parcels.length} PARCELS` : "YOUR PARCEL"),
    parcelLines.join("\n"),
    ...(parcels.length > 1
      ? ["", `_Each store ships separately, so your parcels may arrive on different days._`]
      : []),
    ``,
    `Items: ${money(subtotal)}`,
    `Delivery: ${deliveryFee === 0 ? "Free" : money(deliveryFee)}`,
    b(`Total: ${money(total)}`),
    `${b("Payment:")} ${paymentMethod}`,
    ...(trackUrl ? ["", `Track your order: ${trackUrl}`] : []),
  ].join("\n");
}
