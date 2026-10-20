import { headers } from "next/headers";

/**
 * This site's origin as the visitor reached it — for links that must come
 * back here (password reset, email confirmation). Behind Netlify the real
 * host arrives in x-forwarded-host.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
