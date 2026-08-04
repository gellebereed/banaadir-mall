"use server";

/**
 * Server actions for the recommendation engine.
 *
 * The shopper's history is posted from their browser on each call and is
 * used for the length of the request only — nothing is written back, and
 * there is no profile table to leak. See lib/reco/service.ts.
 */

import { getSession } from "@/lib/session";
import { emptyProfile, PROFILE_EVENT_CAP } from "@/lib/reco/profile";
import { recommend } from "@/lib/reco/service";
import type { RecoRequest, RecoResponse } from "@/lib/reco/types";

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
    },
  };
}
