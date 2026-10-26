import { ImageResponse } from "next/og";
import { KIND_LABEL, shopDay } from "@/lib/campaign-utils";
import { getCampaign } from "@/lib/campaigns";
import { money } from "@/lib/format";
import { BRAND, clip, ogFonts, ogLogo, ogPhoto, OG_SIZE } from "@/lib/og";
import { primaryImage } from "@/lib/product-utils";
import { requestOrigin } from "@/lib/request-origin";

/*
 * The card shown when a campaign link is shared — and the picture a shop
 * owner saves for Instagram from the share panel.
 *
 * A route rather than an opengraph-image file because the site-wide sale is
 * shared per shop (`?store=`), and that shop's own name and products belong
 * on the card it posts: file-based images never see the query string.
 *
 * Built to be read at thumbnail size in a WhatsApp chat: the offer itself
 * ("25% off") is the biggest thing on it, then who is giving it, then the
 * products. Everything else is small or absent.
 */

const TILE = 214;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storeParam = new URL(request.url).searchParams.get("store") ?? undefined;
  const [campaign, fonts, logo, origin] = await Promise.all([getCampaign(id), ogFonts(), ogLogo(), requestOrigin()]);

  const headers = { "Cache-Control": "public, max-age=300, s-maxage=600" };

  if (!campaign) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: BRAND.ocean }} />, {
      ...OG_SIZE,
      fonts,
      headers,
    });
  }

  // The shop sharing the site-wide sale leads it, with its own products.
  const sharer = storeParam ? campaign.stores.find((s) => s.slug === storeParam) : undefined;
  const store = campaign.store ?? sharer;
  const products = (sharer ? campaign.products.filter((p) => p.store === sharer.slug) : campaign.products)
    .filter((p) => primaryImage(p))
    .slice(0, 4);

  const [avatar, ...photos] = await Promise.all([
    store ? ogPhoto(store.logo, origin, { width: 96, height: 96 }) : Promise.resolve(null),
    ...products.map((p) => ogPhoto(primaryImage(p), origin, { width: TILE, height: TILE })),
  ]);
  // Only fetched when there are no product photos to fill the right side.
  const avatarLarge = photos.every((p) => !p) && store ? await ogPhoto(store.logo, origin, { width: 240, height: 240 }) : null;
  const tiles = products
    .map((p, i) => ({ p, src: photos[i] }))
    .filter((t): t is { p: (typeof products)[number]; src: string } => Boolean(t.src));

  const headline = campaign.headline;
  const headlineSize = headline.length <= 9 ? 128 : headline.length <= 16 ? 92 : 66;
  const ended = campaign.status === "ended" || campaign.status === "paused";
  const meta = ended
    ? "This campaign has ended"
    : campaign.endsAt
      ? `Ends ${shopDay(campaign.endsAt)}`
      : campaign.kind === "sale" && !sharer
        ? `${campaign.stores.length} shop${campaign.stores.length === 1 ? "" : "s"} taking part`
        : "Limited time";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(125deg, ${campaign.from}, ${campaign.to})`,
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* Soft light behind the products, so photos on white sit on something. */}
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -160,
            width: 720,
            height: 720,
            borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
            display: "flex",
          }}
        />

        {/* Words */}
        <div style={{ display: "flex", flexDirection: "column", width: 650, padding: "48px 0 48px 60px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 18px 8px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.95)",
              }}
            >
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} width={36} height={36} alt="" style={{ marginRight: 10 }} />
              )}
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 22, color: BRAND.ocean }}>
                Banaadir Mall
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 14,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.22)",
                color: "#ffffff",
                fontFamily: "Outfit",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {KIND_LABEL[campaign.kind]}
            </div>
          </div>

          {store && (
            <div style={{ display: "flex", alignItems: "center", marginTop: 34 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 18,
                  background: avatar ? "#ffffff" : "rgba(255,255,255,0.25)",
                  border: "3px solid rgba(255,255,255,0.9)",
                  overflow: "hidden",
                  marginRight: 16,
                }}
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} width={58} height={58} alt="" />
                ) : (
                  <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 32, color: "#ffffff" }}>
                    {store.name.trim().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 32, color: "#ffffff" }}>
                {clip(store.name, 28)}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              marginTop: store ? 18 : 48,
              fontFamily: "Outfit",
              fontWeight: 800,
              fontSize: headlineSize,
              lineHeight: 1,
              color: "#ffffff",
              textShadow: "0 4px 24px rgba(0,0,0,0.18)",
            }}
          >
            {clip(headline, 28)}
          </div>
          <div style={{ display: "flex", marginTop: 14, fontFamily: "Outfit", fontWeight: 700, fontSize: 36, color: "rgba(255,255,255,0.92)" }}>
            {clip(campaign.name, 34)}
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
            {!ended && (
              <div
                style={{
                  display: "flex",
                  padding: "16px 34px",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: BRAND.ink,
                  fontFamily: "Outfit",
                  fontWeight: 800,
                  fontSize: 28,
                  marginRight: 18,
                }}
              >
                Shop now →
              </div>
            )}
            <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.9)" }}>{meta}</div>
          </div>
        </div>

        {/* No product photos to show: the shop's logo (or the mall's bag)
            fills the space instead of leaving half the card empty. */}
        {tiles.length === 0 && (avatarLarge ?? logo) && (
          <div
            style={{
              position: "absolute",
              right: 90,
              top: 165,
              width: 300,
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 64,
              background: "#ffffff",
              boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
              transform: "rotate(-4deg)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(avatarLarge ?? logo)!} width={avatarLarge ? 240 : 200} height={avatarLarge ? 240 : 200} alt="" />
          </div>
        )}

        {/* Products */}
        {tiles.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              justifyContent: "center",
              width: 550,
              padding: "0 40px 0 20px",
            }}
          >
            {tiles.map(({ p, src }, i) => (
              <div
                key={i}
                style={{
                  width: TILE + 12,
                  height: TILE + 12,
                  margin: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 26,
                  background: "#ffffff",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} width={TILE} height={TILE} alt="" />
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 10,
                    display: "flex",
                    alignItems: "center",
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: BRAND.coral,
                    color: "#ffffff",
                    fontFamily: "Outfit",
                    fontWeight: 800,
                    fontSize: 20,
                  }}
                >
                  {money(p.price)}
                  {p.compareAt && p.compareAt > p.price ? (
                    <span style={{ marginLeft: 8, fontSize: 15, fontWeight: 700, opacity: 0.8, textDecoration: "line-through" }}>
                      {money(p.compareAt)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { ...OG_SIZE, fonts, headers },
  );
}
