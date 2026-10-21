import { NextResponse, type NextRequest } from "next/server";
import { cleanEvents, recordEvents } from "@/lib/reco/metrics";

/**
 * Shelf metrics from the browser (lib/reco/metrics-client.ts), in batches.
 * Sent with navigator.sendBeacon so a batch survives the page closing —
 * which means the body arrives as text/plain, parsed here by hand.
 *
 * Anonymous by design: nothing about who sent it is read or stored.
 * Malformed or oversized batches are dropped rather than rejected loudly;
 * a metrics beacon has nobody to show an error to.
 */
export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > 20_000) return new NextResponse(null, { status: 204 });
    await recordEvents(cleanEvents(JSON.parse(text)));
  } catch {
    // Ignore: a lost metrics batch must never surface as an error.
  }
  return new NextResponse(null, { status: 204 });
}
