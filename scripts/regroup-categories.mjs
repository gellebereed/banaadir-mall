/**
 * ─────────────────────────────────────────────────────────────────────────
 *  REGROUP THE CATALOGUE — repair misfiled categories, and add the middle
 *  level a real shop's navigation needs.
 * ─────────────────────────────────────────────────────────────────────────
 *   node scripts/regroup-categories.mjs            # show the plan
 *   node scripts/regroup-categories.mjs --apply    # carry it out
 *
 * ── Two problems, one fix ────────────────────────────────────────────────
 * 1. The import wizard's parent category defaulted to "mens-fashion", so a
 *    kitchenware import filed 102 categories — Cake Pans, Duvet Covers,
 *    Toasters — as children of Men's Fashion.
 *
 * 2. Even correctly filed, they would have been 102 flat siblings under one
 *    department. That is what makes a menu look amateur next to Karaca's:
 *    not the styling, the SHAPE. Karaca has three levels — department, then
 *    a named group, then the leaf — so a panel is a handful of readable
 *    columns instead of one scrolling wall.
 *
 * So this moves each leaf to the department it belongs to AND puts it under
 * a group inside that department. The groups below are ordinary categories
 * with a parent, nothing special — the menu simply renders whatever depth
 * it finds.
 *
 * Idempotent: run it twice and the second run reports nothing to do.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const APPLY = process.argv.includes("--apply");
const root = process.cwd();

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const envPath = join(root, ".env.local");
if ((!url || !serviceKey) && existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("#") || !t.includes("=")) continue;
    const k = t.slice(0, t.indexOf("=")).trim();
    const v = t.slice(t.indexOf("=") + 1).trim();
    if (k === "NEXT_PUBLIC_SUPABASE_URL" && !url) url = v;
    if (k === "SUPABASE_SERVICE_ROLE_KEY" && !serviceKey) serviceKey = v;
  }
}
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};
const api = (path, init) => fetch(`${url}/rest/v1/${path}`, { ...init, headers });

/**
 * The taxonomy.
 *
 * department → group → the leaves that belong in it. Only leaves that
 * actually exist are touched; unknown ones are reported at the end rather
 * than being moved somewhere arbitrary.
 */
const TAXONOMY = {
  "home-living": {
    tableware: {
      name: "Tableware",
      icon: "🍽️",
      children: [
        "dinnerware-sets", "dinnerware-collections", "dinner-plates", "dessert-plates",
        "soup-plates", "oval-plates", "decorative-plates", "serving-sets",
        "breakfast-sets", "breakfast-servings", "cake-set-dws", "flatware-collections",
        "cutlery-pieces", "place-mats", "tablecloths", "tableware-accessories",
        "trays", "decorative-trays", "salt-and-pepper-shakers", "snack-bowls", "bakers",
      ],
    },
    drinkware: {
      name: "Drinkware",
      icon: "🫖",
      children: [
        "coffee-cups", "teacups", "tea-sets", "tea-pot-bevs", "mugs", "set-of-glass",
        "stemwares", "decanters", "thermos", "vacuum-flasks",
        "coffee-and-arabic-accessories", "hot-pot-sets", "smart-coffee-pots",
      ],
    },
    cookware: {
      name: "Cookware",
      icon: "🍳",
      children: [
        "cookware-sets", "pots", "pans", "fry-pans", "casseroles-and-pots",
        "pressure-cookers", "cake-pans", "knife-sets", "knifes", "cutting-boards",
        "utensils", "kitchen-accessories", "lunch-boxes", "bread-bins",
        "spice-jar-sets", "spice-mills", "buffet-and-catering-equipments",
      ],
    },
    "kitchen-appliances": {
      name: "Kitchen Appliances",
      icon: "⚙️",
      children: [
        "blenders", "hand-blenders", "hand-mixers", "mixers", "choppers",
        "citrus-press", "coffee-makers", "tea-makers", "kettles", "toasters",
        "waffle-makers", "press-and-grills", "kitchen-appliances-ovens",
        "kitchen-appliances-smalls", "electrical-sets", "vacuum-cleaners",
      ],
    },
    "bed-and-bath": {
      name: "Bed & Bath",
      icon: "🛏️",
      children: [
        "duvet-cover-sets", "duvet-covers", "duvet-cover-set-with-blankets",
        "duvet-cover-set-with-coverlets", "duvet-cover-set-with-piques",
        "pique-sets", "piques", "quilts", "blankets", "coverlets", "comfort-sets",
        "sleep-sets", "mattress-covers", "pillows", "bath-sets", "bath-mats",
        "bathrobes", "bathrobe-sets", "towels", "towel-sets", "textile-dowry-sets",
      ],
    },
    "home-decor": {
      name: "Home Décor",
      icon: "🕯️",
      children: [
        "candles", "candle-holders", "decoratives", "decorative-accents",
        "livingroom-decos", "frames", "trinkets", "carpets",
      ],
    },
  },
  "kids-baby": {
    "baby-home": {
      name: "Baby Home & Bedding",
      icon: "🧸",
      children: ["baby-duvet-cover-sets", "baby-feeding-sets", "baby-piques", "baby-sets"],
    },
  },
  beauty: {
    "beauty-accessories": {
      name: "Beauty Accessories",
      icon: "💄",
      children: ["cosmetics", "accessories-elcs"],
    },
  },
  "mens-fashion": {
    "mens-clothing": {
      name: "Clothing",
      icon: "👔",
      children: [
        "shirts", "short-sleeve-shirts", "t-shirts", "suits", "jackets",
        "trousers", "underwear", "socks",
      ],
    },
    "mens-shoes-accessories": {
      name: "Shoes & Accessories",
      icon: "👞",
      children: ["shoes", "bags", "ties", "bow-ties-and-cummerbunds", "bracelets"],
    },
  },
};

// ── Read the current state ──────────────────────────────────────────────
const existing = await (await api("categories?select=slug,name,parent_slug&limit=5000")).json();
if (!Array.isArray(existing)) {
  console.error("Could not read categories:", existing);
  process.exit(1);
}
const bySlug = new Map(existing.map((c) => [c.slug, c]));

const creates = [];
const moves = [];

for (const [department, groups] of Object.entries(TAXONOMY)) {
  if (!bySlug.has(department)) {
    console.warn(`⚠️  Department "${department}" does not exist — skipping its groups.`);
    continue;
  }

  for (const [groupSlug, group] of Object.entries(groups)) {
    const present = group.children.filter((slug) => bySlug.has(slug));
    if (present.length === 0) continue;

    const current = bySlug.get(groupSlug);
    if (!current) {
      creates.push({
        slug: groupSlug,
        name: group.name,
        icon: group.icon,
        parent_slug: department,
      });
    } else if (current.parent_slug !== department) {
      moves.push({ slug: groupSlug, from: current.parent_slug, to: department });
    }

    for (const slug of present) {
      const leaf = bySlug.get(slug);
      if (leaf.parent_slug !== groupSlug) {
        moves.push({ slug, from: leaf.parent_slug, to: groupSlug, name: leaf.name });
      }
    }
  }
}

// Anything still parked under a department that this taxonomy never names.
const claimed = new Set(
  Object.values(TAXONOMY).flatMap((groups) =>
    Object.values(groups).flatMap((g) => g.children),
  ),
);
const unclaimed = existing.filter(
  (c) => c.parent_slug === "mens-fashion" && !claimed.has(c.slug) && !TAXONOMY["mens-fashion"][c.slug],
);

// ── Report ──────────────────────────────────────────────────────────────
console.log(`\n${creates.length} group${creates.length === 1 ? "" : "s"} to create:`);
for (const c of creates) console.log(`  + ${c.name}  (${c.slug})  under ${c.parent_slug}`);

console.log(`\n${moves.length} categor${moves.length === 1 ? "y" : "ies"} to move:`);
const byTarget = new Map();
for (const m of moves) {
  if (!byTarget.has(m.to)) byTarget.set(m.to, []);
  byTarget.get(m.to).push(m.slug);
}
for (const [to, list] of byTarget) {
  console.log(`  → ${to}: ${list.length} (${list.slice(0, 6).join(", ")}${list.length > 6 ? " …" : ""})`);
}

if (unclaimed.length > 0) {
  console.log(`\n⚠️  ${unclaimed.length} left under mens-fashion, unrecognised — check by hand:`);
  for (const c of unclaimed) console.log(`     ${c.slug}`);
}

if (creates.length === 0 && moves.length === 0) {
  console.log("\n✨ Nothing to do — the tree is already grouped.");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nThis was a dry run. Re-run with --apply to carry it out.");
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────
// Groups first: a leaf cannot point at a parent that does not exist yet —
// and if a group fails to appear, every move into it fails too, so this
// stops rather than printing a hundred identical foreign-key errors.
let created = 0;
for (const group of creates) {
  const res = await api("categories", {
    method: "POST",
    // `categories.id` is a TEXT primary key with no default, so it has to be
    // supplied; the rest of the table follows a "cat-<slug>" convention.
    body: JSON.stringify({ id: `cat-${group.slug}`, ...group, description: "" }),
  });
  if (res.ok) {
    created++;
    console.log(`✅ created ${group.slug}`);
  } else {
    console.error(`❌ could not create ${group.slug}: ${await res.text()}`);
    console.error("\nStopping — moving categories into a group that does not exist cannot work.");
    process.exit(1);
  }
}

let moved = 0;
for (const m of moves) {
  const res = await api(`categories?slug=eq.${encodeURIComponent(m.slug)}`, {
    method: "PATCH",
    body: JSON.stringify({ parent_slug: m.to }),
  });
  if (res.ok) moved++;
  else console.log(`❌ ${m.slug}: ${await res.text()}`);
}

console.log(`\n✨ Done — ${created} groups created, ${moved}/${moves.length} categories moved.`);
