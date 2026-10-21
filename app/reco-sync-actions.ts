"use server";

/** Opt-in profile sync for signed-in shoppers (lib/reco/sync.ts). */

import { deleteSyncedProfile, loadSyncedProfile, saveSyncedProfile } from "@/lib/reco/sync";
import { getSession } from "@/lib/session";
import type { TasteProfile } from "@/lib/reco/types";

/** The synced copy, or null when this account has not turned sync on. */
export async function getSyncedProfileAction(): Promise<TasteProfile | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    return await loadSyncedProfile(session.email);
  } catch {
    return null;
  }
}

/**
 * `start` is the shopper turning sync on. Without it the save only updates
 * an existing copy, and `stopped` reports that sync was switched off
 * elsewhere.
 */
export async function saveSyncedProfileAction(
  profile: TasteProfile,
  start = false,
): Promise<{ ok?: true; stopped?: true; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Please sign in to sync your recommendations." };
  try {
    const stored = await saveSyncedProfile(session.email, profile, start);
    return stored ? { ok: true } : { stopped: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function stopSyncAction(): Promise<{ ok?: true; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Please sign in first." };
  try {
    await deleteSyncedProfile(session.email);
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
