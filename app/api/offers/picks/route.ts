import { NextResponse, type NextRequest } from "next/server";
import { getOffers } from "@/lib/api";
import { isOfferLive } from "@/lib/offers";
import { picksForOffers } from "@/lib/offer-picks";

/**
 * GET /api/offers/picks?ids=a,b — the products each live offer can be
 * completed with (lib/offer-picks.ts). Asked once per set of shop offers
 * in the basket; the browser prices the candidates itself.
 *
 * Product data only — the same any product page shows — so nothing about a
 * coupon's code leaves the server. Cached briefly at the edge: the same
 * offer is asked about by every basket that contains it.
 */
export async function GET(request: NextRequest) {
  const ids = new Set(
    (request.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 20),
  );
  if (ids.size === 0) return NextResponse.json({});
  const offers = (await getOffers()).filter((o) => ids.has(o.id) && isOfferLive(o));
  return NextResponse.json(await picksForOffers(offers), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
