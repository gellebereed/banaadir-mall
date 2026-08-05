/**
 * Server-side session helper. Import ONLY from server components —
 * client components should read the cookie via lib/auth.ts helpers.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseSession, SESSION_COOKIE, type Session } from "./auth";

/** The signed-in demo user, or null. Makes the calling page dynamic. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  return parseSession(cookieStore.get(SESSION_COOKIE)?.value);
}

/**
 * Guard used by every /vendor page.
 *
 * ── Why the store's STATUS is checked here, not only at sign-in ──────────
 * Rejecting a pending seller at the login screen is necessary but nowhere
 * near sufficient. The session is a cookie that lives for a week, so it
 * survives everything that happens afterwards:
 *
 *   · a seller signs in while active and is suspended an hour later —
 *     their tab keeps full access to the dashboard
 *   · an application is approved, the owner signs in, the admin reverses
 *     the decision — the cookie is still good
 *   · anyone who kept a cookie from before the check existed
 *
 * A login check answers "may you start a session". Only a check on the
 * request answers "may you do this, now", and that is the question every
 * dashboard page is actually asking. So the store is re-read and its status
 * re-tested on every /vendor request.
 *
 * ── And the admin preview fallback ───────────────────────────────────────
 * This used to fall back to the literal slug "sahra-fashion" — a demo store
 * that no longer exists. An admin opening /vendor got a dashboard for a
 * missing store: empty tables, and any save writing products into a
 * phantom. Admins are now sent somewhere real, or told there is nothing to
 * preview yet.
 */
export async function requireVendor(): Promise<{ session: Session; storeSlug: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "customer") redirect("/sell");

  const { getStore, getStores } = await import("./api");

  if (session.role === "admin") {
    // Admins preview the first real active store, if there is one.
    const [first] = await getStores();
    if (!first) redirect("/admin/stores");
    return { session, storeSlug: first.slug };
  }

  if (!session.store) redirect("/sell");

  const store = await getStore(session.store);
  // Deleted, or never approved: there is no dashboard to show.
  if (!store) redirect("/sell?status=missing");
  if (store.status !== "active") redirect(`/sell?status=${store.status}`);

  return { session, storeSlug: store.slug };
}
