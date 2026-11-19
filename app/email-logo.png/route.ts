/**
 * The logo for the Supabase email templates (supabase/email-templates/),
 * at https://www.banaadirmall.com/email-logo.png.
 *
 * Its own fixed address, so the email templates never depend on where
 * public/ files happen to be served from. Use the www address: the bare
 * banaadirmall.com doesn't reach this site (404, Nov 2026).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const png = await readFile(path.join(process.cwd(), "public/banaadir-logo.png"));
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
