"use client";

import { useEffect, useState } from "react";

/**
 * A SHOP'S LOGO, TRIMMED — for the white tab on a campaign card.
 *
 * Shops upload logos as they have them, and most are a small mark in the
 * middle of a big white (or transparent) square. Fitted into the tab as
 * is, the mark came out a few pixels tall — "U.S. Polo Assn" was
 * unreadable. So once the logo has loaded, the browser finds where the
 * mark actually is and shows just that, which lets it fill the tab.
 *
 * The plain logo renders first and stays if anything goes wrong — a host
 * that doesn't allow the pixels to be read (no CORS), an odd format — so
 * this can only ever make a logo bigger, never break one.
 */
export default function BrandLogo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [trimmed, setTrimmed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrimmed(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      try {
        const url = trim(img);
        if (url && !cancelled) setTrimmed(url);
      } catch {
        // Tainted canvas (no CORS) or similar: keep the plain logo.
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // eslint-disable-next-line @next/next/no-img-element -- store logos come from many hosts; trimmed ones are data URLs
  return <img src={trimmed ?? src} alt={alt} className={className} />;
}

/** Longest side the analysis works at; plenty for a logo in a 72px tab. */
const MAX_SIDE = 400;

/**
 * The logo cropped to its mark, as a data URL — or null when there is no
 * margin worth removing. Background = transparent or near-white pixels.
 */
function trim(img: HTMLImageElement): string | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const blank = a < 16 || (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240);
      if (blank) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null; // all background — leave it alone

  // A little breathing room, so the mark doesn't touch the tab's edge.
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.04);
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad);
  bottom = Math.min(h - 1, bottom + pad);
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  // Already tight: nothing to gain.
  if (cw * ch > w * h * 0.85) return null;

  // Crop from the full-resolution image so the mark stays sharp.
  const out = document.createElement("canvas");
  out.width = Math.round(cw / scale);
  out.height = Math.round(ch / scale);
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(img, left / scale, top / scale, cw / scale, ch / scale, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
