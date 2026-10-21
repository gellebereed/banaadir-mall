#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STANDARD TAXONOMY — a trimmed copy of Shopify's open product taxonomy.
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run taxonomy            download the pinned release and rebuild
 *   npm run taxonomy -- DIR     rebuild from a local copy of dist/en/
 *                               (categories.txt, categories.json, attributes.json)
 *
 * Writes lib/taxonomy/standard.json (the tree, lib/taxonomy.ts) and
 * lib/taxonomy/attributes.json (filters per category, lib/taxonomy-attributes.ts).
 *
 * ── Why a standard, and why this one ─────────────────────────────────────
 * Every Banaadir category is linked to a node of a published, maintained
 * taxonomy, so "what kind of thing is this?" has one answer however many
 * stores and suppliers join. Shopify's (github.com/Shopify/product-taxonomy)
 * is MIT-licensed, versioned, ~14,600 categories with attributes per
 * category, and maps onto Google's product taxonomy.
 *
 * ── Why trimmed ──────────────────────────────────────────────────────────
 * All of it would be a ~1MB list nobody can scroll. Verticals a Somali
 * marketplace doesn't sell in (vehicles, industrial, software, …) are
 * dropped; the rest is kept to 3 levels, or 4 where the selling happens
 * (fashion, beauty, food, home, electronics, baby, toys, bags, furniture).
 * Deeper detail (size, material, …) belongs in attributes, not categories.
 *
 * Bump RELEASE to adopt a newer version; ids are stable across releases.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "v2026-08-patch";
const BASE = `https://raw.githubusercontent.com/Shopify/product-taxonomy/${RELEASE}/dist/en`;
const SOURCE = `${BASE}/categories.txt`;

const EXCLUDED = new Set([
  "Vehicles & Parts",
  "Business & Industrial",
  "Services",
  "Software",
  "Mature",
  "Product Add-Ons",
  "Gift Cards",
  "Bundles",
  "Uncategorized",
  "Media",
]);

const DEEP = new Set([
  "Apparel & Accessories",
  "Health & Beauty",
  "Food, Beverages & Tobacco",
  "Home & Garden",
  "Electronics",
  "Baby & Toddler",
  "Toys & Games",
  "Luggage & Bags",
  "Furniture",
]);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "lib", "taxonomy", "standard.json");

async function source(file) {
  if (process.argv[2]) return readFileSync(join(process.argv[2], file), "utf8");
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.text();
}

const text = await source("categories.txt");

const nodes = [];
for (const line of text.split("\n")) {
  const m = line.match(/^gid:\/\/shopify\/TaxonomyCategory\/(\S+)\s*:\s*(.+)$/);
  if (!m) continue;
  const [, id, path] = m;
  const parts = path.split(" > ").map((p) => p.trim());
  if (EXCLUDED.has(parts[0])) continue;
  if (parts.length > (DEEP.has(parts[0]) ? 4 : 3)) continue;
  const parent = id.includes("-") ? id.slice(0, id.lastIndexOf("-")) : null;
  nodes.push([id, parts[parts.length - 1], parent]);
}

if (nodes.length < 500) {
  console.error(`Only ${nodes.length} categories parsed — is ${SOURCE} still the right file?`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    source: "Shopify Product Taxonomy",
    url: "https://github.com/Shopify/product-taxonomy",
    release: RELEASE,
    license: "MIT — see lib/taxonomy/LICENSE-shopify-product-taxonomy.txt",
    // [id, name, parentId] — compact, the app derives paths.
    nodes,
  }) + "\n",
);
console.log(`Standard taxonomy ${RELEASE}: ${nodes.length} categories → ${out}`);

// ── Attributes ─────────────────────────────────────────────────────────
// What a shopper can filter a category by (Colour, Fabric, Neckline…), and
// the values each can take. The full set is ~15MB; what's kept:
//   · only attributes of the categories kept above,
//   · at most MAX_PER_CATEGORY per category — a sidebar with 26 groups
//     helps nobody. The order is SHOP_FIRST, then the category's most
//     specific attributes (used by the fewest categories): "Neckline" says
//     more about dresses than "Care instructions" does about anything;
//   · not the reference lists and housekeeping below, which nobody shops by.
// Size and shoe size are kept even though variants carry sizes too: the
// standard values are what make "M" from two stores the same filter.
const MAX_PER_CATEGORY = 8;

/** Must match valueSlug() in lib/taxonomy-attributes.ts. */
function valueSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const SKIP_ATTRIBUTES = new Set([
  "country", "region", "currency", "language", "language-version",
  "video-codecs-formats-supported", "audio-codecs-formats-supported",
  "security-algorithms", "networking-standards", "detailed-ingredients",
  "product-certifications-standards", "contrast-ratio-typical",
  "allergen-information", "size-type",
  "care-instructions", "cleaning-instructions", "power-source", "battery-size",
  "battery-type", "battery-technology", "mounting-type", "storage-requirements",
  "durability-features", "ingress-protection-ip-rating", "subscription-type",
  "cosmetic-condition", "accessory-pieces-included", "accessory-size",
]);
const SHOP_FIRST = [
  "color", "size", "shoe-size", "ring-size", "target-gender", "age-group",
  "operating-system", "fabric", "material", "flavor", "fragrance", "style",
  "pattern",
];

const categoriesJson = JSON.parse(await source("categories.json"));
const attributesJson = JSON.parse(await source("attributes.json"));
const definitions = new Map(attributesJson.attributes.map((a) => [a.handle, a]));
const kept = new Set(nodes.map((n) => n[0]));

const perCategory = new Map();
const usage = new Map();
for (const vertical of categoriesJson.verticals) {
  for (const category of vertical.categories) {
    const id = category.id.split("/").pop();
    if (!kept.has(id)) continue;
    const handles = category.attributes
      .map((a) => a.handle)
      .filter((h) => definitions.has(h) && !SKIP_ATTRIBUTES.has(h) && definitions.get(h).values.length > 0);
    perCategory.set(id, handles);
    for (const h of handles) usage.set(h, (usage.get(h) ?? 0) + 1);
  }
}

const rank = (h) => (SHOP_FIRST.includes(h) ? SHOP_FIRST.indexOf(h) : SHOP_FIRST.length);
const used = new Map(); // handle → index in `attributes`
const attributeList = [];
const byCategory = {};
for (const [id, handles] of perCategory) {
  const chosen = [...handles]
    .sort((a, b) => rank(a) - rank(b) || usage.get(a) - usage.get(b) || a.localeCompare(b))
    .slice(0, MAX_PER_CATEGORY);
  if (chosen.length === 0) continue;
  byCategory[id] = chosen.map((h) => {
    if (!used.has(h)) {
      const def = definitions.get(h);
      used.set(h, attributeList.length);
      // [handle, name, values]. A value's key is the part of Shopify's value
      // handle after "__" (stable across releases); it is nearly always the
      // slugified name, so only the exceptions ("SPF 50+") store it.
      attributeList.push([
        h,
        def.name,
        def.values.map((v) => {
          const key = v.handle.split("__").pop();
          return key === valueSlug(v.name) ? v.name : [key, v.name];
        }),
      ]);
    }
    return used.get(h);
  });
}

const attrOut = join(here, "..", "lib", "taxonomy", "attributes.json");
writeFileSync(
  attrOut,
  JSON.stringify({ release: RELEASE, attributes: attributeList, byCategory }) + "\n",
);
console.log(
  `Attributes: ${attributeList.length} kept, ${attributeList.reduce((n, a) => n + a[2].length, 0)} values → ${attrOut}`,
);
