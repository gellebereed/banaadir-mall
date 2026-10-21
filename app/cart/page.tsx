import type { Metadata } from "next";
import CartClient from "@/components/cart/CartClient";
import { getMarketingSettings, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "Shopping Cart" };

// Delivery fee, free-delivery threshold and the promo code are set by the
// admin (/admin/marketing), so the totals must be resolved per request.
export const dynamic = "force-dynamic";

export default async function CartPage() {
  // Stores so each parcel is headed by the shop's name and logo, not a slug.
  const [settings, stores] = await Promise.all([getMarketingSettings(), getStores()]);
  return <CartClient settings={settings} stores={stores} />;
}
