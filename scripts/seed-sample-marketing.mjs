/**
 * Install the sample banner + campaign tiles into marketing settings.
 *
 *   node scripts/seed-sample-marketing.mjs
 *
 * The artwork itself was generated at the exact frame sizes the storefront
 * renders (see README → "Artwork sizes") and uploaded to Supabase Storage.
 * Existing banners/tiles are kept; anything named sample-* is replaced, so
 * re-running is safe.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const BUCKET_URL =
  "https://xqcclakulmtdnfbuilib.supabase.co/storage/v1/object/public/uploads/marketing";

function loadEnv() {
  const env = { ...process.env };
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key.trim()] ??= rest.join("=").trim();
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const SAMPLE_BANNER = {
  id: "sample-banner-eid",
  // No title/subtitle/cta on purpose: the headline is already in the
  // artwork, so the site renders the image alone with no scrim over it.
  link: "/products?sort=discount",
  image: `${BUCKET_URL}/sample-banner-eid-desktop.jpg`,
  mobileImage: `${BUCKET_URL}/sample-banner-eid-mobile.jpg`,
  from: "#0c2b34",
  to: "#1f6270",
  fit: "cover",
  active: true,
};

const SAMPLE_TILES = [
  { id: "sample-tile-discount", label: "50%", sublabel: "and above discount",
    link: "/products?sort=discount", image: `${BUCKET_URL}/sample-tile-discount.jpg`,
    from: "#ffe4e6", to: "#fecdd3", active: true },
  { id: "sample-tile-bundle", label: "Buy 4 Pay 3", sublabel: "on selected fashion",
    link: "/category/mens-fashion", image: `${BUCKET_URL}/sample-tile-bundle.jpg`,
    from: "#fff8ec", to: "#ffdb9b", active: true },
  { id: "sample-tile-delivery", label: "Free", sublabel: "delivery over $25",
    link: "/products", image: `${BUCKET_URL}/sample-tile-delivery.jpg`,
    from: "#e0f7f7", to: "#b0e4e6", active: true },
  { id: "sample-tile-newin", label: "New In", sublabel: "fresh arrivals weekly",
    link: "/products?sort=new", image: `${BUCKET_URL}/sample-tile-newin.jpg`,
    from: "#ede9fe", to: "#ddd6fe", active: true },
];

const res = await fetch(`${url}/rest/v1/marketing_settings?id=eq.1&select=*`, { headers });
const [current] = await res.json();
if (!current) {
  console.error("No marketing_settings row — run supabase/migration.sql first.");
  process.exit(1);
}

/** Replace by id, keeping everything the admin already created. */
const merge = (existing, additions) => [
  ...(existing ?? []).filter((x) => !additions.some((a) => a.id === x.id)),
  ...additions,
];

const patch = {
  banners: merge(current.banners, [SAMPLE_BANNER]),
  promo_tiles: merge(current.promo_tiles, SAMPLE_TILES),
};

const save = await fetch(`${url}/rest/v1/marketing_settings?id=eq.1`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify(patch),
});

if (!save.ok) {
  console.error("Failed:", save.status, await save.text());
  process.exit(1);
}
const [saved] = await save.json();
console.log(`✅ ${saved.banners.length} banner(s), ${saved.promo_tiles.length} tile(s) installed.`);
console.log("   Open / to see them, or /admin/marketing to edit or remove.");
