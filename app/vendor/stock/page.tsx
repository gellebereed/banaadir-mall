import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StockClient, { type StockLine } from "@/components/dashboard/StockClient";
import { getBaseProductsByStore, getPosSettings } from "@/lib/api";
import { may } from "@/lib/auth";
import { primaryImage } from "@/lib/product-utils";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

/**
 * STOCK — bring the shop's own till counts onto the website.
 *
 * Two ways in: upload the stock report the shop's POS already makes (the
 * layout is remembered after the first time), or update by hand on a phone
 * — search, scan a barcode, tap a number. Plus an optional safety buffer.
 */
export default async function StockPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) redirect("/vendor");

  const [products, pos] = await Promise.all([getBaseProductsByStore(storeSlug), getPosSettings(storeSlug)]);

  // One line per thing that has its own count: a product, or each of its
  // sizes/colours.
  const lines: StockLine[] = products.flatMap((p) =>
    p.variants?.length
      ? p.variants.map((v) => ({
          key: `${p.id}|${v.id}`,
          productId: p.id,
          variantId: v.id,
          name: p.name,
          label: [v.color, v.size].filter(Boolean).join(" · "),
          codes: [v.barcode, v.sku, p.barcode, p.internalReference].filter((c): c is string => Boolean(c)),
          stock: v.stock,
          image: v.images?.[0] ?? primaryImage(p),
          icon: p.icon,
          hidden: p.hidden,
        }))
      : [
          {
            key: p.id,
            productId: p.id,
            name: p.name,
            codes: [p.barcode, p.internalReference].filter((c): c is string => Boolean(c)),
            stock: p.stock,
            image: primaryImage(p),
            icon: p.icon,
            hidden: p.hidden,
          },
        ],
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Stock</h1>
      <p className="mt-1 text-sm text-slate-500">
        Keep the website in step with your shop. Upload the stock report from your own POS, or
        update counts by hand — online orders take items off automatically.
      </p>
      <StockClient lines={lines} saved={pos.stockImport} buffer={pos.stockBuffer ?? 0} />
    </div>
  );
}
