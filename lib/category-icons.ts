/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CATEGORY GLYPHS — a real icon for every category, including new ones.
 * ─────────────────────────────────────────────────────────────────────────
 * Categories are created in three ways: seeded, typed by an admin, or made
 * by a supplier import. Only the first ever had an icon chosen for it, so
 * the storefront filled up with identical brown parcels — thirteen of them
 * in a row, which reads as broken rather than as thirteen categories.
 *
 * Resolving the glyph from the NAME fixes all three at once, and keeps
 * fixing them: a category created next month gets an icon without anyone
 * remembering to pick one. A stored icon always wins, so an admin who does
 * choose one is never overridden.
 *
 * Client and server safe — no imports, no I/O.
 */

/**
 * Matched against the lower-cased category name, longest key first, so
 * "short-sleeve shirts" resolves before "shirts" and "bow tie" before "tie".
 */
const GLYPHS: Record<string, string> = {
  // ── Menswear, which is what the supplier catalogue is made of ──────
  "bow tie": "🎀",
  cummerbund: "🎀",
  "short-sleeve shirt": "👕",
  "short sleeve shirt": "👕",
  "non-iron shirt": "👔",
  "shirt jacket": "🧥",
  "t-shirt": "👕",
  tshirt: "👕",
  sweatshirt: "🧥",
  hoodie: "🧥",
  shirt: "👔",
  suit: "🤵",
  blazer: "🧥",
  jacket: "🧥",
  coat: "🧥",
  trouser: "👖",
  pant: "👖",
  jean: "👖",
  short: "🩳",
  sock: "🧦",
  underwear: "🩲",
  boxer: "🩲",
  pyjama: "🛌",
  knitwear: "🧶",
  jumper: "🧶",
  sweater: "🧶",
  tie: "👔",
  belt: "🪢",
  scarf: "🧣",
  glove: "🧤",
  hat: "🎩",
  cap: "🧢",

  // ── Footwear, bags, jewellery ───────────────────────────────────────
  shoe: "👞",
  sneaker: "👟",
  boot: "🥾",
  sandal: "🩴",
  slipper: "🥿",
  bag: "👜",
  backpack: "🎒",
  wallet: "👛",
  luggage: "🧳",
  bracelet: "📿",
  necklace: "📿",
  jewel: "💍",
  ring: "💍",
  watch: "⌚",
  sunglass: "🕶️",
  glasses: "👓",
  perfume: "🧴",
  fragrance: "🧴",

  // ── The wider marketplace ───────────────────────────────────────────
  dress: "👗",
  skirt: "👗",
  abaya: "🧕",
  hijab: "🧕",
  electronic: "📱",
  phone: "📱",
  computer: "💻",
  laptop: "💻",
  tv: "📺",
  camera: "📷",
  audio: "🎧",
  headphone: "🎧",
  game: "🎮",
  beauty: "💄",
  makeup: "💄",
  skincare: "🧴",
  hair: "💇",
  home: "🛋️",
  furniture: "🛋️",
  kitchen: "🍳",
  cookware: "🍳",
  tableware: "🍽️",
  bedding: "🛏️",
  bath: "🛁",
  textile: "🧵",
  decor: "🖼️",
  garden: "🪴",
  tool: "🔧",
  kid: "🧸",
  baby: "🧸",
  toy: "🧸",
  sport: "⚽",
  outdoor: "🏕️",
  fitness: "🏋️",
  bike: "🚲",
  grocer: "🧺",
  food: "🍎",
  drink: "🥤",
  book: "📚",
  stationery: "✏️",
  office: "📎",
  pet: "🐾",
  car: "🚗",
  auto: "🚗",
  health: "💊",
  accessor: "🧢",
  ceremony: "🎊",
  gift: "🎁",
};

/** Longest first, so specific names beat the generic ones they contain. */
const KEYS = Object.keys(GLYPHS).sort((a, b) => b.length - a.length);

/** Glyphs that mean "nobody chose one" and should be replaced. */
const PLACEHOLDERS = new Set(["📦", "🛍️", "", "?"]);

/**
 * The icon for a category.
 *
 * `stored` is whatever the database holds; it wins unless it is a
 * placeholder. Falls back to a neutral tag rather than a parcel — a parcel
 * means "a box of something", which is exactly the wrong idea for a
 * category, whereas a tag reads as "a label".
 */
export function categoryIcon(name: string, stored?: string | null): string {
  const existing = (stored ?? "").trim();
  if (existing && !PLACEHOLDERS.has(existing)) return existing;

  const haystack = name.toLowerCase();
  for (const key of KEYS) {
    if (haystack.includes(key)) return GLYPHS[key];
  }
  return "🏷️";
}
