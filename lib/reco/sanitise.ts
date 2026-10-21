/**
 * Bounds on a taste profile that arrived from a browser.
 *
 * Shared by the recommendations action (the profile is posted with every
 * request) and profile sync (lib/reco/sync.ts, where it is also stored), so
 * both treat it the same way: as untrusted input, capped and re-shaped
 * before it reaches the engine or the database.
 */

import { emptyProfile, PROFILE_EVENT_CAP, PROFILE_VERSION } from "./profile";
import type { ShopperPreferences, TasteEvent, TasteProfile } from "./types";

export function idList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((id): id is string => typeof id === "string")
    .slice(0, 200)
    .map((id) => id.slice(0, 80));
}

function cleanEvent(event: TasteEvent): TasteEvent {
  const out: TasteEvent = { k: event.k.slice(0, 20) as TasteEvent["k"], at: event.at };
  if (typeof event.id === "string") out.id = event.id.slice(0, 80);
  if (typeof event.s === "number" && Number.isFinite(event.s)) out.s = Math.max(0, Math.min(3600, event.s));
  if (typeof event.q === "string") out.q = event.q.slice(0, 60);
  return out;
}

export function sanitiseProfile(input: TasteProfile | undefined | null): TasteProfile {
  const profile = input && typeof input === "object" ? input : emptyProfile();
  return {
    v: Number.isFinite(profile.v) ? profile.v : PROFILE_VERSION,
    updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : 0,
    events: (Array.isArray(profile.events) ? profile.events : [])
      .slice(-PROFILE_EVENT_CAP)
      .filter((event) => event && typeof event.k === "string" && Number.isFinite(event.at))
      .map(cleanEvent),
    muted: (Array.isArray(profile.muted) ? profile.muted : [])
      .slice(0, 100)
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.slice(0, 80)),
    prefs: sanitisePrefs(profile.prefs),
    ...(Number.isFinite(profile.clearedAt) ? { clearedAt: profile.clearedAt } : {}),
  };
}

/**
 * The shopper's stated answers, bounded.
 *
 * `promptsSeen` matters as much as the answers: it is what stops a prompt
 * reappearing, so dropping it here would quietly turn every prompt into one
 * that asks again on the next page load.
 */
export function sanitisePrefs(prefs: ShopperPreferences | undefined): ShopperPreferences | undefined {
  if (!prefs || typeof prefs !== "object") return undefined;

  const seen: Record<string, number> = {};
  for (const [key, value] of Object.entries(prefs.promptsSeen ?? {}).slice(0, 20)) {
    if (typeof value === "number" && Number.isFinite(value)) seen[key.slice(0, 40)] = value;
  }

  return {
    departments: idList(prefs.departments)?.slice(0, 12),
    budget: typeof prefs.budget === "string" ? prefs.budget.slice(0, 40) : undefined,
    answeredAt: Number.isFinite(prefs.answeredAt) ? prefs.answeredAt : undefined,
    promptsSeen: seen,
    promptsDone: idList(prefs.promptsDone)?.slice(0, 40),
    rated: idList(prefs.rated)?.slice(0, 80),
  };
}
