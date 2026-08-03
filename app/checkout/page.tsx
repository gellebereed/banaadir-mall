import type { Metadata } from "next";
import CheckoutClient from "@/components/checkout/CheckoutClient";
import { getMarketingSettings, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "Checkout" };

// Delivery fee and free-delivery threshold come from /admin/marketing.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Stores travel with the page so the confirmation screen can address each
  // vendor by name and message them on their own WhatsApp number. Cart
  // lines carry only a store SLUG, which is neither something to show a
  // customer nor a number to send an order to.
  const [settings, stores] = await Promise.all([getMarketingSettings(), getStores()]);
  return <CheckoutClient settings={settings} stores={stores} />;
}
