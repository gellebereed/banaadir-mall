import { ImageResponse } from "next/og";
import { getProduct, getStore } from "@/lib/api";
import { money } from "@/lib/format";
import { BRAND, clip, ogFonts, ogLogo, ogPhoto, OG_SIZE } from "@/lib/og";
import { primaryImage } from "@/lib/product-utils";
import { requestOrigin } from "@/lib/request-origin";

/*
 * The card WhatsApp shows when a product link is shared: the photo on
 * white, then the shop, name, price (and the saving) and a "Shop now"
 * button, under the Banaadir Mall logo. Photos go through lib/og.ts so a
 * WebP or AVIF one is drawn rather than left blank.
 */
export const alt = "Product on Banaadir Mall";
export const size = OG_SIZE;
export const contentType = "image/png";

const PHOTO = 630;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug);
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);
  if (!product) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: BRAND.ocean }} />, {
      ...size,
      fonts,
    });
  }
  const [store, photo] = await Promise.all([
    getStore(product.store),
    ogPhoto(primaryImage(product), await requestOrigin(), { width: PHOTO - 80, height: PHOTO - 80 }),
  ]);
  const saving =
    product.compareAt && product.compareAt > product.price
      ? Math.round((1 - product.price / product.compareAt) * 100)
      : 0;
  const name = clip(product.name, 70);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", fontFamily: "Inter" }}>
        {/* Photo */}
        <div
          style={{
            width: PHOTO,
            height: PHOTO,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: photo ? "#ffffff" : `linear-gradient(135deg, ${product.art.from}, ${product.art.to})`,
            borderRight: `2px solid ${BRAND.line}`,
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} width={PHOTO - 80} height={PHOTO - 80} alt="" />
          ) : (
            // Emoji artwork would be fetched from a CDN mid-render, and one
            // failed fetch blanks the card; the initial cannot fail.
            <div
              style={{
                width: 260,
                height: 260,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.7)",
                fontFamily: "Outfit",
                fontSize: 150,
                fontWeight: 800,
                color: BRAND.ocean,
              }}
            >
              {product.name.trim().charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Details */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "44px 52px 48px",
            background: BRAND.sand,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={52} height={52} alt="" style={{ marginRight: 14 }} />
            )}
            <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 30, color: BRAND.ocean }}>
              Banaadir Mall
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
            {store && (
              <div
                style={{
                  display: "flex",
                  fontFamily: "Outfit",
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: 1.5,
                  color: BRAND.muted,
                  textTransform: "uppercase",
                }}
              >
                {clip(store.name, 34)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                fontFamily: "Outfit",
                fontWeight: 800,
                fontSize: name.length > 40 ? 40 : 50,
                lineHeight: 1.12,
                color: BRAND.ink,
                marginTop: 12,
              }}
            >
              {name}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 64, color: BRAND.ink }}>
                {money(product.price)}
              </div>
              {saving > 0 && (
                <div
                  style={{
                    display: "flex",
                    fontSize: 30,
                    color: "#94a3b8",
                    marginLeft: 18,
                    textDecoration: "line-through",
                  }}
                >
                  {money(product.compareAt!)}
                </div>
              )}
              {saving > 0 && (
                <div
                  style={{
                    display: "flex",
                    marginLeft: 16,
                    padding: "6px 16px",
                    borderRadius: 999,
                    background: BRAND.coralBg,
                    color: BRAND.coral,
                    fontFamily: "Outfit",
                    fontWeight: 700,
                    fontSize: 26,
                  }}
                >
                  -{saving}%
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "14px 34px",
                borderRadius: 999,
                background: BRAND.mango,
                color: "#ffffff",
                fontFamily: "Outfit",
                fontWeight: 800,
                fontSize: 28,
              }}
            >
              Shop now
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 22, fontSize: 19, color: BRAND.muted, lineHeight: 1.35 }}>
              <div style={{ display: "flex" }}>EVC Plus · Zaad · eDahab</div>
              <div style={{ display: "flex" }}>Cash on delivery</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
