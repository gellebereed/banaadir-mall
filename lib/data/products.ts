import type { Art, Product } from "../types";

/**
 * Product catalog (demo data).
 * In Odoo these map to `product.template` records. Replace with an Odoo
 * fetch inside lib/api.ts when the connector is built — the UI only talks
 * to lib/api.ts, never to this file directly.
 */

/** Soft gradient palettes used for the generated product artwork. */
const HUES: Record<string, Art> = {
  sky: { from: "#e0f2fe", to: "#bae6fd" },
  teal: { from: "#ccfbf1", to: "#99f6e4" },
  amber: { from: "#fef3c7", to: "#fde68a" },
  rose: { from: "#ffe4e6", to: "#fecdd3" },
  violet: { from: "#ede9fe", to: "#ddd6fe" },
  lime: { from: "#ecfccb", to: "#d9f99d" },
  slate: { from: "#f1f5f9", to: "#e2e8f0" },
  peach: { from: "#ffedd5", to: "#fed7aa" },
};

/** Generic feature bullets per category — shown on the product page. */
const FEATURES: Record<string, string[]> = {
  electronics: [
    "12-month official warranty",
    "Free delivery inside Mogadishu",
    "7-day easy returns",
    "Genuine, factory-sealed product",
  ],
  "womens-fashion": [
    "Premium breathable fabric",
    "True-to-size fit — see size guide",
    "7-day easy returns",
    "Ships within 24 hours",
  ],
  "mens-fashion": [
    "Durable stitching & premium fabric",
    "True-to-size fit — see size guide",
    "7-day easy returns",
    "Ships within 24 hours",
  ],
  beauty: [
    "100% authentic & sealed",
    "Made with natural ingredients",
    "Dermatologist friendly",
    "Ships within 24 hours",
  ],
  "home-living": [
    "Quality-checked before dispatch",
    "Careful protective packaging",
    "7-day easy returns",
    "Cash on delivery available",
  ],
  "kids-baby": [
    "Child-safe, non-toxic materials",
    "Quality-checked before dispatch",
    "7-day easy returns",
    "Gift wrapping available",
  ],
  "sports-outdoor": [
    "Built for daily training",
    "Quality-checked before dispatch",
    "7-day easy returns",
    "Ships within 24 hours",
  ],
  groceries: [
    "Freshness guaranteed",
    "Sealed & hygienically packed",
    "Same-day delivery in Mogadishu",
    "Cash on delivery available",
  ],
};

/** Colour / size options per category (undefined = product has no variants). */
const COLORS: Record<string, string[] | undefined> = {
  electronics: ["Black", "Silver", "Blue"],
  "womens-fashion": ["Black", "Dusty Rose", "Emerald", "Sand"],
  "mens-fashion": ["Black", "Navy", "Beige"],
  beauty: undefined,
  "home-living": ["Natural", "Terracotta", "Charcoal"],
  "kids-baby": ["Multi", "Pink", "Blue"],
  "sports-outdoor": ["Black", "Teal", "Orange"],
  groceries: undefined,
};

const SIZES: Record<string, string[] | undefined> = {
  "womens-fashion": ["S", "M", "L", "XL"],
  "mens-fashion": ["S", "M", "L", "XL", "XXL"],
  "sports-outdoor": ["S", "M", "L"],
};

/** Input shape for the product factory below. */
interface Seed {
  slug: string;
  name: string;
  store: string;
  category: string;
  price: number;
  was?: number;
  icon: string;
  hue: keyof typeof HUES;
  rating: number;
  reviews: number;
  sold: number;
  stock: number;
  isNew?: boolean;
  desc: string;
}

/** Factory that fills in derived fields so each entry below stays short. */
function P(s: Seed): Product {
  return {
    id: s.slug,
    slug: s.slug,
    name: s.name,
    store: s.store,
    category: s.category,
    price: s.price,
    compareAt: s.was,
    icon: s.icon,
    art: HUES[s.hue],
    rating: s.rating,
    reviewCount: s.reviews,
    sold: s.sold,
    stock: s.stock,
    badge: s.isNew ? "New" : s.was ? "Sale" : s.sold >= 1500 ? "Bestseller" : undefined,
    colors: COLORS[s.category],
    sizes: SIZES[s.category],
    description: s.desc,
    features: FEATURES[s.category],
  };
}

export const products: Product[] = [
  // ── Hodan Electronics ──────────────────────────────────────────────
  P({ slug: "aurapods-pro", name: "AuraPods Pro Wireless Earbuds", store: "hodan-electronics", category: "electronics", price: 49, was: 79, icon: "🎧", hue: "sky", rating: 4.8, reviews: 412, sold: 2300, stock: 46, desc: "Active noise-cancelling earbuds with 32-hour total battery, wireless charging case, touch controls and crystal-clear call quality — your daily soundtrack, uninterrupted." }),
  P({ slug: "nebula-x5", name: "Nebula X5 Smartphone 128GB", store: "hodan-electronics", category: "electronics", price: 299, was: 349, icon: "📱", hue: "slate", rating: 4.7, reviews: 268, sold: 940, stock: 22, desc: "6.6\" AMOLED display, 50MP triple camera, 5000mAh all-day battery and dual SIM. Flagship feel without the flagship price." }),
  P({ slug: "voltmax-powerbank", name: "VoltMax 20,000mAh Power Bank", store: "hodan-electronics", category: "electronics", price: 25, was: 35, icon: "🔋", hue: "teal", rating: 4.6, reviews: 530, sold: 3100, stock: 120, desc: "Charge your phone four times over. 22.5W fast charging, dual USB + USB-C ports, and an LED display that shows exactly how much power is left." }),
  P({ slug: "crystalview-tv-55", name: "CrystalView 55\" 4K Smart TV", store: "hodan-electronics", category: "electronics", price: 429, icon: "📺", hue: "violet", rating: 4.5, reviews: 96, sold: 210, stock: 8, desc: "Cinema at home: 4K HDR panel, built-in streaming apps, Bluetooth audio and a slim bezel-less design that looks great even when it's off." }),
  P({ slug: "turbocharge-65w", name: "TurboCharge 65W GaN Charger", store: "hodan-electronics", category: "electronics", price: 19, icon: "⚡", hue: "amber", rating: 4.7, reviews: 342, sold: 1800, stock: 200, isNew: true, desc: "Pocket-sized GaN charger that powers a laptop, tablet and phone at once. Two USB-C ports, one USB-A, zero waiting around." }),

  // ── Sahra Fashion House ────────────────────────────────────────────
  P({ slug: "amal-maxi-dress", name: "Amal Chiffon Maxi Dress", store: "sahra-fashion", category: "womens-fashion", price: 39, was: 59, icon: "👗", hue: "rose", rating: 4.9, reviews: 621, sold: 2700, stock: 34, desc: "Floaty double-layer chiffon with a flattering waistline and full-length modest cut. Elegant enough for aroos, comfortable enough for every day." }),
  P({ slug: "zahra-abaya", name: "Zahra Embroidered Abaya", store: "sahra-fashion", category: "womens-fashion", price: 65, icon: "✨", hue: "violet", rating: 4.9, reviews: 488, sold: 1900, stock: 18, desc: "Hand-finished gold embroidery on premium nida fabric. Includes matching shayla. A statement piece for Eid and special occasions." }),
  P({ slug: "layla-hijab-set", name: "Layla Silk Hijab Set (3-Pack)", store: "sahra-fashion", category: "womens-fashion", price: 22, icon: "🧣", hue: "peach", rating: 4.8, reviews: 743, sold: 4200, stock: 90, desc: "Three luxuriously soft silk-blend hijabs in coordinated tones. Breathable, opaque, and they stay in place all day." }),
  P({ slug: "malika-tote", name: "Malika Leather Tote Bag", store: "sahra-fashion", category: "womens-fashion", price: 45, was: 60, icon: "👜", hue: "amber", rating: 4.7, reviews: 219, sold: 860, stock: 25, desc: "Genuine leather tote with laptop sleeve, zip pocket and magnetic clasp. Carries your whole day in style." }),
  P({ slug: "noor-heel-sandals", name: "Noor Pearl Heel Sandals", store: "sahra-fashion", category: "womens-fashion", price: 34, icon: "👠", hue: "rose", rating: 4.6, reviews: 187, sold: 640, stock: 40, isNew: true, desc: "Pearl-strap sandals with a comfortable 6cm block heel and cushioned sole. Dance all night, no regrets in the morning." }),

  // ── Deeq Style ─────────────────────────────────────────────────────
  P({ slug: "sultan-blazer", name: "Sultan Slim-Fit Blazer", store: "deeq-style", category: "mens-fashion", price: 79, was: 110, icon: "🧥", hue: "slate", rating: 4.8, reviews: 156, sold: 480, stock: 15, desc: "Tailored slim-fit blazer in wrinkle-resistant stretch fabric. From boardroom to wedding hall without missing a step." }),
  P({ slug: "oxford-shirt-2pack", name: "Classic Oxford Shirt (2-Pack)", store: "deeq-style", category: "mens-fashion", price: 29, icon: "👔", hue: "sky", rating: 4.7, reviews: 328, sold: 1600, stock: 75, desc: "Two crisp oxford shirts — one white, one blue. Breathable cotton blend, smart collar, easy iron. The uniform of getting things done." }),
  P({ slug: "koofiyad-heritage", name: "Koofiyad Heritage Cap", store: "deeq-style", category: "mens-fashion", price: 12, icon: "🧢", hue: "teal", rating: 4.9, reviews: 412, sold: 2900, stock: 150, desc: "Traditional hand-stitched koofiyad in classic patterns. Lightweight, breathable and made by local artisans." }),
  P({ slug: "urban-flex-chinos", name: "Urban Flex Chinos", store: "deeq-style", category: "mens-fashion", price: 27, icon: "👖", hue: "peach", rating: 4.5, reviews: 203, sold: 890, stock: 60, desc: "Stretch-cotton chinos with a modern tapered cut. Dress them up or down — they keep their shape either way." }),
  P({ slug: "sahel-loafers", name: "Sahel Leather Loafers", store: "deeq-style", category: "mens-fashion", price: 49, was: 65, icon: "👞", hue: "amber", rating: 4.6, reviews: 141, sold: 520, stock: 28, desc: "Hand-finished leather loafers with cushioned insoles and flexible rubber soles. Sharp with a suit, effortless with jeans." }),

  // ── Nuura Beauty ───────────────────────────────────────────────────
  P({ slug: "qasil-honey-mask", name: "Qasil & Honey Face Mask", store: "nuura-beauty", category: "beauty", price: 14, icon: "🍯", hue: "amber", rating: 4.9, reviews: 892, sold: 5100, stock: 200, desc: "The Somali beauty secret: pure ground qasil leaves blended with raw honey. Deep-cleans, brightens and softens — nature's glow filter." }),
  P({ slug: "uunsi-incense-set", name: "Uunsi Luxury Incense Set", store: "nuura-beauty", category: "beauty", price: 18, icon: "🕯️", hue: "peach", rating: 4.8, reviews: 456, sold: 2400, stock: 85, desc: "Traditional uunsi with oud, rose and musk notes, plus a ceramic dabqaad burner. Fill your home with the scent of celebration." }),
  P({ slug: "rose-glow-serum", name: "Rose Glow Vitamin C Serum", store: "nuura-beauty", category: "beauty", price: 21, was: 28, icon: "🌹", hue: "rose", rating: 4.7, reviews: 334, sold: 1400, stock: 64, desc: "Lightweight vitamin C serum with rosehip oil. Fades dark spots, evens tone and layers perfectly under sunscreen." }),
  P({ slug: "velvet-lipstick-trio", name: "Velvet Matte Lipstick Trio", store: "nuura-beauty", category: "beauty", price: 16, icon: "💄", hue: "rose", rating: 4.6, reviews: 278, sold: 1100, stock: 92, isNew: true, desc: "Three long-wear matte shades — nude, berry and classic red. Weightless velvet finish that survives shaah and samosas." }),
  P({ slug: "argan-hair-oil", name: "Argan Silk Hair Oil", store: "nuura-beauty", category: "beauty", price: 13, icon: "🧴", hue: "teal", rating: 4.8, reviews: 512, sold: 2800, stock: 110, desc: "Cold-pressed argan oil that tames frizz, seals split ends and adds mirror shine — without weighing your hair down." }),

  // ── Guri Living ────────────────────────────────────────────────────
  P({ slug: "nomad-woven-rug", name: "Nomad Woven Rug 160×230", store: "guri-living", category: "home-living", price: 89, was: 120, icon: "🧶", hue: "peach", rating: 4.7, reviews: 164, sold: 380, stock: 12, desc: "Hand-woven rug inspired by traditional Somali patterns. Soft underfoot, durable weave, and instantly makes any room feel like home." }),
  P({ slug: "dalmar-dinner-set", name: "Dalmar Ceramic Dinner Set (24pc)", store: "guri-living", category: "home-living", price: 54, icon: "🍽️", hue: "sky", rating: 4.6, reviews: 98, sold: 290, stock: 20, desc: "Service for six: plates, bowls and mugs in an elegant coastal glaze. Dishwasher safe and ready for your biggest family lunch." }),
  P({ slug: "cloud-duvet-set", name: "Cloud Comfort Duvet Set", store: "guri-living", category: "home-living", price: 39, icon: "🛏️", hue: "violet", rating: 4.8, reviews: 231, sold: 760, stock: 45, desc: "Hotel-soft microfibre duvet with two pillowcases. Breathable for warm nights, cosy when the rains come." }),
  P({ slug: "mocha-coffee-set", name: "Mocha Pour-Over Coffee Set", store: "guri-living", category: "home-living", price: 28, icon: "☕", hue: "amber", rating: 4.7, reviews: 143, sold: 510, stock: 35, isNew: true, desc: "Everything for the perfect cup: glass carafe, stainless filter and two double-walled cups. Bun ceremony, upgraded." }),
  P({ slug: "lantern-floor-lamp", name: "Lantern Glow Floor Lamp", store: "guri-living", category: "home-living", price: 35, was: 49, icon: "💡", hue: "amber", rating: 4.5, reviews: 87, sold: 240, stock: 18, desc: "Warm dimmable glow in a woven lantern shade. The corner light your living room has been waiting for." }),

  // ── Caruur Kids ────────────────────────────────────────────────────
  P({ slug: "plush-camel", name: "Dhurwaa Plush Camel 40cm", store: "caruur-kids", category: "kids-baby", price: 15, icon: "🐪", hue: "peach", rating: 4.9, reviews: 367, sold: 1700, stock: 88, desc: "The softest geel in the market. Huggable, washable and guaranteed to become the most important member of the family." }),
  P({ slug: "explorer-blocks", name: "Little Explorer Blocks (120pc)", store: "caruur-kids", category: "kids-baby", price: 24, was: 32, icon: "🧩", hue: "lime", rating: 4.8, reviews: 289, sold: 1300, stock: 54, desc: "120 colourful building blocks in a storage tub. Builds towers, castles and fine motor skills — screen-free fun for ages 3+." }),
  P({ slug: "rainbow-scooter", name: "Rainbow Glide Scooter (3–8 yrs)", store: "caruur-kids", category: "kids-baby", price: 45, icon: "🛴", hue: "sky", rating: 4.7, reviews: 178, sold: 620, stock: 26, desc: "Three-wheel scooter with light-up wheels, adjustable handlebar and lean-to-steer safety design. Playground superstar status included." }),
  P({ slug: "somali-alphabet-board", name: "Somali Alphabet Learning Board", store: "caruur-kids", category: "kids-baby", price: 19, icon: "🔤", hue: "lime", rating: 4.9, reviews: 421, sold: 2100, stock: 70, isNew: true, desc: "Wooden tracing board teaching the Somali alphabet with pictures and words. Learning Af-Soomaali starts with play." }),
  P({ slug: "baby-cloud-stroller", name: "Baby Cloud Stroller", store: "caruur-kids", category: "kids-baby", price: 95, was: 130, icon: "🍼", hue: "rose", rating: 4.6, reviews: 134, sold: 310, stock: 14, desc: "One-hand fold, five-point harness, reclining seat and a big sun canopy. Smooth ride for baby, easy life for you." }),

  // ── Banaadir Sports ────────────────────────────────────────────────
  P({ slug: "ocean-pro-football", name: "Ocean Pro Football (Size 5)", store: "banaadir-sports", category: "sports-outdoor", price: 17, icon: "⚽", hue: "lime", rating: 4.7, reviews: 246, sold: 1900, stock: 95, desc: "Match-quality stitched football that holds its shape on sand, street or stadium. The only excuse left is your first touch." }),
  P({ slug: "flexfit-yoga-mat", name: "FlexFit Yoga Mat 8mm", store: "banaadir-sports", category: "sports-outdoor", price: 19, icon: "🧘", hue: "teal", rating: 4.6, reviews: 188, sold: 840, stock: 60, desc: "Extra-thick non-slip mat with alignment lines and carry strap. Comfortable for yoga, stretching and floor workouts." }),
  P({ slug: "powergrip-dumbbells", name: "PowerGrip Dumbbell Set 20kg", store: "banaadir-sports", category: "sports-outdoor", price: 59, was: 75, icon: "🏋️", hue: "slate", rating: 4.8, reviews: 132, sold: 410, stock: 22, desc: "Adjustable cast-iron set: two bars, ergonomic grips and plates from 1–5kg. A full home gym in one box." }),
  P({ slug: "marathon-runner-shoes", name: "Marathon Runner Shoes", store: "banaadir-sports", category: "sports-outdoor", price: 42, icon: "👟", hue: "sky", rating: 4.7, reviews: 297, sold: 1150, stock: 48, isNew: true, desc: "Featherlight mesh runners with responsive foam soles. Made for morning runs along Liido and everything after." }),
  P({ slug: "reef-snorkel-kit", name: "Reef Snorkel & Fins Kit", store: "banaadir-sports", category: "sports-outdoor", price: 29, icon: "🤿", hue: "teal", rating: 4.5, reviews: 104, sold: 380, stock: 30, desc: "Anti-fog mask, dry-top snorkel and adjustable fins in a mesh bag. The Indian Ocean is right there — go meet it." }),

  // ── Xamar Fresh Market ─────────────────────────────────────────────
  P({ slug: "shaah-spice-blend", name: "Somali Shaah Spice Blend 250g", store: "xamar-fresh", category: "groceries", price: 6, icon: "🫖", hue: "amber", rating: 4.9, reviews: 654, sold: 4800, stock: 300, desc: "Cardamom, cinnamon, clove and ginger — perfectly balanced for authentic shaah cadays. One spoon and the whole house smells right." }),
  P({ slug: "basmati-rice-5kg", name: "Premium Basmati Rice 5kg", store: "xamar-fresh", category: "groceries", price: 11, icon: "🍚", hue: "peach", rating: 4.7, reviews: 388, sold: 2600, stock: 180, desc: "Extra-long grain aged basmati that cooks up fluffy and separate. Bariis iskukaris worthy of a Friday lunch." }),
  P({ slug: "sesame-oil-1l", name: "Cold-Pressed Sesame Oil 1L", store: "xamar-fresh", category: "groceries", price: 9, was: 12, icon: "🫙", hue: "lime", rating: 4.8, reviews: 276, sold: 1500, stock: 140, desc: "Pure macsaro sesame oil, cold-pressed the traditional way. Rich, nutty and perfect for cooking or hair care." }),
  P({ slug: "sukkari-dates-1kg", name: "Sukkari Dates Gift Box 1kg", store: "xamar-fresh", category: "groceries", price: 13, icon: "🌴", hue: "amber", rating: 4.9, reviews: 512, sold: 3400, stock: 160, desc: "Soft, caramel-sweet Sukkari dates in an elegant gift box. For Ramadan tables, guests, or honestly just yourself." }),
  P({ slug: "xawaash-mix-200g", name: "Xawaash Spice Mix 200g", store: "xamar-fresh", category: "groceries", price: 5, icon: "🧂", hue: "peach", rating: 4.8, reviews: 430, sold: 2900, stock: 250, isNew: true, desc: "The essential Somali spice mix — cumin, coriander, turmeric and secrets. The difference between food and hooyo's food." }),

  // ── AC&Co | Altınyıldız Classics (official brand) ──────────────────
  P({ slug: "acco-slim-fit-suit", name: "Slim Fit Wool-Blend Suit", store: "altinyildiz-classics", category: "mens-fashion", price: 189, was: 260, icon: "🤵", hue: "slate", rating: 4.8, reviews: 342, sold: 780, stock: 24, desc: "Two-piece slim fit suit in a breathable wool-blend fabric with a modern notch lapel. Tailored in Turkey with AC&Co's signature clean silhouette — ready for weddings, interviews and everything in between." }),
  P({ slug: "acco-non-iron-shirt", name: "Slim Fit Non-Iron Poplin Shirt", store: "altinyildiz-classics", category: "mens-fashion", price: 34, icon: "👔", hue: "sky", rating: 4.7, reviews: 518, sold: 2100, stock: 85, desc: "Crisp cotton poplin shirt with a wrinkle-resistant non-iron finish. Slim cut, classic collar, and it comes out of the wash looking pressed — the busy man's best friend." }),
  P({ slug: "acco-polo-tshirt", name: "Regular Fit Polo Collar T-Shirt", store: "altinyildiz-classics", category: "mens-fashion", price: 24, was: 32, icon: "👕", hue: "teal", rating: 4.6, reviews: 407, sold: 1650, stock: 110, desc: "Soft combed-cotton polo with a structured collar and subtle embroidered logo. Smart enough for the office, comfortable enough for the weekend." }),
  P({ slug: "acco-chino-trousers", name: "Slim Fit Stretch Chino Trousers", store: "altinyildiz-classics", category: "mens-fashion", price: 39, icon: "👖", hue: "peach", rating: 4.7, reviews: 289, sold: 1240, stock: 70, desc: "Side-pocket chinos in stretch cotton gabardine that keep their crease all day. A wardrobe staple in AC&Co's precise Turkish tailoring." }),
  P({ slug: "acco-wool-overcoat", name: "Wool Blend Overcoat", store: "altinyildiz-classics", category: "mens-fashion", price: 129, was: 170, icon: "🧥", hue: "slate", rating: 4.8, reviews: 156, sold: 420, stock: 18, desc: "Knee-length overcoat in a warm wool blend with a concealed button placket. The finishing layer that turns an outfit into a presence." }),
  P({ slug: "acco-tie-set", name: "Tie & Pocket Square Gift Set", store: "altinyildiz-classics", category: "mens-fashion", price: 19, icon: "🪢", hue: "amber", rating: 4.6, reviews: 198, sold: 890, stock: 95, isNew: true, desc: "Silk-touch woven tie with a matching pocket square in a gift box. The easiest way to sharpen a suit — or to make someone's Eid." }),

  // ── Karaca (official brand) ────────────────────────────────────────
  P({ slug: "karaca-hatir-mod", name: "Hatır Mod Turkish Coffee Machine", store: "karaca-home", category: "home-living", price: 89, was: 115, icon: "☕", hue: "amber", rating: 4.9, reviews: 1240, sold: 3200, stock: 42, desc: "Karaca's iconic Hatır brews authentic Turkish coffee with rich foam at the touch of a button — up to 5 cups at once, with overflow protection and a self-cleaning function." }),
  P({ slug: "karaca-biogranit-set", name: "Biogranit Pro 7-Piece Cookware Set", store: "karaca-home", category: "home-living", price: 119, was: 150, icon: "🍳", hue: "slate", rating: 4.8, reviews: 876, sold: 1900, stock: 30, desc: "Granite-coated pots and pans with even heat distribution, suitable for all cooktops including induction. Non-stick, scratch-resistant and dishwasher safe — the heart of a busy kitchen." }),
  P({ slug: "karaca-fine-pearl-dinner-set", name: "Fine Pearl 56-Piece Dinner Set", store: "karaca-home", category: "home-living", price: 149, icon: "🍽️", hue: "sky", rating: 4.9, reviews: 654, sold: 1100, stock: 16, desc: "Elegant pearl-finish porcelain service for 12 with gold-line detailing. The set you bring out when guests arrive — and secretly use every day because it's beautiful." }),
  P({ slug: "karaca-caysever-tea-maker", name: "Çaysever Robotea Pro Tea Maker", store: "karaca-home", category: "home-living", price: 79, icon: "🫖", hue: "teal", rating: 4.8, reviews: 720, sold: 1500, stock: 38, desc: "Automatic tea machine that brews and keeps tea at the perfect temperature, with an audible ready alert. Shaah season, fully automated." }),
  P({ slug: "karaca-airpro-cook", name: "Air Pro Cook XL Air Fryer", store: "karaca-home", category: "home-living", price: 99, was: 129, icon: "🍗", hue: "peach", rating: 4.7, reviews: 892, sold: 2400, stock: 45, desc: "7-litre XL air fryer with digital touch controls and 8 preset programs. Crispy sambuus with 90% less oil — your kitchen's new favourite appliance." }),
  P({ slug: "karaca-tea-glass-set", name: "Crystal Tea Glass Set (12-Piece)", store: "karaca-home", category: "home-living", price: 45, icon: "🍵", hue: "lime", rating: 4.7, reviews: 438, sold: 980, stock: 60, isNew: true, desc: "Six crystal-clear tea glasses with matching saucers in classic Turkish form. Thin-walled, heat-resistant and made to make tea time feel special." }),

  // ── Özdilek (official brand) ───────────────────────────────────────
  P({ slug: "ozdilek-towel-set", name: "Turkish Cotton Towel Set (6-Piece)", store: "ozdilek-home", category: "home-living", price: 39, was: 55, icon: "🛁", hue: "sky", rating: 4.9, reviews: 1120, sold: 2800, stock: 75, desc: "550 GSM towels in 100% Turkish cotton from Bursa — two bath, two hand, two face. Absurdly soft, quick-drying and fade-resistant wash after wash." }),
  P({ slug: "ozdilek-bathrobe", name: "Premium Cotton Bathrobe", store: "ozdilek-home", category: "home-living", price: 49, icon: "🧖", hue: "rose", rating: 4.8, reviews: 534, sold: 1300, stock: 40, desc: "Hotel-weight bathrobe in combed Turkish cotton with a shawl collar and deep pockets. From one of the world's top towel makers — spa mornings at home." }),
  P({ slug: "ozdilek-duvet-set", name: "Ranforce Double Duvet Cover Set", store: "ozdilek-home", category: "home-living", price: 59, was: 75, icon: "🛏️", hue: "violet", rating: 4.8, reviews: 687, sold: 1600, stock: 35, desc: "Breathable ranforce cotton duvet set with two pillowcases and a fitted sheet. Cool in the heat, cosy in the rains, beautiful all year." }),
  P({ slug: "ozdilek-pique-blanket", name: "Woven Cotton Pique Blanket", store: "ozdilek-home", category: "home-living", price: 35, icon: "🧶", hue: "peach", rating: 4.7, reviews: 342, sold: 760, stock: 50, desc: "Light woven pique blanket in soft combed cotton — the perfect layer for warm nights and afternoon naps on the barxad." }),
  P({ slug: "ozdilek-pillow-2pack", name: "Luxury Microfibre Pillow (2-Pack)", store: "ozdilek-home", category: "home-living", price: 29, icon: "🪶", hue: "sky", rating: 4.6, reviews: 456, sold: 1150, stock: 80, desc: "Plump, hypoallergenic microfibre pillows that keep their shape night after night. Machine washable and endlessly fluffable." }),
  P({ slug: "ozdilek-beach-towel", name: "Jacquard Beach Towel", store: "ozdilek-home", category: "home-living", price: 19, was: 25, icon: "🏖️", hue: "amber", rating: 4.7, reviews: 289, sold: 920, stock: 90, isNew: true, desc: "Oversized jacquard-woven beach towel in vivid patterns. Sand-shakeable, fast-drying and ready for Liido every Friday." }),

  // ── U.S. Polo Assn. (official brand) ───────────────────────────────
  P({ slug: "uspa-pique-polo", name: "Classic Pique Polo Shirt", store: "us-polo-assn", category: "mens-fashion", price: 29, was: 39, icon: "🐎", hue: "sky", rating: 4.8, reviews: 1450, sold: 4100, stock: 120, desc: "The icon: breathable cotton pique polo with the embroidered double-horsemen logo, ribbed collar and side vents. Available in every colour your week needs." }),
  P({ slug: "uspa-crewneck-sweatshirt", name: "Logo Crewneck Sweatshirt", store: "us-polo-assn", category: "mens-fashion", price: 39, icon: "👕", hue: "slate", rating: 4.7, reviews: 678, sold: 1800, stock: 65, desc: "Brushed-fleece crewneck with a bold chest logo. Soft inside, sharp outside — made for cool evenings and long flights." }),
  P({ slug: "uspa-stretch-jeans", name: "Slim Fit Stretch Jeans", store: "us-polo-assn", category: "mens-fashion", price: 45, was: 60, icon: "👖", hue: "sky", rating: 4.6, reviews: 534, sold: 1450, stock: 55, desc: "Five-pocket slim jeans in comfort-stretch denim that moves with you. Classic mid-blue wash that pairs with literally everything." }),
  P({ slug: "uspa-canvas-sneakers", name: "Heritage Canvas Sneakers", store: "us-polo-assn", category: "mens-fashion", price: 49, icon: "👟", hue: "teal", rating: 4.7, reviews: 812, sold: 2200, stock: 48, desc: "Clean low-top canvas sneakers with a cushioned insole and vulcanised sole. The easy answer to 'what shoes?' every single morning." }),
  P({ slug: "uspa-polo-dress", name: "Women's Slim Polo Dress", store: "us-polo-assn", category: "womens-fashion", price: 42, icon: "👗", hue: "rose", rating: 4.7, reviews: 398, sold: 980, stock: 42, isNew: true, desc: "Sporty-elegant knee-length polo dress in stretch pique with the signature logo. Effortless from campus to café." }),
  P({ slug: "uspa-crossbody-bag", name: "Crossbody Logo Bag", store: "us-polo-assn", category: "womens-fashion", price: 35, was: 45, icon: "👜", hue: "peach", rating: 4.6, reviews: 287, sold: 760, stock: 58, desc: "Compact crossbody in durable coated canvas with an adjustable strap and zip pockets. Carries phone, purse and confidence." }),
  P({ slug: "uspa-baseball-cap", name: "Logo Baseball Cap", store: "us-polo-assn", category: "mens-fashion", price: 17, icon: "🧢", hue: "lime", rating: 4.8, reviews: 645, sold: 2600, stock: 130, desc: "Six-panel cotton twill cap with an embroidered double-horsemen logo and adjustable strap. Sun protection, brand included." }),
];
