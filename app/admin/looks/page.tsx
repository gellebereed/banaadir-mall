import type { Metadata } from "next";
import LooksManager from "@/components/dashboard/LooksManager";
import { getAllStores, getMarketplaceProducts } from "@/lib/api";
import { can } from "@/lib/auth";
import { getLooks } from "@/lib/looks";
import { primaryImage } from "@/lib/product-utils";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Shop the look" };
export const dynamic = "force-dynamic";

/**
 * Every look on the marketplace — the shops' own, which the admin can hide
 * or remove, and the marketplace's, which can mix pieces from different
 * shops. That mix is the one thing a single-brand shop cannot offer.
 */
export default async function AdminLooksPage() {
  const session = await getSession();
  const [looks, products, stores] = await Promise.all([getLooks(), getMarketplaceProducts(), getAllStores()]);
  const storeNames = Object.fromEntries(stores.map((s) => [s.slug, s.name]));

  return (
    <LooksManager
      looks={looks}
      canEdit={Boolean(session && can(session, "marketing"))}
      allowDiscount={false}
      storeNames={storeNames}
      intro="Outfits shoppers can buy in one tap. Shops make their own from /vendor/looks; looks you make here can mix pieces from any shop — a dress from one, shoes from another."
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        image: primaryImage(p),
        icon: p.icon,
        price: p.price,
        storeName: storeNames[p.store] ?? p.store,
      }))}
    />
  );
}
