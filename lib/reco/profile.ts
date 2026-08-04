/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE TASTE PROFILE — what the shopper's own browser remembers.
 * ─────────────────────────────────────────────────────────────────────────
 * Deliberately the dumbest part of the system. It stores a capped list of
 * raw events — "viewed X at 14:02", "saved Y", "searched 'duvet'" — and
 * nothing else. No weights, no category scores, no derived vectors.
 *
 * Everything interpretive happens on the server (lib/reco/taste.ts) against
 * the live catalogue, for two reasons:
 *
 *   1. The catalogue moves. A profile that had baked "you like Cookware"
 *      into localStorage would keep saying so after the shopper's real
 *      interest — one particular seller's cookware — was delisted. Deriving
 *      taste from product ids at request time can never drift like that.
 *
 *   2. The scoring model will change. Migrating a stored derived vector
 *      across model versions is a chore that ends in everyone's profile
 *      being quietly reset. Raw events survive every re-weighting.
 *
 * This module is imported by client components, so it must not touch
 * anything server-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EventKind, TasteEvent, TasteProfile } from "./types";

export const PROFILE_KEY = "bm-taste";
export const PROFILE_VERSION = 1;

/**
 * How many events a browser keeps. Roughly a month of ordinary shopping,
 * and about 6 KB of JSON — small enough to post on every request.
 */
export const PROFILE_EVENT_CAP = 140;

/** How many go to the server. The oldest add almost nothing after decay. */
export const REQUEST_EVENT_CAP = 90;

/** A shopper can only reject so many things before the list is noise. */
const MUTE_CAP = 80;

/**
 * Two identical events closer together than this are one event. Stops a
 * page that re-mounts (route change, HMR, back button) from counting the
 * same view three times and over-weighting whatever the shopper happened
 * to be looking at when their connection wobbled.
 */
const DEDUPE_MS = 45_000;

export function emptyProfile(): TasteProfile {
  return { v: PROFILE_VERSION, updatedAt: 0, events: [], muted: [] };
}

/** Is there enough here to personalise anything? */
export function hasHistory(profile: TasteProfile): boolean {
  return profile.events.length > 0;
}

/**
 * Append an event, collapsing an immediate repeat of the same kind on the
 * same product. `dwell` is special-cased: a longer dwell replaces a shorter
 * one for the same product rather than adding a second record, so leaving a
 * tab open does not out-weigh actually buying something.
 */
export function record(profile: TasteProfile, event: TasteEvent): TasteProfile {
  const events = [...profile.events];

  for (let i = events.length - 1; i >= 0 && events.length - i <= 8; i--) {
    const previous = events[i];
    if (previous.k !== event.k || previous.id !== event.id) continue;

    if (event.k === "dwell") {
      if ((previous.s ?? 0) >= (event.s ?? 0)) return profile;
      events[i] = { ...previous, at: event.at, s: event.s };
      return { ...profile, events, updatedAt: event.at };
    }

    if (event.at - previous.at < DEDUPE_MS) return profile;
    break;
  }

  events.push(event);
  return {
    ...profile,
    events: events.slice(-PROFILE_EVENT_CAP),
    updatedAt: event.at,
  };
}

/** Convenience wrapper used by the tracking hooks. */
export function makeEvent(
  kind: EventKind,
  payload: { id?: string; seconds?: number; query?: string } = {},
  now = Date.now(),
): TasteEvent {
  const event: TasteEvent = { k: kind, at: now };
  if (payload.id) event.id = payload.id;
  if (payload.seconds !== undefined) event.s = Math.round(payload.seconds);
  if (payload.query) event.q = payload.query.trim().slice(0, 60);
  return event;
}

/**
 * "Not interested." Recorded as an event *and* as a permanent exclusion —
 * the event teaches the model, the exclusion is the promise that the thing
 * goes away immediately. Both matter; only doing the first is how a
 * dismissal control loses the shopper's trust on the very next scroll.
 */
export function mute(profile: TasteProfile, productId: string, now = Date.now()): TasteProfile {
  const next = record(profile, makeEvent("mute", { id: productId }, now));
  const muted = [productId, ...next.muted.filter((id) => id !== productId)].slice(0, MUTE_CAP);
  return { ...next, muted, updatedAt: now };
}

export function unmute(profile: TasteProfile, productId: string): TasteProfile {
  return { ...profile, muted: profile.muted.filter((id) => id !== productId) };
}

/** Forget everything. Wired to the "Reset my recommendations" control. */
export function clearProfile(): TasteProfile {
  return emptyProfile();
}

// ── Storage ────────────────────────────────────────────────────────────

export function readProfile(): TasteProfile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as TasteProfile;
    // A stored profile from an older schema is discarded rather than
    // migrated — it is a month of browsing, not an order history.
    if (!parsed || parsed.v !== PROFILE_VERSION || !Array.isArray(parsed.events)) {
      return emptyProfile();
    }
    return {
      v: PROFILE_VERSION,
      updatedAt: parsed.updatedAt ?? 0,
      events: parsed.events.slice(-PROFILE_EVENT_CAP),
      muted: Array.isArray(parsed.muted) ? parsed.muted.slice(0, MUTE_CAP) : [],
    };
  } catch {
    return emptyProfile();
  }
}

export function writeProfile(profile: TasteProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A full or blocked storage quota must never break browsing.
  }
}

// ── Request shaping ────────────────────────────────────────────────────

/** The slice actually sent to the server. */
export function forRequest(profile: TasteProfile): TasteProfile {
  return {
    v: profile.v,
    updatedAt: profile.updatedAt,
    events: profile.events.slice(-REQUEST_EVENT_CAP),
    muted: profile.muted,
  };
}

/**
 * A cheap fingerprint of everything that could change an answer. Used as
 * the client-side cache key so scrolling back to a page the shopper has
 * already seen does not re-run the engine, while genuinely new behaviour
 * does.
 *
 * Rounded to the minute on purpose: dwell events fire constantly, and a
 * profile that changes identity every second would defeat the cache it
 * exists to key.
 */
export function profileSignature(profile: TasteProfile): string {
  const recent = profile.events.slice(-12).map((e) => `${e.k}:${e.id ?? e.q ?? ""}`);
  return [
    profile.events.length,
    Math.floor(profile.updatedAt / 60_000),
    profile.muted.length,
    recent.join("|"),
  ].join("~");
}

/** Product ids the shopper has looked at, newest first, de-duplicated. */
export function recentlyViewed(profile: TasteProfile, limit = 12): string[] {
  const seen: string[] = [];
  for (let i = profile.events.length - 1; i >= 0; i--) {
    const event = profile.events[i];
    if (event.k !== "view" || !event.id) continue;
    if (seen.includes(event.id)) continue;
    seen.push(event.id);
    if (seen.length >= limit) break;
  }
  return seen;
}
