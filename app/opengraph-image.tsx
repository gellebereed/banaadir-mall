import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "Banaadir Mall — Your next favourite. All in one place. Fashion, electronics, beauty and home.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const dynamic = "force-static";

// A pre-rendered JPEG keeps crawler requests independent of fonts, remote
// artwork and image rendering, and small enough for messaging previews.
export default async function Image() {
  const image = await readFile(path.join(process.cwd(), "public/social/banaadir-mall.jpg"));
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": contentType },
  });
}
