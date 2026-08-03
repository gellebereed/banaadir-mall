/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PARCEL DELIVERY — timelines, couriers, grouping. Client and server safe.
 * ─────────────────────────────────────────────────────────────────────────
 * An order spanning three shops is three parcels, each packed and dispatched
 * independently, usually by three different drivers. Everything here works
 * on ONE parcel at a time, plus a couple of helpers that look across all of
 * an order's parcels to answer the questions a customer actually asks:
 *
 *   "Where is the box with my shoes?"      → parcelJourney()
 *   "Who do I call about it?"              → the parcel's own courier
 *   "Is this all coming together?"         → sharedCourierGroups()
 *   "When will it get here?"               → estimateLabel()
 */

import { normalizeWhatsAppNumber } from "./whatsapp";
import type { Courier, Order, OrderStatus, ParcelEvent } from "./types";

/** The fulfilment path, in order. `cancelled` sits outside it. */
export const JOURNEY_STEPS: {
  status: OrderStatus;
  icon: string;
  label: string;
  /** Shown to the customer for a parcel currently at this step. */
  text: string;
}[] = [
  { status: "pending", icon: "🧾", label: "Order placed", text: "The shop has your order" },
  { status: "processing", icon: "📦", label: "Being packed", text: "The shop is preparing this parcel" },
  { status: "shipped", icon: "🚚", label: "On the way", text: "Handed to the driver" },
  { status: "delivered", icon: "🎉", label: "Delivered", text: "This parcel has arrived" },
];

const STEP_INDEX: Record<OrderStatus, number> = {
  pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: -1,
};

export function stepIndex(status: OrderStatus): number {
  return STEP_INDEX[status] ?? 0;
}

/**
 * A parcel's journey with each reached step stamped with when it happened.
 *
 * Falls back to the parcel's current status when there is no recorded
 * history — orders placed before timelines existed still render a sensible
 * progress bar, just without dates, rather than appearing stuck at step one.
 */
export function parcelJourney(order: Pick<Order, "status" | "timeline" | "date">): {
  status: OrderStatus;
  icon: string;
  label: string;
  text: string;
  reached: boolean;
  current: boolean;
  at?: string;
}[] {
  const reachedTo = stepIndex(order.status);
  const stamps = new Map<OrderStatus, string>();
  for (const event of order.timeline ?? []) {
    // Keep the FIRST time a status was reached. Re-saving an order
    // shouldn't make it look like it shipped again today.
    if (!stamps.has(event.status)) stamps.set(event.status, event.at);
  }

  return JOURNEY_STEPS.map((step, i) => ({
    ...step,
    reached: i <= reachedTo,
    current: i === reachedTo,
    at: stamps.get(step.status) ?? (i === 0 ? order.date : undefined),
  }));
}

/**
 * Append a stamped event, keeping the history honest.
 *
 * Moving a parcel BACK (a seller correcting a mis-click) drops the steps
 * that no longer apply, so a parcel returned to "processing" doesn't keep
 * claiming it was delivered an hour ago.
 */
export function recordEvent(
  timeline: ParcelEvent[] | undefined,
  status: OrderStatus,
  at: string,
  note?: string,
): ParcelEvent[] {
  const kept = (timeline ?? []).filter(
    (e) => e.status !== "cancelled" && stepIndex(e.status) < stepIndex(status),
  );
  return [...kept, { status, at, ...(note ? { note } : {}) }];
}

// ── Couriers ───────────────────────────────────────────────────────────

/** Two courier entries are the same driver when their numbers match. */
export function sameCourier(a?: Courier, b?: Courier): boolean {
  if (!a?.phone || !b?.phone) return false;
  return normalizeWhatsAppNumber(a.phone) === normalizeWhatsAppNumber(b.phone);
}

export interface ParcelWithStore {
  order: Order;
  storeName: string;
}

/**
 * Parcels that are travelling with the SAME driver, so the customer can be
 * told once instead of being shown three identical phone numbers and left
 * to work out they belong to one person.
 *
 * Only groups of two or more are returned — a single parcel with a driver
 * isn't a group, it's just a parcel.
 */
export function sharedCourierGroups(parcels: ParcelWithStore[]): {
  courier: Courier;
  parcels: ParcelWithStore[];
}[] {
  const byPhone = new Map<string, { courier: Courier; parcels: ParcelWithStore[] }>();

  for (const parcel of parcels) {
    const courier = parcel.order.delivery?.courier;
    const phone = normalizeWhatsAppNumber(courier?.phone);
    if (!courier || !phone) continue;

    const existing = byPhone.get(phone);
    if (existing) existing.parcels.push(parcel);
    else byPhone.set(phone, { courier, parcels: [parcel] });
  }

  return [...byPhone.values()].filter((g) => g.parcels.length > 1);
}

// ── Formatting ─────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Aug, 14:22" — short enough for a timeline, unambiguous unlike 03/08. */
export function stampLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hasTime = iso.includes("T");
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (!hasTime) return date;
  return `${date}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * "Expected today" / "Expected tomorrow" / "Expected 6 Aug", or "" when the
 * seller gave no estimate.
 *
 * `now` is injectable so this stays deterministic in tests — and so a page
 * rendering it on the server and hydrating on the client can't disagree
 * about what "today" means.
 */
export function estimateLabel(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);

  if (days < 0) return `Was expected ${stampLabel(iso)}`;
  if (days === 0) return "Expected today";
  if (days === 1) return "Expected tomorrow";
  return `Expected ${target.getDate()} ${MONTHS[target.getMonth()]}`;
}

/** A `tel:` link. Falls back to the raw string if it can't be normalised. */
export function telLink(phone: string): string {
  const digits = normalizeWhatsAppNumber(phone);
  return `tel:${digits ? `+${digits}` : phone}`;
}
