/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ALERTS — "tell me on WhatsApp when…", the rules.
 * ─────────────────────────────────────────────────────────────────────────
 * A shopper who wants something they cannot have yet — it is sold out, it
 * has not landed, it costs a little too much — used to have one option:
 * remember to come back. Almost nobody does. An alert is them handing the
 * shop their WhatsApp number and saying when to use it.
 *
 * Which is also why this is strict about what an alert is FOR. There is
 * one question per product, chosen by the product's state when they asked:
 *
 *   arrival   it is on pre-order      → tell me when it lands
 *   stock     it is sold out          → tell me when it is back
 *   price     it is on the shelf      → tell me if it gets cheaper
 *
 * and each alert is sent ONCE, when its condition comes true. A number
 * given for "tell me when my size is back" is not a marketing list, and
 * the moment it is used as one, people stop giving it.
 *
 * Pure rules only — storage is lib/alerts.ts. Safe on client and server.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { isPreorder } from "./preorder";
import { displayPrice, totalStock } from "./product-utils";
import type { Product } from "./types";

export type AlertKind = "arrival" | "stock" | "price";

export interface ProductAlert {
  id: string;
  productId: string;
  /** Store slug — whose customer this is, and who may send to them. */
  store: string;
  kind: AlertKind;
  /** International digits, normalised (lib/whatsapp.ts). */
  phone: string;
  name?: string;
  /** Their account, when signed in. */
  email?: string;
  lang?: string;
  /** What it cost when they asked — a price alert fires below this. */
  priceThen?: number;
  createdAt: string;
  /** Set once the message has gone; a sent alert is finished. */
  sentAt?: string;
  sentVia?: "manual" | "auto";
}

/** The one question worth asking about this product right now. */
export function alertKindFor(product: Product): AlertKind {
  if (isPreorder(product)) return "arrival";
  if (totalStock(product) === 0) return "stock";
  return "price";
}

/**
 * Has what they were waiting for happened? `product` must be the PRICED
 * product (lib/api getAllProducts), so a promotion counts as a price drop.
 */
export function isAlertDue(alert: ProductAlert, product: Product | undefined): boolean {
  if (!product || alert.sentAt || product.hidden) return false;
  const buyable = totalStock(product) > 0 && !isPreorder(product);
  switch (alert.kind) {
    case "arrival":
    case "stock":
      return buyable;
    case "price":
      // A cent is not a price drop; 1% (and at least 10¢) is.
      return (
        buyable &&
        alert.priceThen !== undefined &&
        displayPrice(product) <= alert.priceThen - Math.max(0.1, alert.priceThen * 0.01)
      );
  }
}

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

/** The headline of the message — also the template's first variable. */
export function alertHeadline(alert: ProductAlert, product: Product): string {
  const price = displayPrice(product);
  switch (alert.kind) {
    case "arrival":
      return `${product.name} has arrived`;
    case "stock":
      return `${product.name} is back in stock`;
    case "price":
      return `${product.name} is now ${money(price)}` + (alert.priceThen ? ` (was ${money(alert.priceThen)})` : "");
  }
}

/** The whole WhatsApp message, as the seller's one-tap button writes it. */
export function alertMessage(alert: ProductAlert, product: Product, storeName: string, url: string): string {
  const hello = alert.name ? `Hello ${alert.name.split(/\s+/)[0]}` : "Hello";
  return (
    `${hello}, this is ${storeName} on Banaadir Mall. You asked us to tell you: ` +
    `${alertHeadline(alert, product)}. Order it here before it goes: ${url}`
  );
}

/** What the seller's list says each kind of customer is waiting for. */
export const ALERT_WAITING: Record<AlertKind, string> = {
  arrival: "waiting for it to arrive",
  stock: "waiting for it to come back in stock",
  price: "waiting for a lower price",
};
