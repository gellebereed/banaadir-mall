import type { Metadata } from "next";
import { addEmployee } from "@/app/actions";
import PermissionPicker from "@/components/dashboard/PermissionPicker";
import SafeForm from "@/components/dashboard/SafeForm";
import TeamMember from "@/components/dashboard/TeamMember";
import { getEmployees } from "@/lib/api";
import { EMPLOYEE_PASSWORD } from "@/lib/auth";
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
        <h2 className="font-display font-bold text-ocean-950">👥 Invite a staff member</h2>
        {/* SafeForm so a refused invitation reads as a sentence rather than
            as Next.js's "Application error" page — see the vendor Team page. */}
        <SafeForm action={addEmployee} className="mt-4 space-y-4">
          <input type="hidden" name="store" value="platform" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="emp-name" className="label">Full name</label>
              <input id="emp-name" name="name" required placeholder="e.g. Khadar Omar" className="input" />
            </div>
            <div>
              <label htmlFor="emp-email" className="label">Email (their login)</label>
              <input id="emp-email" name="email" required type="email" placeholder="khadar@banaadirmall.com" className="input" />
            </div>
          </div>

          <PermissionPicker
            store="platform"
            roles={PLATFORM_ROLES}
            initialRole="marketing"
            idPrefix="new-staff"
          />

          <button type="submit" className="btn-primary w-full">
            Create invitation
          </button>
        </SafeForm>
        <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-500">
          🔗 An invitation link is created for you to send. Staff can also sign
          in with their email and the password{" "}
          <code className="font-bold">{EMPLOYEE_PASSWORD}</code>.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {employees.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No staff yet — only the main administrator account exists.
          </div>
        )}
        {employees.map((employee) => (
          <TeamMember key={employee.id} employee={employee} roles={PLATFORM_ROLES} />
        ))}
      </div>
    </div>
  );
}
