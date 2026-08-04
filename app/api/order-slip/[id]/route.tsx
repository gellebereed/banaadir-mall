import { ImageResponse } from "next/og";
import { getBaseProducts, getOrder } from "@/lib/api";

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
const HEIGHT = 1414; // A4-ish portrait, reads well in a chat thread.

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

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#faf8f4",
          fontFamily: "sans-serif",
          color: "#0c2b34",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#0c2b34",
            color: "#ffffff",
            padding: "44px 56px 36px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, opacity: 0.7 }}>
              BANAADIR MALL
            </div>
            <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, opacity: 0.7 }}>
              PICKING SLIP
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 18 }}>
            {order.id}
          </div>

          <div style={{ display: "flex", marginTop: 10, fontSize: 30, opacity: 0.85 }}>
            {storeName}
          </div>

          <div style={{ display: "flex", marginTop: 26, gap: 44, fontSize: 26, opacity: 0.75 }}>
            <div style={{ display: "flex" }}>Placed {stamp(order.date)}</div>
            <div style={{ display: "flex" }}>
              {lines.length} item{lines.length === 1 ? "" : "s"} · {units} unit
              {units === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* ── Items ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "34px 56px 0", flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 3,
              color: "#64748b",
              paddingBottom: 14,
              borderBottom: "3px solid #e8e1d3",
            }}
          >
            ITEMS TO PACK
          </div>

          {shown.map((item, index) => {
            const options = [item.selectedColor, item.selectedSize].filter(Boolean).join("  ·  ");
            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  paddingTop: 20,
                  paddingBottom: 20,
                  borderBottom: "1px solid #e8e1d3",
                }}
              >
                {/* Quantity first and large — the number a picker must not
                    misread while holding a phone in one hand. */}
                <div
                  style={{
                    display: "flex",
                    width: 96,
                    height: 72,
                    marginRight: 26,
                    backgroundColor: "#0c2b34",
                    color: "#ffffff",
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 40,
                    fontWeight: 800,
                  }}
                >
                  {item.qty}×
                </div>

                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, lineHeight: 1.25 }}>
                    {(item.name ?? item.productId).slice(0, 58)}
                  </div>
                  {options && (
                    <div style={{ display: "flex", marginTop: 6, fontSize: 25, color: "#475569" }}>
                      {options}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    marginLeft: 20,
                  }}
                >
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>
                    {money(item.price * (item.qty || 0))}
                  </div>
                  <div style={{ display: "flex", fontSize: 22, color: "#94a3b8", marginTop: 4 }}>
                    {money(item.price)} each
                  </div>
                </div>
              </div>
            );
          })}

          {hidden > 0 && (
            <div style={{ display: "flex", paddingTop: 18, fontSize: 25, color: "#64748b" }}>
              + {hidden} more item{hidden === 1 ? "" : "s"} — see the dashboard
            </div>
          )}
        </div>

        {/* ── Totals + delivery ──────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "0 56px 44px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "26px 32px",
              backgroundColor: "#0c2b34",
              color: "#ffffff",
              borderRadius: 20,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, opacity: 0.7, letterSpacing: 2 }}>
                YOUR SUBTOTAL
              </div>
              <div style={{ display: "flex", fontSize: 21, opacity: 0.6, marginTop: 4 }}>
                Your items only — delivery is settled by Banaadir Mall
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>{money(subtotal)}</div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 24,
              padding: "26px 32px",
              backgroundColor: "#ffffff",
              border: "3px solid #e8e1d3",
              borderRadius: 20,
            }}
          >
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: "#64748b" }}>
              DELIVER TO
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, marginTop: 10 }}>
              {order.customer}
            </div>
            {order.phone && (
              <div style={{ display: "flex", fontSize: 32, fontWeight: 600, marginTop: 6 }}>
                {order.phone}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 27, color: "#334155", marginTop: 8 }}>
              {destination.slice(0, 90)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 22,
              fontSize: 24,
              color: "#64748b",
            }}
          >
            Reply CONFIRM to accept · banaadirmall.com/vendor/orders
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // An order slip is personal and mutable — never let a CDN keep it.
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
