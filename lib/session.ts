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
    // An admin who has picked a store through the switcher stays in it;
    // otherwise they preview the first real active store, if there is one.
    const stores = await getStores();
    const chosen = session.store
      ? stores.find((s) => s.slug === session.store)
      : undefined;
    const target = chosen ?? stores[0];
    if (!target) redirect("/admin/stores");
    return { session, storeSlug: target.slug };
  }

  if (!session.store) redirect("/sell");

  const store = await getStore(session.store);

  /*
   * A multi-store account does not lose everything with one store.
   *
   * Someone on two teams whose ACTIVE shop is suspended used to be bounced
   * to /sell — correct about that shop and wrong about them, because the
   * other one is still open and still theirs to run. So before giving up,
   * fall through to another store they hold. Only when none of them is
   * usable is there genuinely no dashboard to show, and then the message is
   * about the store they were actually in.
   */
  if (!store || store.status !== "active") {
    const others = (session.stores ?? []).filter((slug) => slug !== session.store);
    if (others.length > 0) {
      const open = (await getStores()).find((s) => others.includes(s.slug));
      if (open) {
        // Their grants are per store, so arriving in a different one means
        // arriving with THAT store's access — never with the access they
        // held at the shop that just closed.
        let next: Session = { ...session, store: open.slug };
        if (session.access) {
          const { getEmployeeMemberships } = await import("./api");
          const { sessionForEmployee } = await import("./employees");
          const memberships = await getEmployeeMemberships(session.email);
          const row = memberships.find((m) => m.store === open.slug);
          if (row) next = sessionForEmployee(row, memberships);
        }
        return { session: next, storeSlug: open.slug };
      }
    }
    // Deleted, or never approved: there is no dashboard to show.
    if (!store) redirect("/sell?status=missing");
    redirect(`/sell?status=${store.status}`);
  }

  return { session, storeSlug: store.slug };
}
