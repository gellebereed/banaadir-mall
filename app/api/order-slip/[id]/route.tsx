import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { getBaseProducts, getOrder } from "@/lib/api";
import { BRAND, clip, ogFonts } from "@/lib/og";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PICKING SLIP — one parcel, as an image.
 * ─────────────────────────────────────────────────────────────────────────
 * A WhatsApp click-to-chat link (`wa.me/…?text=`) carries TEXT and nothing
 * else. It cannot attach a photo, so "send the vendor an image instead of a
 * message" is not something the link format can do on its own. What works
 * in practice is both:
 *
 *   · the text message stays, because it is searchable, copy-pasteable and
 *     readable on any phone with any font; and
 *   · this endpoint renders the same parcel as a PNG the customer can
 *     share into the chat (see OrderSlipShare), and which the message
 *     links to.
 *
 * The image is what a picker actually wants: big quantities, references
 * they can match against a shelf label, and an address they can read from
 * arm's length. The text is what an accountant wants later.
 *
 * ── On access ────────────────────────────────────────────────────────────
 * Reachable by order id alone, exactly like /track. The slip shows nothing
 * that page doesn't already show to whoever holds the id. It is deliberately
 * NOT indexable and carries no-store, so it does not linger in caches.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const runtime = "nodejs";

const WIDTH = 1000;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stamp(iso: string): string {
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Long orders get truncated rather than overflowing off the canvas. */
const MAX_ROWS = 14;
/** Characters of a product name that fit on one line of a row. */
const NAME_LINE = 40;

let logo: Promise<string | null> | null = null;

/** The wordmark (public/banaadir-logo.png) as a data URL, for the header. */
function slipLogo(): Promise<string | null> {
  logo ??= readFile(path.join(process.cwd(), "public/banaadir-logo.png"))
    .then((png) => `data:image/png;base64,${png.toString("base64")}`)
    .catch(() => {
      logo = null;
      return null;
    });
  return logo;
}

const LINE = BRAND.line;
const site = PUBLIC_SITE_URL.replace(/^https?:\/\//, "");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    return new Response("Order not found", { status: 404 });
  }

  /**
   * Fill in anything the order line is missing from the catalogue.
   *
   * Orders placed before checkout captured names and prices carry only a
   * product id and a quantity — printing that gives a picker a slip that
   * reads "dinner-set-for-12-people-msahht5c … $0.00", which is worse than
   * useless. New orders never need this path.
   */
  const catalogue = new Map((await getBaseProducts()).map((p) => [p.id, p]));

  const lines = (order.items ?? []).map((item) => {
    const product = catalogue.get(item.productId);
    return {
      ...item,
      name: item.name ?? product?.name ?? item.productId,
      price: item.price ?? product?.price ?? 0,
    };
  });

  const shown = lines.slice(0, MAX_ROWS);
  const hidden = lines.length - shown.length;
  const units = lines.reduce((sum, item) => sum + (item.qty || 0), 0);

  const lineTotal = lines.reduce((sum, item) => sum + item.price * (item.qty || 0), 0);
  // If not a single line could be priced, the order's own total is the only
  // honest number left to show.
  const subtotal = lineTotal > 0 ? lineTotal : order.total;

  const storeName =
    lines.find((item) => item.storeName)?.storeName ??
    order.store.replace(/-/g, " ").toUpperCase();

  /** The city is usually already inside the address; don't print it twice. */
  const destination = [order.address, order.city]
    .filter(Boolean)
    .filter(
      (part, index, all) =>
        index === 0 || !all[0]?.toLowerCase().includes(String(part).toLowerCase()),
    )
    .join(", ");

  const [fonts, logoSrc] = await Promise.all([ogFonts(), slipLogo()]);

  /*
   * The canvas is as tall as the order, not a fixed A4: a two-item slip
   * used to end in a large empty band above the totals.
   */
  const rows = shown.map((item) => {
    const name = clip(item.name ?? item.productId, NAME_LINE * 2);
    const options = [item.selectedColor, item.selectedSize].filter(Boolean) as string[];
    const nameLines = name.length > NAME_LINE ? 2 : 1;
    return { item, name, options, height: 52 + nameLines * 38 + (options.length ? 48 : 0) };
  });
  const height =
    150 + // logo bar
    250 + // order band
    96 + // section title
    rows.reduce((sum, row) => sum + row.height, 0) +
    (hidden > 0 ? 56 : 0) +
    (order.phone ? 516 : 470); // totals, delivery, footer

  const label = { display: "flex", fontSize: 20, letterSpacing: 3, color: BRAND.muted, fontFamily: "Outfit", fontWeight: 700 } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height,
          display: "flex",
          flexDirection: "column",
          backgroundColor: BRAND.sand,
          fontFamily: "Inter",
          color: BRAND.ink,
        }}
      >
        {/* ── Brand bar ──────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            height: 150,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 56px",
            backgroundColor: "#ffffff",
            borderBottom: `6px solid ${BRAND.mango}`,
          }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} width={250} height={100} alt="" />
          ) : (
            <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 40 }}>Banaadir Mall</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                backgroundColor: BRAND.ink,
                color: "#ffffff",
                fontFamily: "Outfit",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: 3,
              }}
            >
              PICKING SLIP
            </div>
            <div style={{ display: "flex", marginTop: 10, fontSize: 20, color: BRAND.muted }}>{site}</div>
          </div>
        </div>

        {/* ── Order ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: 250,
            justifyContent: "center",
            padding: "0 56px",
            backgroundColor: BRAND.ink,
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, opacity: 0.6, fontFamily: "Outfit", fontWeight: 700 }}>
            ORDER
          </div>
          <div style={{ display: "flex", marginTop: 6, fontFamily: "Outfit", fontWeight: 800, fontSize: 58, letterSpacing: 1 }}>
            {order.id}
          </div>
          <div style={{ display: "flex", marginTop: 18, gap: 14 }}>
            {[storeName, `Placed ${stamp(order.date)}`, `${lines.length} item${lines.length === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"}`].map(
              (chip, index) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    padding: "8px 18px",
                    borderRadius: 999,
                    fontSize: 22,
                    backgroundColor: index === 0 ? BRAND.mango : "rgba(255,255,255,0.12)",
                    color: "#ffffff",
                    fontFamily: index === 0 ? "Outfit" : "Inter",
                    fontWeight: index === 0 ? 700 : 400,
                  }}
                >
                  {chip}
                </div>
              ),
            )}
          </div>
        </div>

        {/* ── Items ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "40px 56px 0", flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18 }}>
            <div style={label}>ITEMS TO PACK</div>
            <div style={label}>PRICE</div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
              border: `2px solid ${LINE}`,
              borderRadius: 24,
              padding: "0 28px",
            }}
          >
            {rows.map(({ item, name, options }, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  padding: "26px 0",
                  borderTop: index === 0 ? "none" : `2px solid ${LINE}`,
                }}
              >
                {/* A box to tick while packing. */}
                <div
                  style={{
                    display: "flex",
                    width: 34,
                    height: 34,
                    marginTop: 8,
                    marginRight: 20,
                    border: `3px solid ${BRAND.ocean}`,
                    borderRadius: 8,
                  }}
                />
                {/* Quantity first and large — the number a picker must not
                    misread while holding a phone in one hand. */}
                <div
                  style={{
                    display: "flex",
                    width: 84,
                    height: 52,
                    marginRight: 24,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#fff1df",
                    color: "#bd5507",
                    fontFamily: "Outfit",
                    fontWeight: 800,
                    fontSize: 32,
                  }}
                >
                  {item.qty}×
                </div>

                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 700, fontSize: 30, lineHeight: 1.25 }}>
                    {name}
                  </div>
                  {options.length > 0 && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      {options.map((option) => (
                        <div
                          key={option}
                          style={{
                            display: "flex",
                            padding: "4px 14px",
                            borderRadius: 10,
                            backgroundColor: "#effafa",
                            color: BRAND.ocean,
                            fontSize: 22,
                          }}
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 20 }}>
                  <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 30 }}>
                    {money(item.price * (item.qty || 0))}
                  </div>
                  {(item.qty || 0) > 1 && (
                    <div style={{ display: "flex", fontSize: 20, color: BRAND.muted, marginTop: 4 }}>
                      {money(item.price)} each
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hidden > 0 && (
            <div style={{ display: "flex", paddingTop: 18, fontSize: 24, color: BRAND.muted }}>
              + {hidden} more item{hidden === 1 ? "" : "s"} — see the dashboard
            </div>
          )}
        </div>

        {/* ── Totals + delivery ──────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "28px 56px 40px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "26px 32px",
              backgroundColor: BRAND.ink,
              color: "#ffffff",
              borderRadius: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 700, fontSize: 22, letterSpacing: 3, opacity: 0.75 }}>
                YOUR SUBTOTAL
              </div>
              <div style={{ display: "flex", fontSize: 20, opacity: 0.6, marginTop: 6 }}>
                Your items only. Delivery is settled by Banaadir Mall.
              </div>
            </div>
            <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 56, color: BRAND.mango }}>
              {money(subtotal)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 22,
              padding: "26px 32px",
              backgroundColor: "#ffffff",
              border: `2px solid ${LINE}`,
              borderLeft: `8px solid ${BRAND.ocean}`,
              borderRadius: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={label}>DELIVER TO</div>
              <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 700, fontSize: 34, marginTop: 10 }}>
                {clip(order.customer, 40)}
              </div>
              {order.phone && (
                <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 700, fontSize: 30, marginTop: 6, color: BRAND.ocean }}>
                  {order.phone}
                </div>
              )}
              <div style={{ display: "flex", fontSize: 26, color: "#334155", marginTop: 8 }}>
                {clip(destination, 80)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 26,
              paddingTop: 22,
              borderTop: `2px dashed ${LINE}`,
              fontSize: 22,
              color: BRAND.muted,
            }}
          >
            <div style={{ display: "flex" }}>
              Reply <span style={{ fontFamily: "Outfit", fontWeight: 700, color: BRAND.ink, margin: "0 8px" }}>CONFIRM</span> to accept
            </div>
            <div style={{ display: "flex" }}>{site}/vendor/orders</div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      fonts,
      headers: {
        // An order slip is personal and mutable — never let a CDN keep it.
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
