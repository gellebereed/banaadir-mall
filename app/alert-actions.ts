"use server";

/**
 * Server actions for product alerts (lib/alert-utils.ts): a shopper signs
 * up, a seller marks one sent.
 */

import { revalidatePath } from "next/cache";
import { alertKindFor, type AlertKind } from "@/lib/alert-utils";
import { addAlert, markAlertsSent } from "@/lib/alerts";
import { getProducts } from "@/lib/api";
import { may } from "@/lib/auth";
import { getLang } from "@/lib/prefs-server";
import { displayPrice } from "@/lib/product-utils";
import { getSession } from "@/lib/session";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

export interface AlertSignup {
  ok: boolean;
  /** Which question was recorded — the button confirms it in words. */
  kind?: AlertKind;
  /** "phone" | "limit" | "unavailable" — the button translates these. */
  error?: "phone" | "limit" | "unavailable";
}

/**
 * "Tell me on WhatsApp." Open to anyone — the whole point is the shopper
 * who is not ready to make an account. What they are told about is decided
 * HERE from the product's state today, not by the browser.
 */
export async function subscribeAlert(input: {
  productId: string;
  phone: string;
  name?: string;
}): Promise<AlertSignup> {
  const phone = normalizeWhatsAppNumber(input.phone);
  if (!phone) return { ok: false, error: "phone" };

  const product = (await getProducts()).find((p) => p.id === input.productId);
  if (!product) return { ok: false, error: "unavailable" };

  const [session, lang] = await Promise.all([getSession(), getLang()]);
  const kind = alertKindFor(product);
  const result = await addAlert({
    id: `al_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    productId: product.id,
    store: product.store,
    kind,
    phone,
    name: (input.name ?? session?.name ?? "").trim().slice(0, 60) || undefined,
    email: session?.role === "customer" ? session.email : undefined,
    lang,
    // The lowest price on show — what "cheaper" will be measured against.
    priceThen: displayPrice(product),
    createdAt: new Date().toISOString(),
  });
  if (!result.ok) return { ok: false, error: result.error === "limit" ? "limit" : "unavailable" };
  revalidatePath("/vendor/alerts");
  return { ok: true, kind };
}

/** A seller sent one by hand (the wa.me button) — close it. Their own shop's only. */
export async function markAlertSent(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || session.role !== "seller" || !session.store || !may(session, "orders.view")) {
    return { ok: false };
  }
  const ok = await markAlertsSent([id], "manual", session.store);
  revalidatePath("/vendor/alerts");
  return { ok };
}
