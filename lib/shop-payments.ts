/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PAYING THE SHOP DIRECTLY — until the marketplace takes mobile money
 * ─────────────────────────────────────────────────────────────────────────
 * Safe to import from client and server.
 *
 * Checkout used to offer EVC Plus, Zaad and eDahab and promise "a payment
 * prompt on your phone" that nothing ever sent — and the method the
 * customer chose was thrown away on the server, so the shop never knew.
 *
 * Until a real integration exists, every shop is paid by the customer
 * directly, on the numbers the shop itself saves in its settings. An order
 * already becomes one parcel per shop, so each parcel carries:
 *
 *   payment         which of THAT shop's methods the customer is using
 *   paymentStatus   awaiting → paid, or on_delivery for cash at the door
 *
 * The customer picks ONE way to pay for the whole basket. Each shop that
 * takes it is paid that way; a shop that doesn't falls back to cash on
 * delivery when it takes cash, else to its own first method — and checkout
 * says so before the button, so nobody discovers it afterwards.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Order, Store } from "./types";

export type ShopPaymentKind =
  | "evc"
  | "evc_merchant"
  | "zaad"
  | "zaad_merchant"
  | "edahab"
  | "sahal"
  | "premier"
  | "bank"
  | "cod";

/** One way a shop accepts money, as saved in its settings. */
export interface ShopPaymentMethod {
  kind: ShopPaymentKind;
  /** Wallet number or bank account. Empty only for cash on delivery. */
  number?: string;
  /** The name the customer's wallet shows before they confirm — the check that they have the right shop. */
  accountName?: string;
}

export type PaymentStatus = "awaiting" | "paid" | "on_delivery";

export interface PaymentKindInfo {
  kind: ShopPaymentKind;
  label: string;
  icon: string;
  /** Mobile wallets: the number must be a phone number. */
  wallet: boolean;
  /**
   * A business till number on a wallet — short, not a phone number. The
   * customer still pays from the same wallet, so checkout offers the
   * wallet (`family`) and either kind of shop number answers it.
   */
  merchant?: boolean;
  /** The wallet the customer pays from. Defaults to the kind itself. */
  family?: ShopPaymentKind;
  /** Network or bank, for the shop's settings. */
  provider?: string;
}

/** In the order checkout offers them — the wallets most Somali shoppers carry first. */
export const PAYMENT_KINDS: PaymentKindInfo[] = [
  { kind: "evc", label: "EVC Plus", icon: "📲", wallet: true, provider: "Hormuud" },
  { kind: "evc_merchant", label: "EVC Merchant", icon: "🏪", wallet: true, merchant: true, family: "evc", provider: "Hormuud" },
  { kind: "zaad", label: "Zaad", icon: "📱", wallet: true, provider: "Telesom" },
  { kind: "zaad_merchant", label: "Zaad Merchant", icon: "🏪", wallet: true, merchant: true, family: "zaad", provider: "Telesom" },
  { kind: "edahab", label: "eDahab", icon: "💳", wallet: true, provider: "Somtel" },
  { kind: "sahal", label: "Sahal", icon: "📱", wallet: true, provider: "Golis" },
  { kind: "premier", label: "Premier Wallet", icon: "🏦", wallet: true, provider: "Premier Bank" },
  { kind: "bank", label: "Bank transfer", icon: "🏦", wallet: false },
  { kind: "cod", label: "Cash on delivery", icon: "💵", wallet: false },
];

export function kindInfo(kind: string | undefined): PaymentKindInfo | undefined {
  return PAYMENT_KINDS.find((k) => k.kind === kind);
}

/** The merchant (till) version of a wallet, where the network has one. */
function merchantOf(kind: ShopPaymentKind): PaymentKindInfo | undefined {
  return PAYMENT_KINDS.find((k) => k.merchant && k.family === kind);
}

/** The wallet a customer pays this kind from — "evc" for an EVC Merchant number. */
export function familyOf(kind: ShopPaymentKind): ShopPaymentKind {
  return kindInfo(kind)?.family ?? kind;
}

/** How long a parcel may wait for payment before the seller is asked to chase or cancel it. */
export const UNPAID_FLAG_HOURS = 48;

/**
 * What a shop accepts. A shop that has saved nothing takes cash on
 * delivery — every shop already did, and none should become unbuyable
 * the day this ships because it hasn't opened its settings yet.
 */
export function acceptedMethods(store: Pick<Store, "paymentMethods"> | undefined): ShopPaymentMethod[] {
  const saved = (store?.paymentMethods ?? []).filter((m) => kindInfo(m.kind));
  return saved.length > 0 ? saved : [{ kind: "cod" }];
}

/** The method this shop's parcel is paid with when the customer chose `chosen`. */
export function resolvePayment(
  store: Pick<Store, "paymentMethods"> | undefined,
  chosen: string,
): ShopPaymentMethod {
  const methods = acceptedMethods(store);
  return (
    methods.find((m) => m.kind === chosen) ??
    // Paying from EVC Plus reaches an EVC Merchant number just the same.
    methods.find((m) => familyOf(m.kind) === chosen) ??
    methods.find((m) => m.kind === "cod") ??
    methods[0]
  );
}

export function initialStatus(method: ShopPaymentMethod): PaymentStatus {
  return method.kind === "cod" ? "on_delivery" : "awaiting";
}

/**
 * The options checkout shows for this basket: every method at least one of
 * its shops takes, most widely accepted first. The first is preselected,
 * so a basket from shops that all take EVC opens on EVC.
 */
export function basketOptions(stores: (Pick<Store, "paymentMethods"> | undefined)[]): {
  kind: ShopPaymentKind;
  acceptedBy: number;
}[] {
  const counts = new Map<ShopPaymentKind, number>();
  for (const store of stores) {
    for (const kind of new Set(acceptedMethods(store).map((m) => familyOf(m.kind)))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return PAYMENT_KINDS.filter((k) => counts.has(k.kind))
    .map((k) => ({ kind: k.kind, acceptedBy: counts.get(k.kind)! }))
    .sort((a, b) => b.acceptedBy - a.acceptedBy);
}

/** "617778899" from "+252 61 777 8899", "0617778899" or "61-777-8899" — what a wallet expects. */
export function localWalletNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("252") && digits.length > 9) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * The USSD code that opens "send money" with the number and amount filled
 * in, so paying is one tap and a PIN rather than copying digits between
 * apps. Only for wallets whose send-money code is well known, and only for
 * whole amounts — a mistyped code moves real money, so anything uncertain
 * gets the copy button alone.
 */
export function dialCode(method: ShopPaymentMethod, amount: number): string | undefined {
  if (!method.number || !Number.isInteger(amount) || amount <= 0) return undefined;
  const number = localWalletNumber(method.number);
  if (number.length < 7) return undefined;
  if (method.kind === "evc") return `*712*${number}*${amount}#`;
  if (method.kind === "zaad") return `*220*${number}*${amount}#`;
  return undefined;
}

/** A dial code as a link — `#` must be escaped or the phone drops everything after it. */
export function dialHref(code: string): string {
  return `tel:${code.replace(/#/g, "%23")}`;
}

/**
 * Clean what a seller saved. One entry per kind, wallets must carry a
 * plausible number, cash carries none.
 */
export function cleanMethods(
  raw: unknown,
): { methods: ShopPaymentMethod[] } | { error: string } {
  if (!Array.isArray(raw)) return { methods: [] };
  const seen = new Set<string>();
  const methods: ShopPaymentMethod[] = [];
  for (const entry of raw.slice(0, PAYMENT_KINDS.length)) {
    const info = kindInfo((entry as ShopPaymentMethod)?.kind);
    if (!info || seen.has(info.kind)) continue;
    seen.add(info.kind);
    if (info.kind === "cod") {
      methods.push({ kind: "cod" });
      continue;
    }
    const number = String((entry as ShopPaymentMethod).number ?? "").trim().slice(0, 40);
    const accountName = String((entry as ShopPaymentMethod).accountName ?? "").trim().slice(0, 60);
    const digits = number.replace(/\D/g, "");
    // Merchant (till) numbers are short codes; a personal wallet is a phone number.
    const ok = info.merchant ? digits.length >= 3 : info.wallet ? digits.length >= 7 : number.length >= 4;
    if (!ok) {
      return {
        error: !number
          ? `Add the ${info.label} ${info.wallet ? "number" : "account"} customers should pay to — nothing was saved.`
          : info.merchant
            ? `"${number}" doesn't look like a merchant number — enter the ${info.label} number customers pay to. Nothing was saved.`
            : info.wallet
              ? `"${number}" isn't a full phone number for ${info.label} (e.g. 61 555 1234).${
                  merchantOf(info.kind) ? ` For a merchant number, tick ${merchantOf(info.kind)!.label} instead.` : ""
                } Nothing was saved.`
              : `Add the full bank name and account number. Nothing was saved.`,
      };
    }
    methods.push({ kind: info.kind, number, ...(accountName ? { accountName } : {}) });
  }
  return { methods };
}

/** When the parcel was placed — the first stamp, else its date. */
function placedAt(order: Pick<Order, "timeline" | "date">): number {
  const first = order.timeline?.[0]?.at;
  return new Date(first ?? order.date).getTime();
}

/** Still unpaid after UNPAID_FLAG_HOURS, and not yet cancelled. */
export function unpaidTooLong(
  order: Pick<Order, "paymentStatus" | "status" | "timeline" | "date">,
  now = Date.now(),
): boolean {
  if (order.paymentStatus !== "awaiting" || order.status === "cancelled") return false;
  return now - placedAt(order) > UNPAID_FLAG_HOURS * 3_600_000;
}
