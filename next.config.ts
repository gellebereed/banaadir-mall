import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product photo uploads are sent through server actions, so the default
    // 1 MB request limit is far too small (see lib/uploads.ts).
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    /*
     * next/image re-encodes every photo it serves, so a product shot is
     * compressed twice: once in the browser before upload, once here. The
     * default 75 on top of the upload pass is where fine regular texture —
     * pinstripe, herringbone, weave — collapses into mush. 90 is declared
     * so the product page and its zoom can ask for it.
     */
    qualities: [75, 90],
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
