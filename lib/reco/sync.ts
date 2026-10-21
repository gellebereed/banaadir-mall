/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PROFILE SYNC — the one place a taste profile is stored on our side.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Off unless a signed-in shopper turns it on in their account
 * ("Keep my recommendations in sync across devices"). Without it the
 * profile lives only in the browser, as described in RecoProvider.tsx.
 *
 * The row is keyed by the same one-way digest the browser uses to scope
 * storage (lib/storage-scope.ts), never the email, and holds exactly what
 * the browser holds — raw events, mutes and stated answers. Turning sync
 * off deletes the row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { mutateDB, getDB } from "../db";
import { scopeFor } from "../storage-scope";
import { getDataClient } from "../supabase/service";
import { isSupabaseConfigured } from "../supabase/storage";
import { sanitiseProfile } from "./sanitise";
import type { TasteProfile } from "./types";

/** A full profile is ~6 KB; anything far beyond that is not a profile. */
const MAX_BYTES = 48_000;

export async function loadSyncedProfile(email: string): Promise<TasteProfile | null> {
  const account = scopeFor(email);
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient()
      .from("reco_profiles")
      .select("profile")
      .eq("account", account)
      .maybeSingle();
    // Before migration-reco-learning.sql there is no table: sync is off.
    if (error || !data) return null;
    return sanitiseProfile(data.profile as TasteProfile);
  }
  const row = (await getDB()).recoProfiles?.find((r) => r.account === account);
  return row ? sanitiseProfile(row.profile) : null;
}

/**
 * Store the profile. Only `create` (the shopper ticking the box) may start
 * a synced copy; a background save from another device only updates one,
 * and returns false once there is none — so switching sync off on one
 * device switches it off on all of them, instead of the next device to
 * save quietly bringing the copy back.
 */
export async function saveSyncedProfile(
  email: string,
  input: TasteProfile,
  create: boolean,
): Promise<boolean> {
  const profile = sanitiseProfile(input);
  if (JSON.stringify(profile).length > MAX_BYTES) throw new Error("Profile too large to sync.");
  const account = scopeFor(email);
  const updatedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const table = getDataClient().from("reco_profiles");
    const { data, error } = create
      ? await table.upsert({ account, profile, updated_at: updatedAt }).select("account")
      : await table.update({ profile, updated_at: updatedAt }).eq("account", account).select("account");
    if (error) throw new Error("Sync isn't available yet — please try again later.");
    return (data?.length ?? 0) > 0;
  }
  let stored = false;
  await mutateDB((db) => {
    const rows = (db.recoProfiles ?? []).filter((r) => r.account !== account);
    if (!create && rows.length === (db.recoProfiles ?? []).length) return;
    db.recoProfiles = [...rows, { account, profile, updatedAt }];
    stored = true;
  });
  return stored;
}

export async function deleteSyncedProfile(email: string): Promise<void> {
  const account = scopeFor(email);
  if (isSupabaseConfigured()) {
    await getDataClient().from("reco_profiles").delete().eq("account", account);
    return;
  }
  await mutateDB((db) => {
    db.recoProfiles = (db.recoProfiles ?? []).filter((r) => r.account !== account);
  });
}
