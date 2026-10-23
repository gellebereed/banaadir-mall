/**
 * POST /api/admin/reco-pins — the push composer's save, admins only.
 *
 * A route rather than a server action on purpose. Called as a server action,
 * the save's response also carried the re-rendered page, and on a freshly
 * loaded page Next.js sometimes never applied it: the push was saved but the
 * button sat on "Pushing…" until a reload. Here the answer is a few bytes of
 * JSON the composer shows at once, and the list refreshes separately.
 */

import { addRecoPin, updateRecoPin } from "@/app/actions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === "admin";
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (session?.role !== "admin") return Response.json({ error: "Only the marketplace admin can push products." }, { status: 403 });

  let body: { productIds?: unknown; shelf?: unknown; note?: unknown; startsAt?: unknown; endsAt?: unknown; position?: unknown };
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
  if (typeof body.position === "number") form.set("position", String(body.position));

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

/** Edit one push: { id, shelf?, position? (null = automatic), note?, startsAt?, endsAt? }. */
export async function PATCH(request: Request): Promise<Response> {
  if (!(await isAdmin())) return Response.json({ error: "Only the marketplace admin can edit pushes." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "That request could not be read. Refresh and try again." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Which push? Refresh and try again." }, { status: 400 });
  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined);
  const result = await updateRecoPin(id, {
    shelf: text("shelf"),
    position: body.position === null ? null : typeof body.position === "number" ? body.position : undefined,
    note: text("note"),
    startsAt: text("startsAt"),
    endsAt: text("endsAt"),
  });
  if (result?.error) return Response.json({ error: result.error }, { status: 422 });
  const { getRecoSettings } = await import("@/lib/api");
  return Response.json({ ok: true, pin: (await getRecoSettings()).pins.find((pin) => pin.id === id) ?? null });
}
