"use server";

/**
 * Review moderation (lib/review-moderation.ts): shoppers report, the
 * marketplace team decides.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProducts } from "@/lib/api";
import { deleteReview, getReview, REPORTS_TO_HIDE, updateReview } from "@/lib/review-moderation";
import { getSession } from "@/lib/session";
import { scopeFor } from "@/lib/storage-scope";
import { CACHE_TAGS } from "@/lib/supabase/public-client";
import { deleteUpload } from "@/lib/uploads";

export interface ModerationResult {
  ok?: string;
  error?: string;
}

async function refresh(productId?: string) {
  revalidateTag(CACHE_TAGS.reviews);
  revalidatePath("/admin/reviews");
  if (productId) {
    const product = (await getBaseProducts()).find((p) => p.id === productId);
    if (product) revalidatePath(`/product/${product.slug}`);
  }
}

/**
 * A shopper reports a review. Signed-in only, and once per person: an
 * anonymous button would let one person hide any review by clicking three
 * times. The reporter is stored as a hash, not an email.
 */
export async function reportReviewAction(id: string): Promise<ModerationResult> {
  const session = await getSession();
  if (!session) return { error: "Please sign in to report a review." };
  const review = await getReview(String(id));
  if (!review) return { error: "That review no longer exists." };

  const reporter = scopeFor(session.email);
  const reportedBy = [...new Set([...(review.reportedBy ?? []), reporter])];
  if (reportedBy.length === (review.reportedBy?.length ?? 0)) {
    return { ok: "You've already reported this review — thank you." };
  }
  const hide = !review.approved && !review.hidden && reportedBy.length >= REPORTS_TO_HIDE;
  try {
    await updateReview(review.id, { reportedBy, ...(hide ? { hidden: true, hiddenReason: "reports" as const } : {}) });
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (hide) {
    await logActivity("platform", "review.auto-hide", `A review of ${review.productId} was hidden after ${reportedBy.length} reports`, review.id);
  }
  await refresh(review.productId);
  return { ok: "Thanks — the marketplace team will take a look." };
}

async function requireModerator() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function moderateReviewAction(
  id: string,
  decision: "hide" | "restore" | "delete",
): Promise<ModerationResult> {
  if (!(await requireModerator())) return { error: "Only the marketplace team can moderate reviews." };
  const review = await getReview(String(id));
  if (!review) return { error: "That review no longer exists." };
  try {
    if (decision === "hide") {
      await updateReview(review.id, { hidden: true, hiddenReason: "admin" });
    } else if (decision === "restore") {
      // Kept after a look: further reports won't hide it again.
      await updateReview(review.id, { hidden: false, hiddenReason: undefined, approved: true });
    } else {
      await deleteReview(review.id);
      await Promise.all((review.photos ?? []).map(deleteUpload));
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  await logActivity(
    "platform",
    `review.${decision}`,
    `${decision === "hide" ? "Hid" : decision === "restore" ? "Restored" : "Deleted"} ${review.author}'s review of ${review.productId}`,
    review.id,
  );
  await refresh(review.productId);
  return { ok: decision === "hide" ? "Hidden from the shop." : decision === "restore" ? "Back in the shop." : "Deleted." };
}

/** Remove one photo from a review, keeping the words. */
export async function removeReviewPhotoAction(id: string, photo: string): Promise<ModerationResult> {
  if (!(await requireModerator())) return { error: "Only the marketplace team can moderate reviews." };
  const review = await getReview(String(id));
  if (!review?.photos?.includes(photo)) return { error: "That photo is already gone." };
  try {
    await updateReview(review.id, { photos: review.photos.filter((p) => p !== photo) });
    await deleteUpload(photo);
  } catch (err) {
    return { error: (err as Error).message };
  }
  await logActivity("platform", "review.photo-remove", `Removed a photo from ${review.author}'s review of ${review.productId}`, review.id);
  await refresh(review.productId);
  return { ok: "Photo removed." };
}
