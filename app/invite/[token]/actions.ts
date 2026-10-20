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
import { accountsEnabled, findAuthUser, MIN_PASSWORD_LENGTH } from "@/lib/accounts";
import { getEmployeeByInviteToken, getStore } from "@/lib/api";
import { homeForRole } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { markInviteAccepted, sessionForEmployee } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

export interface AcceptState {
  error?: string;
}

/**
 * ── The link opens the door ONCE, and leaves a password behind ─────────
 * It used to sign the person straight in, every time, with no password —
 * so the link stayed a key to the dashboard forever, and afterwards they
 * could only sign in with the shared "Employee@2026" printed on the page.
 *
 * Now, on a live marketplace:
 *   · no account yet  → they choose a password here, the account is created
 *   · account exists  → they confirm its CURRENT password (an invite must
 *                       never be able to set the password of an existing
 *                       account — that account could be somebody else's)
 * and the link is spent either way (markInviteAccepted clears it).
 */
export async function acceptInvite(
  token: string,
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const employee = await getEmployeeByInviteToken(token);
  if (!employee) redirect("/invite/expired");

  // A store that was suspended after the invite went out must not be
  // reachable through the invite. The link is older than the decision.
  if (employee.store !== "platform") {
    const store = await getStore(employee.store);
    if (!store || store.status !== "active") redirect("/invite/expired");
  }

  if (accountsEnabled()) {
    const password = String(formData.get("password") ?? "");
    const existing = await findAuthUser(employee.email);

    if (existing) {
      const { error } = await (await createClient()).auth.signInWithPassword({
        email: employee.email,
        password,
      });
      if (error) {
        return {
          error: "That isn't the password for this email. Use the password you already sign in with.",
        };
      }
    } else {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return { error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
      }
      if (password !== String(formData.get("confirm") ?? "")) {
        return { error: "The two passwords don't match." };
      }
      const { error } = await getServiceClient().auth.admin.createUser({
        email: employee.email,
        password,
        email_confirm: true,
      });
      if (error) return { error: `Could not create your account: ${error.message}` };
    }
  }

  await markInviteAccepted(employee);

  const session = sessionForEmployee(employee);
  await setSessionCookie(session);

  redirect(homeForRole(session.role));
}
