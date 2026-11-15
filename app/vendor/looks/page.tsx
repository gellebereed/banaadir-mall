import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LooksManager from "@/components/dashboard/LooksManager";
import { getBaseProductsByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { getLooks } from "@/lib/looks";
import { primaryImage } from "@/lib/product-utils";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Shop the look" };
export const dynamic = "force-dynamic";

/**
 * The shop's outfits: one photo, a dot on each piece, every piece one of
 * the shop's products. Shoppers buy the whole outfit in one tap from the
 * look's page and the home page's "Shop the look" row (lib/look-utils.ts).
 */
export default async function VendorLooksPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.view")) redirect("/vendor");

  const [looks, products] = await Promise.all([getLooks(storeSlug), getBaseProductsByStore(storeSlug)]);

  return (
    <LooksManager
      looks={looks}
      canEdit={session.role === "seller" && may(session, "products.edit")}
      allowDiscount
      intro="Show whole outfits. Upload a photo, tap each piece and pick the product it is — shoppers choose their sizes on one screen and add the whole look to their basket in one tap."
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
