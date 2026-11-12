import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AlertsBoard from "@/components/dashboard/AlertsBoard";
import { ALERT_WAITING, alertHeadline, alertMessage, isAlertDue } from "@/lib/alert-utils";
import { getOpenAlerts } from "@/lib/alerts";
import { getAllProductsByStore, getStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { primaryImage } from "@/lib/product-utils";
import { siteOrigin } from "@/lib/request-origin";
import { requireVendor } from "@/lib/session";
import { cloudWhatsAppConfigured } from "@/lib/whatsapp-cloud";

export const metadata: Metadata = { title: "Customer alerts" };
export const dynamic = "force-dynamic";

/**
 * CUSTOMER ALERTS — who asked to be told, and who can be told now.
 *
 * Two lists. "Ready to send" is the one to act on: the thing each of these
 * customers was waiting for has happened, and every row is a sale that only
 * needs one message. "Waiting" is the one to learn from — eleven people
 * waiting for one abaya to come back is the clearest restocking advice a
 * shop will ever be given.
 */
export default async function VendorAlertsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "orders.view")) redirect("/vendor");

  const [alerts, products, store, origin] = await Promise.all([
    getOpenAlerts(storeSlug),
    // Priced as customers see them, so a promotion counts as a price drop.
    getAllProductsByStore(storeSlug),
    getStore(storeSlug),
    siteOrigin(),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const storeName = store?.name ?? storeSlug.replace(/-/g, " ");

  const ready = alerts
    .filter((a) => isAlertDue(a, byId.get(a.productId)))
    .map((a) => {
      const product = byId.get(a.productId)!;
      return {
        id: a.id,
        phone: a.phone,
        name: a.name,
        // "Zahra Abaya is now $55 (was $65)" — why this one is ready.
        productName: alertHeadline(a, product),
        image: primaryImage(product),
        icon: product.icon,
        message: alertMessage(a, product, storeName, `${origin}/product/${product.slug}`),
      };
    });
  const readyIds = new Set(ready.map((r) => r.id));

  // Still waiting, grouped: one row per product and reason, most wanted first.
  const groups = new Map<string, { productName: string; waitingFor: string; count: number; editHref: string }>();
  for (const a of alerts) {
    if (readyIds.has(a.id)) continue;
    const product = byId.get(a.productId);
    if (!product) continue;
    const key = `${a.productId}|${a.kind}`;
    const group = groups.get(key) ?? {
      productName: product.name,
      waitingFor: ALERT_WAITING[a.kind],
      count: 0,
      editHref: `/vendor/products/${product.id}/edit`,
    };
    group.count++;
    groups.set(key, group);
  }

  return (
    <AlertsBoard
      ready={ready}
      waiting={[...groups.values()].sort((a, b) => b.count - a.count)}
      automatic={cloudWhatsAppConfigured()}
      canEditProducts={may(session, "products.edit")}
    />
  );
}
