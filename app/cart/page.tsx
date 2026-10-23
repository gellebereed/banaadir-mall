import type { Metadata } from "next";
import CartClient from "@/components/cart/CartClient";
import { getMarketingSettings, getPublicOffers, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "Shopping Cart" };

// Delivery fee, free-delivery threshold and the promo code are set by the
// admin (/admin/marketing), so the totals must be resolved per request.
export const dynamic = "force-dynamic";

export default async function CartPage() {
  // Stores so each parcel is headed by the shop's name and logo, not a slug.
  // Offers travel with the page so the basket is priced in the browser the
  // moment it renders — see components/cart/useCartPricing.ts.
  const [settings, stores, offers] = await Promise.all([getMarketingSettings(), getStores(), getPublicOffers()]);
  return <CartClient settings={settings} stores={stores} offers={offers} />;
}
