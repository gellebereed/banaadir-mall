import { ImageResponse } from "next/og";

/*
 * The preview shown when the home page — or any page without its own —
 * is shared. 1200×630 is what WhatsApp, Facebook and X all expect.
 */
export const alt = "Banaadir Mall — Somalia's online marketplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(120deg, #0f3d47 0%, #1f6270 60%, #2b8a8f 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#ffb547" }}>BANAADIR MALL</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 24, lineHeight: 1.05 }}>
          The whole market, in your pocket.
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 28, color: "#d9eef0" }}>
          Trusted Somali stores · EVC Plus · Zaad · eDahab · Cash on delivery
        </div>
      </div>
    ),
    // No emoji here: this image is rendered at BUILD time, and emoji
    // artwork is fetched from a CDN — a build must not depend on that.
    size,
  );
}
