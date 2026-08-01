import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addEmployee, removeEmployee } from "@/app/actions";
import { getEmployees } from "@/lib/api";
import { can, EMPLOYEE_PASSWORD, ROLE_DESCRIPTIONS } from "@/lib/auth";
import { requireVendor } from "@/lib/session";
import type { EmployeeRole } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };

const STORE_ROLES: EmployeeRole[] = ["manager", "products", "orders", "viewer"];

/**
 * Store team management: add employees with an access role. Employees can
 * sign in immediately with their email + the shared demo password.
 */
export default async function VendorTeamPage() {
  const { session, storeSlug } = await requireVendor();
  if (!can(session, "team")) redirect("/vendor");
  const employees = await getEmployees(storeSlug);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Give your staff their own logins with only the access they need.
      </p>

      {/* Add employee */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">👥 Add employee</h2>
        <form action={addEmployee} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="emp-name" className="label">Full name</label>
            <input id="emp-name" name="name" required placeholder="e.g. Hodan Yusuf" className="input" />
          </div>
          <div>
            <label htmlFor="emp-email" className="label">Email (their login)</label>
            <input id="emp-email" name="email" required type="email" placeholder="hodan@mystore.com" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="emp-role" className="label">Access role</label>
            <select id="emp-role" name="role" className="input">
              {STORE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} — {ROLE_DESCRIPTIONS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary sm:col-span-2">
            Add to Team
          </button>
        </form>
        <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-500">
          🔑 Demo: new employees sign in with their email and the password{" "}
          <code className="font-bold">{EMPLOYEE_PASSWORD}</code>. With real
          auth they would receive an invitation email instead.
        </p>
      </div>

      {/* Team list */}
      <div className="mt-5 space-y-3">
        {employees.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No employees yet — you are running this store solo. 💪
          </div>
        )}
        {employees.map((e) => (
          <div key={e.id} className="card flex flex-wrap items-center gap-4 p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ocean-100 font-display font-extrabold text-ocean-800">
              {e.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">{e.name}</p>
              <p className="truncate text-xs text-slate-400">{e.email}</p>
            </div>
            <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold capitalize text-ocean-800" title={ROLE_DESCRIPTIONS[e.role]}>
              {e.role}
            </span>
            <form action={removeEmployee.bind(null, e.id)}>
              <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
                Remove
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
