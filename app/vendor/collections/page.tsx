import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CollectionsManager from "@/components/dashboard/CollectionsManager";
import { getBaseProductsByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { getCollections } from "@/lib/collections";
import { primaryImage } from "@/lib/product-utils";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Collections" };
export const dynamic = "force-dynamic";

/**
 * The store's own groupings — "Ramadan picks", "Kitchen essentials" —
 * shown as tabs on its store page. See lib/collections.ts for why these
 * are not categories.
 */
export default async function VendorCollectionsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.view")) redirect("/vendor");

  const [collections, products] = await Promise.all([
    getCollections(storeSlug, true),
    getBaseProductsByStore(storeSlug),
  ]);

  return (
    <CollectionsManager
      store={storeSlug}
      canEdit={session.role === "seller" && may(session, "products.edit")}
      collections={collections}
      // Just what the picker shows — not the whole product record.
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        image: primaryImage(p),
        icon: p.icon,
        price: p.price,
        hidden: Boolean(p.hidden),
      }))}
    />
  );
}
