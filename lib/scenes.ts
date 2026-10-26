/**
 * SCENES — the colour behind the hero slides and the campaign cards.
 *
 * A two-stop linear gradient is what made these look like a template: two
 * colours meet in a muddy middle (teal into orange goes through brown), and
 * a flat sheet of colour has no depth for the products to sit in. A
 * "scene" instead layers three gradients the way a photographer lights a
 * backdrop:
 *
 *   • a DEEP BASE — the first colour taken well down towards black, so
 *     white type and white product frames always have contrast;
 *   • a KEY LIGHT — the second colour as a soft glow from the top right,
 *     which is where the products sit;
 *   • a RIM LIGHT — a faint lift in the bottom left, so the base never
 *     reads as a flat dark slab.
 *
 * All CSS, no images: it costs nothing to download, renders before any
 * photo arrives, and works the same in light data mode. The fine grain on
 * top (`.scene-grain`, globals.css) is an inline SVG — no request either.
 *
 * No server imports: the admin's previews render the same backgrounds.
 */

/** A pair of colours for a scene: the base, then the glow. */
export interface Palette {
  from: string;
  to: string;
}

/**
 * Jewel tones, picked to sit together on one page. Shop campaigns draw
 * from these rather than from each shop's own art colours, which were
 * chosen one at a time and clash when four are side by side.
 */
export const PALETTES = {
  ocean: { from: "#08303a", to: "#22a3b5" },
  ember: { from: "#4a0d0a", to: "#f2600c" },
  emerald: { from: "#033b2e", to: "#e3a72f" },
  ruby: { from: "#4c0519", to: "#f43f5e" },
  sapphire: { from: "#0b1d4a", to: "#3b82f6" },
  plum: { from: "#2e0a4f", to: "#c056f0" },
  lagoon: { from: "#053a3a", to: "#2dd4bf" },
  indigo: { from: "#17144a", to: "#818cf8" },
  amber: { from: "#4a2306", to: "#f59e0b" },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

/** The palettes a shop's campaign can be given, in the order they rotate. */
const SHOP_PALETTES: PaletteName[] = ["ruby", "sapphire", "plum", "lagoon", "indigo", "amber"];

/**
 * A shop's palette — the same one every time for the same shop, so its
 * campaigns are recognisable week to week, but spread across the set so
 * two shops side by side rarely match.
 */
export function shopPalette(key: string): Palette {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[SHOP_PALETTES[h % SHOP_PALETTES.length]];
}

/** The layered background for a scene, as a CSS `background` value. */
export function sceneBackground(from: string, to: string): string {
  // Pale colours (an admin's pastel tile) stay pale: darkening them would
  // turn "soft pink" into maroon. They get the same depth from a white
  // highlight instead.
  if (isLight(to) && isLight(from)) {
    return [
      `radial-gradient(90% 120% at 100% 0%, ${rgba("#ffffff", 0.7)} 0%, transparent 55%)`,
      `radial-gradient(80% 100% at 0% 100%, ${rgba(to, 0.9)} 0%, transparent 70%)`,
      `linear-gradient(150deg, ${from}, ${to})`,
    ].join(", ");
  }
  const base = mix(from, "#000000", 0.35);
  return [
    `radial-gradient(85% 110% at 100% 0%, ${rgba(to, 0.85)} 0%, ${rgba(to, 0.25)} 40%, transparent 70%)`,
    `radial-gradient(60% 90% at 0% 100%, ${rgba(mix(to, from, 0.5), 0.35)} 0%, transparent 70%)`,
    `linear-gradient(150deg, ${base} 0%, ${from} 55%, ${mix(from, to, 0.25)} 100%)`,
  ].join(", ");
}

/**
 * Whether white words would be hard to read on this colour. Admin tiles
 * are often pastel ("#ffe4e6") — a light card with white text on it is the
 * kind of thing that makes a page look unfinished.
 */
export function isLight(hex: string): boolean {
  const rgb = parse(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

function parse(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` moved `amount` (0–1) of the way towards `b`. */
function mix(a: string, b: string, amount: number): string {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return a;
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex: string, alpha: number): string {
  const rgb = parse(hex);
  return rgb ? `rgba(${rgb.join(", ")}, ${alpha})` : hex;
}

/** Soft palettes for admin tiles that want a pale card with dark words. */
export const LIGHT_PALETTES = {
  blush: { from: "#fff1f2", to: "#fecdd3" },
  sand: { from: "#fdf6e9", to: "#f5d9a8" },
  mint: { from: "#ecfdf5", to: "#a7f3d0" },
} satisfies Record<string, Palette>;
