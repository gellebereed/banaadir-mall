"use server";

/**
 * Server actions for the recommendation engine.
 *
 * The shopper's history is posted from their browser on each call and is
 * used for the length of the request only — nothing is written back, and
 * there is no profile table to leak. See lib/reco/service.ts.
 */

import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { emptyProfile, PROFILE_EVENT_CAP } from "@/lib/reco/profile";
import { recommend } from "@/lib/reco/service";
import type { RecoRequest, RecoResponse, ShopperPreferences } from "@/lib/reco/types";
import type { ProductReview } from "@/lib/types";

/** An empty answer, so callers never have to handle a null. */
const NOTHING: RecoResponse = { shelves: [], confidence: 0 };

/**
 * Recommendations for one surface.
 *
 * The request comes straight from the browser, so it is treated as
 * untrusted input: sizes are capped and shapes are re-validated before any
 * of it reaches the engine. An oversized events array is the obvious way to
 * turn this endpoint into a CPU sink.
 */
export async function getRecommendationsAction(
  request: RecoRequest,
): Promise<RecoResponse> {
  try {
    const session = await getSession();
    const identity = session
      ? {
          /**
           * Only customers are addressed by name. A seller or admin
           * browsing the storefront is previewing it, and their account
           * name is their shop's — "Chosen for you, Karaca" reads as a
           * bug, because it is one.
           */
          firstName:
            session.role === "customer" ? session.name?.trim().split(/\s+/)[0] : undefined,
          email: session.email,
          name: session.name,
        }
      : {};

    return await recommend(sanitise(request), identity);
  } catch {
    // A page must render without recommendations rather than error.
    return NOTHING;
  }
}

function idList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((id): id is string => typeof id === "string")
    .slice(0, 200)
    .map((id) => id.slice(0, 80));
}

/** Hard caps on everything the client controls. */
function sanitise(request: RecoRequest): RecoRequest {
  const profile = request.profile ?? emptyProfile();

  return {
    surface: request.surface,
    seedId: typeof request.seedId === "string" ? request.seedId.slice(0, 80) : undefined,
    subtotal:
      typeof request.subtotal === "number" && Number.isFinite(request.subtotal)
        ? Math.max(0, request.subtotal)
        : undefined,
    cart: (Array.isArray(request.cart) ? request.cart : [])
      .slice(0, 60)
      .filter((line) => typeof line?.productId === "string")
      .map((line) => ({
        productId: line.productId.slice(0, 80),
        qty: Number.isFinite(line.qty) ? Math.max(0, Math.min(999, line.qty)) : 1,
      })),
    wishlist: idList(request.wishlist),
    excludeIds: idList(request.excludeIds),
    profile: {
      v: profile.v,
      updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : 0,
      events: (Array.isArray(profile.events) ? profile.events : [])
        .slice(-PROFILE_EVENT_CAP)
        .filter((event) => event && typeof event.k === "string" && Number.isFinite(event.at)),
      muted: (Array.isArray(profile.muted) ? profile.muted : [])
        .slice(0, 100)
        .filter((id): id is string => typeof id === "string"),
      prefs: sanitisePrefs(profile.prefs),
    },
  };
}

/**
 * The shopper's stated answers, bounded.
 *
 * `promptsSeen` matters as much as the answers: it is what stops a prompt
 * reappearing, so dropping it here would quietly turn every prompt into one
 * that asks again on the next page load.
 */
function sanitisePrefs(prefs: ShopperPreferences | undefined): ShopperPreferences | undefined {
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

// ── Reviews ────────────────────────────────────────────────────────────

export interface ReviewSubmission {
  productId: string;
  orderId?: string;
  rating: number;
  text?: string;
}

/**
 * Store a review left through the rating prompt.
 *
 * ── Two checks, and why each is here ─────────────────────────────────────
 *
 * SIGNED IN. A review is attributed to a person, so it needs one. Without
 * this the endpoint is an anonymous write into the thing shoppers use to
 * decide what to buy.
 *
 * ACTUALLY RECEIVED IT. `verified` is only set when this shopper has a
 * DELIVERED order containing this product. The badge is the whole value of
 * the review system — a "verified" mark handed out on request is worse than
 * no mark at all, because it launders every unverified review beside it.
 *
 * An unverified review is still accepted and still shown. It just does not
 * get to claim something that isn't true.
 */
export async function submitReviewAction(
  submission: ReviewSubmission,
): Promise<{ ok: boolean; verified: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, verified: false, error: "Please sign in to review." };

    const rating = Math.round(Number(submission.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { ok: false, verified: false, error: "Pick a rating from 1 to 5." };
    }

    const productId = String(submission.productId || "").slice(0, 80);
    if (!productId) return { ok: false, verified: false, error: "Unknown product." };

    const { getOrders, getBaseProducts } = await import("@/lib/api");
    const [orders, products] = await Promise.all([getOrders(), getBaseProducts()]);

    if (!products.some((product) => product.id === productId)) {
      return { ok: false, verified: false, error: "Unknown product." };
    }

    const email = session.email.trim().toLowerCase();
    const name = session.name.trim().toLowerCase();
    const verified = orders.some(
      (order) =>
        order.status === "delivered" &&
        (order.email?.trim().toLowerCase() === email ||
          order.customer?.trim().toLowerCase() === name) &&
        (order.items ?? []).some((item) => item.productId === productId),
    );

    const review: ProductReview = {
      // Deterministic per shopper + product, so an edited review replaces
      // the old one instead of stacking a second opinion from one person.
      id: `rv-${hash(`${email}|${productId}`)}`,
      productId,
      author: session.name.trim().split(/\s+/)[0] || "Customer",
      rating,
      text: submission.text?.trim().slice(0, 600) || undefined,
      date: new Date().toISOString().slice(0, 10),
      verified,
      orderId: submission.orderId?.slice(0, 60),
    };

    const { upsertReviewInSupabase } = await import("@/lib/supabase/mutations");
    const wrote = await upsertReviewInSupabase(review);

    if (!wrote) {
      const { mutateDB } = await import("@/lib/db");
      await mutateDB((db) => {
        const existing = (db.reviews ?? []).filter((r) => r.id !== review.id);
        db.reviews = [...existing, review];
      });
    }

    const { CACHE_TAGS } = await import("@/lib/supabase/public-client");
    revalidateTag(CACHE_TAGS.reviews);

    return { ok: true, verified };
  } catch (error) {
    console.error("[reco] submitReview failed:", error);
    return { ok: false, verified: false, error: "Could not save your review." };
  }
}

/** Small stable hash for deriving ids. Not security-sensitive. */
function hash(input: string): string {
  let value = 0;
  for (let i = 0; i < input.length; i++) {
    value = (input.charCodeAt(i) + ((value << 5) - value)) | 0;
  }
  return Math.abs(value).toString(36);
}
