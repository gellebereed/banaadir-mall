import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product photo uploads are sent through server actions, so the default
    // 1 MB request limit is far too small (see lib/uploads.ts).
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Uploaded photos are served from the same origin (/api/uploads/...), so no
  // remotePatterns are needed. If product photos later come from Odoo or a
  // CDN, whitelist that host here:
  // images: { remotePatterns: [{ protocol: "https", hostname: "your-cdn.com" }] },
};

export default nextConfig;
