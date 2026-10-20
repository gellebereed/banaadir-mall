/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SIGN-IN THROTTLE — slows password guessing down to uselessness.
 * ─────────────────────────────────────────────────────────────────────────
 * There was no limit at all: a script could try passwords against a store
 * owner's login as fast as the server answered.
 *
 * Two counters of FAILED attempts in a sliding window:
 *   · per email + IP  — one person mistyping, or one guesser on one account
 *   · per IP          — one guesser spraying many accounts
 * A success clears the email+IP counter.
 *
 * ── Honest limits ────────────────────────────────────────────────────────
 * The counters live in this server instance's memory. On serverless
 * hosting several instances may be warm at once, and each starts empty, so
 * this is a speed bump, not a wall. Supabase Auth applies its own rate
 * limits behind it; a shared store (Redis / a table) is the upgrade path.
 * ─────────────────────────────────────────────────────────────────────────
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_IP = 30;

const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/** Minutes until another attempt is allowed, or 0 if one is allowed now. */
export function signInBlockedFor(email: string, ip: string): number {
  const now = Date.now();
  const checks: [string, number][] = [
    [`a:${ip}:${email}`, MAX_PER_ACCOUNT],
    [`i:${ip}`, MAX_PER_IP],
  ];
  let wait = 0;
  for (const [key, max] of checks) {
    const hits = recent(key, now);
    if (hits.length >= max) wait = Math.max(wait, hits[0] + WINDOW_MS - now);
  }
  return Math.ceil(wait / 60000);
}

export function recordSignInFailure(email: string, ip: string): void {
  const now = Date.now();
  for (const key of [`a:${ip}:${email}`, `i:${ip}`]) {
    failures.set(key, [...recent(key, now), now]);
  }
  // Keep the map from growing without bound under a spray of junk emails.
  if (failures.size > 10000) {
    for (const key of failures.keys()) {
      if (recent(key, now).length === 0) failures.delete(key);
    }
  }
}

export function recordSignInSuccess(email: string, ip: string): void {
  failures.delete(`a:${ip}:${email}`);
}

/** Best guess at the caller's IP from the proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-nf-client-connection-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
