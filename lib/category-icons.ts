/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CATEGORY GLYPHS — clean, professional icons for every category.
 * ─────────────────────────────────────────────────────────────────────────
 * Categories are created in three ways: seeded, typed by an admin, or made
 * by a supplier import.
 *
 * Resolving the glyph from the NAME fixes all three at once, using strict
 * word-boundary matching to prevent accidental substring matches (e.g.
 * "carpet" matching "pet" or "pants" matching "pan").
 *
 * Client and server safe — no imports, no I/O.
 */

const GLYPHS: Record<string, string> = {
  // ── Home, Kitchen, Living & Décor ──────────────────────────────────
  "breakfast set": "🍳",
  breakfast: "🍳",
  "tea set": "🫖",
  tea: "🫖",
  coffee: "☕",
  "cake pan": "🎂",
  cake: "🎂",
  bakeware: "🎂",
  baking: "🎂",
  candle: "🕯️",
  candles: "🕯️",
  carpet: "🛋️",
  carpets: "🛋️",
  rug: "🛋️",
  rugs: "🛋️",
  tableware: "🍽️",
  dinnerware: "🍽️",
  drinkware: "🫖",
  glassware: "🥛",
  cookware: "🍳",
  kitchenware: "🍳",
  kitchen: "🍳",
  decor: "🖼️",
  decoration: "🖼️",
  "wall art": "🖼️",
  curtain: "🪟",
  curtains: "🪟",
  lamp: "💡",
  lighting: "💡",
  light: "💡",
  mirror: "🪞",
  vase: "🪴",
  bedding: "🛏️",
  pillow: "🛏️",
  cushion: "🛋️",
  towel: "🛁",
  bath: "🛁",
  bathroom: "🛁",
  furniture: "🛋️",
  home: "🛋️",
  garden: "🪴",
  storage: "📦",
  organizer: "📦",

  // ── Menswear & Apparel ─────────────────────────────────────────────
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
  shirts: "👔",
  suit: "👔",
  suits: "👔",
  tuxedo: "👔",
  blazer: "🧥",
  jacket: "🧥",
  jackets: "🧥",
  coat: "🧥",
  coats: "🧥",
  trouser: "👖",
  trousers: "👖",
  pant: "👖",
  pants: "👖",
  jean: "👖",
  jeans: "👖",
  short: "🩳",
  shorts: "🩳",
  sock: "🧦",
  socks: "🧦",
  underwear: "🩲",
  boxer: "🩲",
  pyjama: "🛌",
  pajama: "🛌",
  knitwear: "🧶",
  jumper: "🧶",
  sweater: "🧶",
  tie: "👔",
  ties: "👔",
  belt: "🪢",
  belts: "🪢",
  scarf: "🧣",
  glove: "🧤",
  gloves: "🧤",
  hat: "🧢",
  cap: "🧢",
  caps: "🧢",

  // ── Womenswear & Fashion ──────────────────────────────────────────
  dress: "👗",
  dresses: "👗",
  skirt: "👗",
  skirts: "👗",
  gown: "👗",
  abaya: "🧕",
  abayas: "🧕",
  hijab: "🧕",
  hijabs: "🧕",
  modest: "🧕",

  // ── Footwear, Bags, Jewellery & Accessories ────────────────────────
  shoe: "👞",
  shoes: "👞",
  sneaker: "👟",
  sneakers: "👟",
  boot: "🥾",
  boots: "🥾",
  sandal: "🩴",
  sandals: "🩴",
  slipper: "🥿",
  slippers: "🥿",
  heel: "👠",
  heels: "👠",
  bag: "👜",
  bags: "👜",
  handbag: "👜",
  tote: "👜",
  backpack: "🎒",
  wallet: "👛",
  wallets: "👛",
  luggage: "🧳",
  suitcase: "🧳",
  bracelet: "📿",
  necklace: "📿",
  jewel: "💎",
  jewelry: "💎",
  jewellery: "💎",
  ring: "💍",
  rings: "💍",
  watch: "⌚",
  watches: "⌚",
  sunglass: "🕶️",
  sunglasses: "🕶️",
  eyewear: "🕶️",
  glasses: "👓",
  accessory: "🧢",
  accessories: "🧢",

  // ── Electronics & Gadgets ─────────────────────────────────────────
  electronic: "📱",
  electronics: "📱",
  phone: "📱",
  smartphone: "📱",
  mobile: "📱",
  computer: "💻",
  laptop: "💻",
  tablet: "📱",
  ipad: "📱",
  tv: "📺",
  television: "📺",
  camera: "📷",
  audio: "🎧",
  headphone: "🎧",
  headphones: "🎧",
  speaker: "🔊",
  game: "🎮",
  gaming: "🎮",
  console: "🎮",

  // ── Beauty, Personal Care & Health ────────────────────────────────
  perfume: "🧴",
  fragrance: "🧴",
  cologne: "🧴",
  beauty: "💄",
  makeup: "💄",
  cosmetics: "💄",
  skincare: "🧴",
  serum: "🧴",
  hair: "💇",
  haircare: "💇",
  health: "💊",
  vitamin: "💊",

  // ── Kids, Sports, Groceries & Miscellaneous ──────────────────────
  kid: "🧸",
  kids: "🧸",
  baby: "🧸",
  toy: "🧸",
  toys: "🧸",
  sport: "⚽",
  sports: "⚽",
  outdoor: "🏕️",
  fitness: "🏋️",
  gym: "🏋️",
  bike: "🚲",
  grocer: "🧺",
  groceries: "🧺",
  food: "🍎",
  drink: "🥤",
  beverage: "🥤",
  book: "📚",
  books: "📚",
  stationery: "✏️",
  office: "📎",
  pet: "🐾",
  pets: "🐾",
  car: "🚗",
  auto: "🚗",
  automotive: "🚗",
  tool: "🔧",
  tools: "🔧",
  hardware: "🔧",
  gift: "🎁",
  gifts: "🎁",
};

/** Keys sorted by length descending so multi-word terms match first. */
const KEYS = Object.keys(GLYPHS).sort((a, b) => b.length - a.length);

/** Glyphs that mean "nobody chose a specific icon" and should be upgraded. */
const PLACEHOLDERS = new Set(["📦", "🛍️", "🏷️", "🐾", "🤵", "", "?"]);

/**
 * Checks whether a key matches the category name.
 * Multi-word keys use string includes; single-word keys use word boundaries
 * to prevent accidental substring collisions (e.g. "pet" in "carpet").
 */
function matchesKey(haystack: string, key: string): boolean {
  if (key.includes(" ") || key.includes("-")) {
    return haystack.includes(key);
  }
  const regex = new RegExp(`\\b${key}\\b`, "i");
  return regex.test(haystack);
}

/**
 * Returns the icon for a category.
 */
export function categoryIcon(name: string, stored?: string | null): string {
  const existing = (stored ?? "").trim();

  // If a non-placeholder custom icon was explicitly set, preserve it.
  if (existing && !PLACEHOLDERS.has(existing)) return existing;

  const haystack = name.toLowerCase();

  for (const key of KEYS) {
    if (matchesKey(haystack, key)) {
      return GLYPHS[key];
    }
  }

  // Fallback to neutral, clean category icon
  return "🛍️";
}
