import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Read at BUILD time, where Netlify sets CONTEXT (production,
   * deploy-preview, branch-deploy) and URL (the site's primary domain), and
   * baked in for lib/request-origin.ts — the canonical address and whether
   * this deploy may be indexed.
   */
  env: {
    BM_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.CONTEXT === "production" ? process.env.URL ?? "" : ""),
    BM_DEPLOY_CONTEXT: process.env.CONTEXT ?? "",
  },
  experimental: {
    // Product photo uploads are sent through server actions, so the default
    // 1 MB request limit is far too small (see lib/uploads.ts).
    serverActions: { bodySizeLimit: "12mb" },
  },
  // The link-preview cards (lib/og.ts) read these at request time; listed
  // so the serverless bundle includes them.
  outputFileTracingIncludes: {
    "/product/[slug]/opengraph-image": ["./assets/fonts/**", "./public/banaadir-bag.png"],
    "/store/[slug]/opengraph-image": ["./assets/fonts/**", "./public/banaadir-bag.png"],
  },
  images: {
    /*
     * next/image re-encodes every photo it serves, so a product shot is
     * compressed twice: once in the browser before upload, once here. The
     * default 75 on top of the upload pass is where fine regular texture —
     * pinstripe, herringbone, weave — collapses into mush. 90 is declared
     * so the product page and its zoom can ask for it.
     */
    // 40: light data mode (lib/lite.ts).
    qualities: [40, 75, 90],
    // AVIF first: the same photo at roughly half the WebP bytes on the
    // browsers that take it (every current one); WebP for the rest. The
    // encode is slower, but it happens once per size and is then cached.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Official brand logos in the seed catalogue (lib/data/stores.ts) and
        // the pre-migration fallbacks in lib/supabase/db-api.ts point here.
        // Without it `next/image` THROWS rather than degrading, which took
        // down every page that renders a store avatar.
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
};

export default nextConfig;
