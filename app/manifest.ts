import type { MetadataRoute } from "next";

/**
 * Makes "Add to Home Screen" / "Install app" use the Banaadir Mall bag and
 * name. Without a manifest (and app/apple-icon.png for iPhones) phones drew
 * a plain letter "B" tile instead. The maskable icons keep the bag inside
 * the safe zone Android crops to a circle or squircle.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Banaadir Mall",
    short_name: "Banaadir Mall",
    description: "Somalia's online marketplace — trusted local stores, delivered.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6270",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
