import type { Metadata } from "next";
import CheckoutClient from "@/components/checkout/CheckoutClient";
import { getMarketingSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Checkout" };

// Delivery fee and free-delivery threshold come from /admin/marketing.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const settings = await getMarketingSettings();
  return <CheckoutClient settings={settings} />;
}
