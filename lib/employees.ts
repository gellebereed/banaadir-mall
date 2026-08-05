/**
 * ─────────────────────────────────────────────────────────────────────────
 *  EMPLOYEE ACCOUNTS — invitations, sessions, and where they are stored.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Lives outside app/auth-actions.ts because a "use server"
 * module may only export server ACTIONS — every export there becomes a
 * callable endpoint, which is not what a helper wants to be.
 *
 * ── One rule runs through the whole file ─────────────────────────────────
 * An employee row can be in Supabase or in the JSON overlay, and which one
 * depends on whether a write succeeded at the time. So every read consults
 * both (lib/api.ts getAllEmployees) and every write tries Supabase first
 * and falls back. Anything that reads only one of the two produces the bug
 * this file was written to fix: an invitation that saves, and then is not
 * there.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { permissionsFor, type Session } from "./auth";
import { mutateDB } from "./db";
import {
  updateEmployeeInSupabase,
  type EmployeeUpdate,
  type EmployeeWriteResult,
} from "./supabase/mutations";
import type { Employee } from "./types";

/**
 * The session an employee signs in with.
 *
 * Their grants are resolved HERE, not read live on every request — the
 * same trade the rest of this demo cookie makes. The consequence is worth
 * stating plainly: an access change takes effect at their NEXT sign-in.
 * Re-reading the employee row per request is the right answer for a real
 * deployment, and this is the function to change when the cookie goes.
 */
export function sessionForEmployee(employee: Employee): Session {
  const shared = {
    name: employee.name,
    email: employee.email,
    access: employee.role,
    permissions: permissionsFor(employee),
  };

  return employee.store === "platform"
    ? { ...shared, role: "admin" as const }
    : { ...shared, role: "seller" as const, store: employee.store };
}

/**
 * The message to show when a write landed on a database that has not had
 * supabase/migration-employee-permissions.sql applied yet.
 */
export const MIGRATION_REQUIRED =
  "Saved what could be saved — but this database has not had the team " +
  "migration applied, so invitation links and per-person permissions " +
  "cannot be stored yet. Run: npm run migrate";

/** Write a change to whichever store holds this employee. */
export async function saveEmployeeChange(
  employee: Pick<Employee, "id">,
  changes: EmployeeUpdate,
): Promise<EmployeeWriteResult> {
  const remote = await updateEmployeeInSupabase(employee.id, changes);
  if (remote.ok && !remote.droppedColumns) return remote;

  // The JSON overlay has no schema, so it can hold everything. It only
  // helps for employees that actually live there — which is why the
  // Supabase result is returned unchanged when no local row matches.
  let foundLocally = false;
  await mutateDB((db) => {
    const row = db.employees.find((e) => e.id === employee.id);
    if (!row) return;
    foundLocally = true;
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.role !== undefined) row.role = changes.role;
    if (changes.permissions !== undefined) row.permissions = changes.permissions ?? undefined;
    if (changes.status !== undefined) row.status = changes.status;
    if (changes.inviteToken !== undefined) row.inviteToken = changes.inviteToken ?? undefined;
    if (changes.invitedAt !== undefined) row.invitedAt = changes.invitedAt ?? undefined;
    if (changes.acceptedAt !== undefined) row.acceptedAt = changes.acceptedAt ?? undefined;
  });

  if (foundLocally) return { ok: true, droppedColumns: false };
  return remote;
}

/** Flip a pending invitation to active the first time they get in. */
export async function markInviteAccepted(employee: Employee): Promise<void> {
  if (employee.status === "active") return;
  try {
    await saveEmployeeChange(employee, {
      status: "active",
      acceptedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Never fail a valid sign-in over a bookkeeping write.
    console.warn("[Employees] could not mark invite accepted:", err);
  }
}

/**
 * A fresh invite secret.
 *
 * Long and random because it is the only thing standing between a URL and
 * somebody else's dashboard. Rotating it is how an invite is withdrawn:
 * there is no other way to reach a link already sitting in someone's chat.
 */
export function newInviteToken(): string {
  return (
    globalThis.crypto.randomUUID().replace(/-/g, "") +
    globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  );
}
