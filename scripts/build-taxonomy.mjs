#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STANDARD TAXONOMY — a trimmed copy of Shopify's open product taxonomy.
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run taxonomy            download the pinned release and rebuild
 *   npm run taxonomy -- FILE    rebuild from a local categories.txt
 *
 * Writes lib/taxonomy/standard.json, which the app reads (lib/taxonomy.ts).
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
const SOURCE = `https://raw.githubusercontent.com/Shopify/product-taxonomy/${RELEASE}/dist/en/categories.txt`;

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

const text = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : await (await fetch(SOURCE)).text();

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
