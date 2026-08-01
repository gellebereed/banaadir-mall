import type { Metadata } from "next";
import { addEmployee, removeEmployee } from "@/app/actions";
import { getEmployees } from "@/lib/api";
import { EMPLOYEE_PASSWORD, ROLE_DESCRIPTIONS } from "@/lib/auth";
import type { EmployeeRole } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };

const PLATFORM_ROLES: EmployeeRole[] = ["manager", "marketing", "orders", "viewer"];

/** Platform staff with scoped access to the admin panel. */
export default async function AdminTeamPage() {
  const employees = await getEmployees("platform");

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Platform Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Staff accounts for the marketplace itself — each with only the access
        they need in this control panel.
      </p>

      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">👥 Add staff member</h2>
        <form action={addEmployee} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="store" value="platform" />
          <div>
            <label htmlFor="emp-name" className="label">Full name</label>
            <input id="emp-name" name="name" required placeholder="e.g. Khadar Omar" className="input" />
          </div>
          <div>
            <label htmlFor="emp-email" className="label">Email (their login)</label>
            <input id="emp-email" name="email" required type="email" placeholder="khadar@banaadirmall.com" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="emp-role" className="label">Access role</label>
            <select id="emp-role" name="role" className="input">
              {PLATFORM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} — {ROLE_DESCRIPTIONS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary sm:col-span-2">
            Add Staff Member
          </button>
        </form>
        <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-500">
          🔑 Demo: staff sign in with their email and the password{" "}
          <code className="font-bold">{EMPLOYEE_PASSWORD}</code>.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {employees.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No staff yet — only the main administrator account exists.
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
