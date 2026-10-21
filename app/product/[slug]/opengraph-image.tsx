import { ImageResponse } from "next/og";
import { getProduct, getStore } from "@/lib/api";
import { money } from "@/lib/format";
import { primaryImage } from "@/lib/product-utils";
import { requestOrigin } from "@/lib/request-origin";

/*
 * The card WhatsApp shows when a product link is shared: photo, name,
 * price (and the saving) and the store. A preview with the price in it is
 * what gets a link tapped — a bare URL was all a shared product showed.
 */
export const alt = "Product on Banaadir Mall";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug);
  if (!product) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#1f6270" }} />, size);
  }
  const store = await getStore(product.store);
  // Stored photos may be site-relative (local uploads); the renderer needs absolute.
  const photo = primaryImage(product);
  const src = photo ? (photo.startsWith("http") ? photo : `${await requestOrigin()}${photo}`) : undefined;
  const saving =
    product.compareAt && product.compareAt > product.price
      ? Math.round((1 - product.price / product.compareAt) * 100)
      : 0;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#faf7f2" }}>
        <div
          style={{
            width: 630,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${product.art.from}, ${product.art.to})`,
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} width={630} height={630} style={{ objectFit: "cover" }} alt="" />
          ) : (
            // The product's emoji icon would need emoji artwork fetched from
            // a CDN mid-render, and one failed fetch blanks the whole card.
            // Its initial, on its own colours, can't fail.
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.6)",
                fontSize: 160,
                fontWeight: 800,
                color: "#1f6270",
              }}
            >
              {product.name.trim().charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px" }}>
          {store && (
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#1f6270", textTransform: "uppercase" }}>
              {store.name}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "#0b2a31", marginTop: 16, lineHeight: 1.1 }}>
            {product.name.length > 60 ? `${product.name.slice(0, 57)}…` : product.name}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 32 }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#0b2a31" }}>{money(product.price)}</div>
            {saving > 0 && (
              <div style={{ display: "flex", fontSize: 36, color: "#94a3b8", marginLeft: 20, textDecoration: "line-through" }}>
                {money(product.compareAt!)}
              </div>
            )}
          </div>
          {saving > 0 && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                marginTop: 16,
                padding: "8px 20px",
                borderRadius: 999,
                background: "#ffe4e4",
                color: "#ed3b40",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              Save {saving}%
            </div>
          )}
          <div style={{ display: "flex", fontSize: 26, color: "#64748b", marginTop: "auto" }}>
            Banaadir Mall · EVC Plus · Zaad · Cash on delivery
          </div>
        </div>
      </div>
    ),
    size,
  );
}
