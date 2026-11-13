/**
 * Is a shop ready for shoppers? The checks the admin looks at before making
 * a hidden store live (Store.hidden), and the to-do list its owner sees
 * while it is hidden. Safe to import from client and server.
 *
 * Deliberately few, and each one something a shopper would notice missing:
 * a shop with no photos looks abandoned, one with no WhatsApp can't be
 * reached about an order, one with no logo looks unfinished in every list.
 * A payment number is shown but not required — cash on delivery is a real
 * way to be paid.
 */
import { primaryImage } from "./product-utils";
import { readMethods } from "./shop-payments";
import type { Product, Store } from "./types";

export interface SetupCheck {
  key: "products" | "whatsapp" | "logo" | "payment";
  label: string;
  done: boolean;
  /** Where the owner fixes it. */
  href: string;
  /** False for nice-to-haves: shown, but not counted against being ready. */
  required: boolean;
}

export function storeSetupChecks(
  store: Pick<Store, "logo" | "whatsapp" | "paymentMethods">,
  products: Product[],
): SetupCheck[] {
  const withPhoto = products.filter((p) => !p.hidden && primaryImage(p)).length;
  const wallets = readMethods(store.paymentMethods).filter((m) => m.kind !== "cod");
  return [
    {
      key: "products",
      label: withPhoto > 0 ? `${withPhoto} product${withPhoto === 1 ? "" : "s"} with photos` : "Products with photos",
      done: withPhoto > 0,
      href: "/vendor/products",
      required: true,
    },
    { key: "whatsapp", label: "WhatsApp number", done: Boolean(store.whatsapp), href: "/vendor/settings", required: true },
    { key: "logo", label: "Store logo", done: Boolean(store.logo), href: "/vendor/settings", required: true },
    { key: "payment", label: "Mobile money number", done: wallets.length > 0, href: "/vendor/settings", required: false },
  ];
}

/** Every required check done. */
export function isSetUp(checks: SetupCheck[]): boolean {
  return checks.every((c) => c.done || !c.required);
}
