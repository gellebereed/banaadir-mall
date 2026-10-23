/**
 * POST /api/admin/reco-pins — the push composer's save, admins only.
 *
 * A route rather than a server action on purpose. Called as a server action,
 * the save's response also carried the re-rendered page, and on a freshly
 * loaded page Next.js sometimes never applied it: the push was saved but the
 * button sat on "Pushing…" until a reload. Here the answer is a few bytes of
 * JSON the composer shows at once, and the list refreshes separately.
 */

import { addRecoPin } from "@/app/actions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Only the marketplace admin can push products." }, { status: 403 });

  let body: { productIds?: unknown; shelf?: unknown; note?: unknown; startsAt?: unknown; endsAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "That request could not be read. Refresh and try again." }, { status: 400 });
  }

  const form = new FormData();
  for (const id of Array.isArray(body.productIds) ? body.productIds : []) form.append("productId", String(id));
  for (const key of ["shelf", "note", "startsAt", "endsAt"] as const) {
    if (typeof body[key] === "string") form.set(key, body[key] as string);
  }

  const result = await addRecoPin(form);
  if (result?.error) return Response.json({ error: result.error }, { status: 422 });

  // The pushes as saved, so the list can show them straight away instead
  // of waiting on the page refresh.
  const ids = new Set(form.getAll("productId").map(String));
  const shelf = String(form.get("shelf") || "auto");
  const { getRecoSettings } = await import("@/lib/api");
  const pins = (await getRecoSettings()).pins.filter((pin) => ids.has(pin.productId) && pin.shelf === shelf);
  return Response.json({ ok: true, count: ids.size, pins });
}
