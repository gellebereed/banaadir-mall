import { removeEmployee, resetInviteLink, updateEmployeeAccess } from "@/app/actions";
import InviteLink from "./InviteLink";
import PermissionPicker from "./PermissionPicker";
import { PERMISSIONS_BY_KEY, permissionsFor } from "@/lib/auth";
import type { Employee, EmployeeRole } from "@/lib/types";

/**
 * One person on the team: where their invitation stands, what they can do,
 * and the controls to change either.
 *
 * The status line is the part that earns its place. An invitation that has
 * been created and an account somebody is actually using look identical
 * from the outside, and telling them apart is the difference between "they
 * haven't got round to it" and "the link never reached them".
 */
export default function TeamMember({
  employee,
  roles,
}: {
  employee: Employee;
  roles: EmployeeRole[];
}) {
  const grants = permissionsFor(employee);
  const pending = employee.status !== "active";
  const seesCosts = grants.includes("costs.view");

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ocean-100 font-display font-extrabold text-ocean-800">
          {employee.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{employee.name}</p>
          <p className="truncate text-xs text-slate-400">{employee.email}</p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            pending
              ? "bg-mango-100 text-mango-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {pending ? "⏳ Invitation pending" : "✅ Active"}
        </span>
        <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold capitalize text-ocean-800">
          {employee.role}
        </span>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {pending
          ? employee.invitedAt
            ? `Invited ${formatDate(employee.invitedAt)} — they have not signed in yet.`
            : "They have not signed in yet."
          : employee.acceptedAt
            ? `First signed in ${formatDate(employee.acceptedAt)}.`
            : "Signed in and using their account."}
      </p>

      {/* What they can do, at a glance — before anyone has to open anything. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {grants.length === 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
            No access yet
          </span>
        )}
        {grants.map((key) => (
          <span
            key={key}
            className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] text-slate-600"
          >
            {PERMISSIONS_BY_KEY[key]?.label ?? key}
          </span>
        ))}
        {!seesCosts && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            🔒 Cannot see cost or profit
          </span>
        )}
      </div>

      {/* The invitation itself. */}
      <div className="mt-4 rounded-2xl bg-sand-50 p-3">
        {employee.inviteToken ? (
          <>
            <p className="mb-2 text-xs font-semibold text-slate-600">
              {pending
                ? "Send them this link to get started:"
                : "Their sign-in link (still valid):"}
            </p>
            <InviteLink token={employee.inviteToken} />
          </>
        ) : (
          <p className="text-xs text-slate-500">
            This person was added before invitation links existed. They can sign
            in with the shared employee password — or create a link for them
            below.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <form action={resetInviteLink.bind(null, employee.id)}>
            <button className="rounded-full border border-ocean-200 px-4 py-1.5 text-xs font-bold text-ocean-800 transition hover:bg-ocean-50">
              {employee.inviteToken ? "Replace link (revokes the old one)" : "Create invite link"}
            </button>
          </form>
          <form action={removeEmployee.bind(null, employee.id)}>
            <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
              Remove from team
            </button>
          </form>
        </div>
      </div>

      {/* Editing access is folded away — most visits are not about this. */}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-bold text-ocean-700 hover:underline">
          <span className="group-open:hidden">⚙️ Change what they can do</span>
          <span className="hidden group-open:inline">✕ Close</span>
        </summary>
        <form action={updateEmployeeAccess.bind(null, employee.id)} className="mt-3">
          <PermissionPicker
            store={employee.store}
            roles={roles}
            initialRole={employee.role}
            initialPermissions={employee.permissions}
            idPrefix={`emp-${employee.id}`}
          />
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Save access
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Changes take effect the next time they sign in.
          </p>
        </form>
      </details>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
