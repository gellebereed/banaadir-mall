/**
 * ─────────────────────────────────────────────────────────────────────────
 *  REVIEW MODERATION — storage. Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 * Reviews go live at once (a queue nobody works through is how review
 * sections die), so the safety net is after the fact:
 *
 *   · any signed-in shopper can report a review, once;
 *   · REPORTS_TO_HIDE different reporters hide it until the admin looks;
 *   · the admin restores it (then it is "approved" and further reports no
 *     longer hide it), hides it, removes single photos, or deletes it.
 *
 * Sellers report like anyone else. They do not get to hide reviews of
 * their own products — that is the one power a review system must not
 * hand to the party being reviewed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getCustomerReviews } from "./api";
import { mutateDB } from "./db";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";
import type { ProductReview } from "./types";

export const REPORTS_TO_HIDE = 3;

export const MODERATION_MIGRATION =
  "Review moderation needs its columns — run supabase/migration-review-moderation.sql in Supabase.";

export async function getReview(id: string): Promise<ProductReview | undefined> {
  return (await getCustomerReviews()).find((r) => r.id === id);
}

/** Change moderation fields (and/or photos) of one review. */
export async function updateReview(
  id: string,
  change: Pick<Partial<ProductReview>, "hidden" | "hiddenReason" | "reportedBy" | "approved" | "photos">,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const row: Record<string, unknown> = {};
    if (change.hidden !== undefined) row.hidden = change.hidden;
    if ("hiddenReason" in change) row.hidden_reason = change.hiddenReason ?? null;
    if (change.reportedBy !== undefined) row.reported_by = change.reportedBy;
    if (change.approved !== undefined) row.approved = change.approved;
    if (change.photos !== undefined) row.photos = change.photos;
    const { data, error } = await getDataClient().from("product_reviews").update(row).eq("id", id).select("id");
    if (error) {
      throw new Error(/column .* does not exist|could not find the .* column/i.test(error.message) ? MODERATION_MIGRATION : error.message);
    }
    if (data && data.length > 0) return;
    // Not in Supabase: a review saved locally before Supabase was set up.
  }
  await mutateDB((db) => {
    db.reviews = (db.reviews ?? []).map((r) => (r.id === id ? { ...r, ...change } : r));
  });
}

export async function deleteReview(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient().from("product_reviews").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  await mutateDB((db) => {
    db.reviews = (db.reviews ?? []).filter((r) => r.id !== id);
  });
}

/** Reviews the admin should look at: hidden by reports, or reported and not yet approved. */
export function needsAttention(review: ProductReview): boolean {
  return (review.hidden && review.hiddenReason === "reports") || (!review.approved && (review.reportedBy?.length ?? 0) > 0);
}
