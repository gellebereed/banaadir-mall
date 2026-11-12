/**
 * Sending the alerts whose moment has come — automatically, when the
 * WhatsApp Cloud API is configured (lib/whatsapp-cloud.ts).
 *
 * Called from three places: right after a shop marks a pre-order arrived,
 * right after a product is saved (the two moments most alerts come due),
 * and by /api/alerts/dispatch on a schedule, which catches everything else
 * — a stock upload, a promotion starting.
 *
 * An alert is marked sent ONLY when Meta accepted the message. One that
 * failed stays open, so it is retried on the next run and, meanwhile, is
 * still in the seller's "ready to send" list to be sent by hand.
 *
 * Server-only.
 */

import { alertHeadline, isAlertDue } from "./alert-utils";
import { getOpenAlerts, markAlertsSent } from "./alerts";
import { getAllProducts, getAllStores } from "./api";
import { siteOrigin } from "./request-origin";
import { cloudWhatsAppConfigured, sendAlertTemplate } from "./whatsapp-cloud";

/** The most sent in one run — keeps a serverless call inside its time limit. */
const BATCH = 40;

export interface DispatchResult {
  configured: boolean;
  due: number;
  sent: number;
  failed: number;
  /** The first failure's reason, for the log. */
  error?: string;
}

export async function dispatchDueAlerts(store?: string): Promise<DispatchResult> {
  const result: DispatchResult = { configured: cloudWhatsAppConfigured(), due: 0, sent: 0, failed: 0 };
  if (!result.configured) return result;

  const open = await getOpenAlerts(store);
  if (open.length === 0) return result;

  const [products, stores, origin] = await Promise.all([getAllProducts(), getAllStores(), siteOrigin()]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const storeName = new Map(stores.map((s) => [s.slug, s.name]));

  const due = open.filter((alert) => isAlertDue(alert, byId.get(alert.productId)));
  result.due = due.length;

  const sentIds: string[] = [];
  for (const alert of due.slice(0, BATCH)) {
    const product = byId.get(alert.productId)!;
    const outcome = await sendAlertTemplate(alert.phone, [
      alertHeadline(alert, product),
      storeName.get(alert.store) ?? "Banaadir Mall",
      `${origin}/product/${product.slug}`,
    ]);
    if (outcome.ok) sentIds.push(alert.id);
    else {
      result.failed++;
      result.error ??= outcome.error;
    }
  }
  if (sentIds.length > 0 && (await markAlertsSent(sentIds, "auto"))) result.sent = sentIds.length;
  if (result.failed > 0) console.error(`[Alerts] ${result.failed} message(s) not accepted:`, result.error);
  return result;
}

/** Fire-and-forget wrapper for call sites that must never fail because of this. */
export async function dispatchQuietly(store?: string): Promise<void> {
  try {
    await dispatchDueAlerts(store);
  } catch (err) {
    console.error("[Alerts] dispatch failed:", err);
  }
}
