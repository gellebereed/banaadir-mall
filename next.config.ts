import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product photo uploads are sent through server actions, so the default
    // 1 MB request limit is far too small (see lib/uploads.ts).
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
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
