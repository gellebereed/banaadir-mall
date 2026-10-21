/**
 * Where to send someone after they sign in or sign up — `?next=` — but
 * only to a page on THIS site. A bare "next=https://evil.example" (or
 * "//evil.example", which browsers read as another host) would turn the
 * login page into a launch pad for phishing links.
 *
 * Safe for client and server.
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return undefined;
  if (next.length > 300 || /[\u0000-\u001f]/.test(next)) return undefined;
  // Back to the sign-in forms would be a loop.
  if (/^\/(login|register)(\/|\?|#|$)/.test(next)) return undefined;
  return next;
}

/** "/login?next=…" for the page someone is on now. */
export function loginHref(next: string, page: "/login" | "/register" = "/login"): string {
  const safe = safeNext(next);
  return safe ? `${page}?next=${encodeURIComponent(safe)}` : page;
}
