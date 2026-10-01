"use server";

/**
 * Accepting an invitation.
 *
 * The token in the URL is the credential — the same shape as a magic link,
 * and it deserves the same care: it is single-purpose, it identifies
 * exactly one employee row, and the owner can invalidate it at any time by
 * issuing a new one from the Team page.
 */

import { redirect } from "next/navigation";
import { getEmployeeByInviteToken, getStore } from "@/lib/api";
import { homeForRole } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { markInviteAccepted, sessionForEmployee } from "@/lib/employees";

export async function acceptInvite(token: string): Promise<void> {
  const employee = await getEmployeeByInviteToken(token);
  if (!employee) redirect("/invite/expired");

  // A store that was suspended after the invite went out must not be
  // reachable through the invite. The link is older than the decision.
  if (employee.store !== "platform") {
    const store = await getStore(employee.store);
    if (!store || store.status !== "active") redirect("/invite/expired");
  }

  await markInviteAccepted(employee);

  const session = sessionForEmployee(employee);
  await setSessionCookie(session);

  redirect(homeForRole(session.role));
}
