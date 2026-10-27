import { getAllStores, getCategories, getMarketplaceProducts } from "@/lib/api";
import { primaryImage } from "@/lib/product-utils";
import { siteOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * GOOGLE MERCHANT CENTER FEED — /google-products.xml
 *
 * Merchant Center's "add products from your website" scan reads one page
 * and found nothing on the home page; a feed is the dependable way in.
 * Add this address under Products → Add products → "Add products from a
 * file" → "Enter a link to your file", fetched daily.
 *
 * The same catalogue the sitemap lists (visible products of listed
 * stores), in Google's RSS 2.0 product format. Products without a photo
 * are left out: Google rejects an item with no image.
 */
export async function GET() {
  const [origin, products, stores, categories] = await Promise.all([
    siteOrigin(),
    getMarketplaceProducts(),
    getAllStores(),
    getCategories(),
  ]);
  const storeName = new Map(stores.map((s) => [s.slug, s.name]));
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
  const absolute = (src: string) => (src.startsWith("http") ? src : `${origin}${src}`);

  const items = products.flatMap((p) => {
    const image = primaryImage(p);
    if (!image || !(p.price > 0)) return [];
    const onSale = (p.compareAt ?? 0) > p.price;
    const fields: [string, string][] = [
      ["g:id", p.id],
      ["g:title", p.name.slice(0, 150)],
      ["g:description", plainText(p.description).slice(0, 5000) || p.name],
      ["g:link", `${origin}/product/${p.slug}`],
      ["g:image_link", absolute(image)],
      ...(p.images ?? []).filter((src) => src !== image).slice(0, 10).map((src): [string, string] => ["g:additional_image_link", absolute(src)]),
      ["g:availability", p.stock > 0 ? "in_stock" : "out_of_stock"],
      ["g:price", `${(onSale ? p.compareAt! : p.price).toFixed(2)} USD`],
      ...(onSale ? [["g:sale_price", `${p.price.toFixed(2)} USD`] as [string, string]] : []),
      ["g:condition", "new"],
      ["g:brand", storeName.get(p.store) ?? "Banaadir Mall"],
      ...(p.barcode ? [["g:gtin", p.barcode] as [string, string]] : [["g:identifier_exists", "no"] as [string, string]]),
      ...(categoryName.has(p.category) ? [["g:product_type", categoryName.get(p.category)!] as [string, string]] : []),
    ];
    return [`    <item>\n${fields.map(([k, v]) => `      <${k}>${xml(v)}</${k}>`).join("\n")}\n    </item>`];
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Banaadir Mall</title>
    <link>${origin}/</link>
    <description>Products from trusted Somali stores on Banaadir Mall</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}

/** A description as one line of plain text — no markdown markers. */
function plainText(text: string | undefined): string {
  return (text ?? "").replace(/[*_#>`]+/g, "").replace(/\s+/g, " ").trim();
}

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters other than tab/newline make the whole feed invalid XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
