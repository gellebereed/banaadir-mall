import { ImageResponse } from "next/og";
import { getProductsByStore, getStore } from "@/lib/api";
import { BRAND, clip, ogFonts, ogLogo, ogPhoto, OG_SIZE } from "@/lib/og";
import { primaryImage } from "@/lib/product-utils";
import { requestOrigin } from "@/lib/request-origin";

/*
 * The card shown when a store link is shared: its banner, logo, name and
 * tagline, a strip of its products and a "Shop now" button, under the
 * Banaadir Mall logo.
 */
export const alt = "Store on Banaadir Mall";
export const size = OG_SIZE;
export const contentType = "image/png";

const BANNER = 210;
const THUMB = 160;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const [store, fonts, logo, origin] = await Promise.all([getStore(slug), ogFonts(), ogLogo(), requestOrigin()]);
  if (!store) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: BRAND.ocean }} />, {
      ...size,
      fonts,
    });
  }
  const all = await getProductsByStore(store.slug);
  const count = all.length;
  const products = all.filter((p) => primaryImage(p)).slice(0, 4);
  const [banner, avatar, ...thumbs] = await Promise.all([
    ogPhoto(store.banner, origin, { width: 1200, height: BANNER }, "cover"),
    ogPhoto(store.logo, origin, { width: 150, height: 150 }),
    ...products.map((p) => ogPhoto(primaryImage(p), origin, { width: THUMB, height: THUMB })),
  ]);
  const shown = thumbs.filter((t): t is string => Boolean(t));

  return (
    new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.sand, fontFamily: "Inter" }}>
          {/* Banner */}
          <div
            style={{
              height: BANNER,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "flex-start",
              padding: 28,
              background: `linear-gradient(120deg, ${store.art.from}, ${store.art.to})`,
              position: "relative",
            }}
          >
            {banner && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} width={1200} height={BANNER} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 18px 8px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.92)",
              }}
            >
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} width={40} height={40} alt="" style={{ marginRight: 10 }} />
              )}
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 24, color: BRAND.ocean }}>
                Banaadir Mall
              </div>
            </div>
          </div>

          {/* Store */}
          <div style={{ display: "flex", padding: "0 56px", marginTop: -75 }}>
            <div
              style={{
                width: 170,
                height: 170,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 36,
                border: "8px solid #ffffff",
                background: avatar ? "#ffffff" : `linear-gradient(135deg, ${store.art.from}, ${store.art.to})`,
                boxShadow: "0 8px 24px rgba(12,43,52,0.15)",
                overflow: "hidden",
              }}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} width={150} height={150} alt="" />
              ) : (
                <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 84, color: "#ffffff" }}>
                  {store.name.trim().charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 30, paddingTop: 92 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 52, color: BRAND.ink }}>
                  {clip(store.name, 32)}
                </div>
                {(store.official || store.verified) && (
                  <div
                    style={{
                      display: "flex",
                      marginLeft: 16,
                      padding: "6px 16px",
                      borderRadius: 999,
                      background: store.official ? "#ffeecd" : "#d7f2f2",
                      color: store.official ? "#96420e" : BRAND.ocean,
                      fontFamily: "Outfit",
                      fontWeight: 700,
                      fontSize: 22,
                    }}
                  >
                    {store.official ? "Official Brand" : "Verified"}
                  </div>
                )}
              </div>
              {store.tagline && (
                <div style={{ display: "flex", fontSize: 26, color: BRAND.muted, marginTop: 4 }}>{clip(store.tagline, 60)}</div>
              )}
              <div style={{ display: "flex", fontSize: 22, color: BRAND.muted, marginTop: 10 }}>
                {[
                  store.reviewCount > 0 ? `${store.rating.toFixed(1)} rating (${store.reviewCount.toLocaleString("en-US")})` : "",
                  store.city,
                  `${count} product${count === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </div>
            </div>
          </div>

          {/* Products + call to action */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 56px 40px", marginTop: "auto" }}>
            <div style={{ display: "flex" }}>
              {shown.map((src, i) => (
                <div
                  key={i}
                  style={{
                    width: THUMB + 8,
                    height: THUMB + 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 14,
                    borderRadius: 20,
                    background: "#ffffff",
                    border: `2px solid ${BRAND.line}`,
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} width={THUMB} height={THUMB} alt="" />
                </div>
              ))}
              {shown.length === 0 && (
                <div style={{ display: "flex", fontSize: 24, color: BRAND.muted }}>
                  EVC Plus · Zaad · eDahab · Cash on delivery
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                padding: "16px 38px",
                borderRadius: 999,
                background: BRAND.mango,
                color: "#ffffff",
                fontFamily: "Outfit",
                fontWeight: 800,
                fontSize: 30,
              }}
            >
              Shop now
            </div>
          </div>
        </div>
      ),
      { ...size, fonts },
    )
  );
}
