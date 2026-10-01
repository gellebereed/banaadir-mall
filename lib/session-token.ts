/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SIGNED SESSION TOKENS
 * ─────────────────────────────────────────────────────────────────────────
 * The session cookie used to be the session itself, as plain JSON. Anyone
 * could open their browser's dev tools, change `"role":"customer"` to
 * `"role":"admin"`, and the whole control panel was theirs — no password
 * involved. Every check in the app trusted a value the visitor wrote.
 *
 * Now the cookie carries the session PLUS an HMAC-SHA256 signature made
 * with a secret only the server knows:
 *
 *     v1.<base64url(session json)>.<base64url(signature)>
 *
 * Changing one character of the session breaks the signature, and a cookie
 * whose signature does not check out is treated as no session at all. The
 * expiry is inside the signed part too, so an old cookie cannot be kept
 * alive past its week by editing a date.
 *
 * Web Crypto only (no `node:crypto`): the same code runs in middleware,
 * which is an edge function, and on the server.
 *
 * ── The secret ───────────────────────────────────────────────────────────
 * SESSION_SECRET, a long random string set in the hosting environment.
 * Changing it signs everybody out, which is also how to revoke every
 * session at once. If it is missing, the Supabase service-role key — also
 * server-only — is used instead, so a deployment that has that is safe
 * without extra setup. With neither, a fixed development secret is used and
 * an error is logged: that secret is public, so it must never reach a live
 * site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Session } from "./auth";

/** How long a sign-in lasts. The cookie's maxAge uses the same figure. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const VERSION = "v1";
const DEV_SECRET = "banaadir-mall-development-only-session-secret";

let warned = false;

function secret(): string {
  const configured = process.env.SESSION_SECRET || "";
  // The .env.example placeholder is public, so it counts as unset.
  if (configured.length >= 16 && !configured.startsWith("replace-with")) return configured;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (serviceKey && !serviceKey.includes("your-service-role-key")) {
    return `bm-session:${serviceKey}`;
  }

  if (!warned) {
    warned = true;
    console.error(
      "[Session] SESSION_SECRET is not set — sessions are signed with a public development secret. Set SESSION_SECRET before going live.",
    );
  }
  return DEV_SECRET;
}

const encoder = new TextEncoder();
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(): Promise<CryptoKey> {
  const s = secret();
  if (cachedKey?.secret !== s) {
    cachedKey = {
      secret: s,
      key: crypto.subtle.importKey(
        "raw",
        encoder.encode(s),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      ),
    };
  }
  return cachedKey.key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

interface Payload {
  s: Session;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

/** The cookie value for this session. */
export async function signSession(session: Session): Promise<string> {
  const payload: Payload = {
    s: session,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signed = `${VERSION}.${body}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(signed));
  return `${signed}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The session in a cookie value — or null if it is missing, unsigned,
 * tampered with, signed with another secret, or expired.
 */
export async function verifySession(raw: string | undefined | null): Promise<Session | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const signature = fromBase64Url(parts[2]);
  const body = fromBase64Url(parts[1]);
  if (!signature || !body) return null;

  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    signature,
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(body)) as Payload;
    if (!payload?.s?.email || !payload.s.role) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload.s;
  } catch {
    return null;
  }
}
