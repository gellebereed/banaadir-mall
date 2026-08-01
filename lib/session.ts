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
 * Guard used by every /vendor page: requires a seller (their own store)
 * or an admin (previews "sahra-fashion"). Customers are sent to /sell.
 */
export async function requireVendor(): Promise<{ session: Session; storeSlug: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "customer") redirect("/sell");
  const storeSlug =
    session.role === "seller" && session.store ? session.store : "sahra-fashion";
  return { session, storeSlug };
}
