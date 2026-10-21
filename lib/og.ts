/**
 * ─────────────────────────────────────────────────────────────────────────
 *  LINK-PREVIEW CARDS — shared pieces for the opengraph-image routes.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. The card WhatsApp shows is drawn by next/og, which has two
 * traps this module exists to close:
 *
 *   1. It only draws PNG and JPEG. Imported and uploaded photos are often
 *      WebP or AVIF, and those came out as an empty panel — the "blank
 *      half" of a shared product. Every photo is fetched here and
 *      re-encoded to JPEG with sharp first, fitted on white.
 *
 *   2. Without fonts it falls back to a plain default face. The site's own
 *      Outfit and Inter (assets/fonts, OFL) are bundled instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const OG_SIZE = { width: 1200, height: 630 };

export const BRAND = {
  ocean: "#1f6270",
  ink: "#0c2b34",
  mango: "#fb8a0e",
  coral: "#ed3b40",
  coralBg: "#ffe4e4",
  muted: "#64748b",
  line: "#ece6dc",
  sand: "#faf8f4",
};

type Font = { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" };

let fonts: Promise<Font[]> | null = null;

export function ogFonts(): Promise<Font[]> {
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "assets/fonts/Outfit-ExtraBold.ttf")),
    readFile(path.join(process.cwd(), "assets/fonts/Outfit-Bold.ttf")),
    readFile(path.join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
  ])
    .then(([extraBold, bold, regular]): Font[] => [
      { name: "Outfit", data: extraBold, weight: 800, style: "normal" },
      { name: "Outfit", data: bold, weight: 700, style: "normal" },
      { name: "Inter", data: regular, weight: 400, style: "normal" },
    ])
    .catch(() => {
      // A missing font must not blank the card: next/og's default face is used.
      fonts = null;
      return [];
    });
  return fonts;
}

let logo: Promise<string | null> | null = null;

/** The bag logo as a PNG data URL. */
export function ogLogo(): Promise<string | null> {
  logo ??= readFile(path.join(process.cwd(), "public/banaadir-bag.png"))
    .then((buf) => sharp(buf).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
    .then((png) => `data:image/png;base64,${png.toString("base64")}`)
    .catch(() => null);
  return logo;
}

/**
 * Any photo (JPEG, PNG, WebP, AVIF, GIF) fitted into a box and returned as
 * a JPEG data URL — or null, so the card draws its fallback rather than an
 * empty panel. `fit: "contain"` on white suits product shots; "cover"
 * suits banners.
 */
export async function ogPhoto(
  src: string | undefined,
  origin: string,
  box: { width: number; height: number },
  fit: "contain" | "cover" = "contain",
): Promise<string | null> {
  if (!src) return null;
  const url = src.startsWith("http") ? src : `${origin}${src.startsWith("/") ? "" : "/"}${src}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input, { animated: false })
      .rotate()
      .resize(box.width, box.height, { fit, background: "#ffffff", withoutEnlargement: false })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Shorten to a word boundary for a fixed-size card. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : clean;
}
