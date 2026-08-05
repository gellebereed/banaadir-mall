import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addEmployee } from "@/app/actions";
import PermissionPicker from "@/components/dashboard/PermissionPicker";
import TeamMember from "@/components/dashboard/TeamMember";
import { getEmployees } from "@/lib/api";
import { can, EMPLOYEE_PASSWORD } from "@/lib/auth";
import { requireVendor } from "@/lib/session";
import type { EmployeeRole } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };

const STORE_ROLES: EmployeeRole[] = ["manager", "products", "orders", "viewer"];

/**
 * Store team management.
 *
 * Adding someone creates a PENDING invitation with a link to share. They
 * become active the first time they actually sign in — so this page can
 * tell the difference between "invited" and "in", which is the whole
 * reason an owner comes back to it.
 */
export default async function VendorTeamPage() {
  const { session, storeSlug } = await requireVendor();
  if (!can(session, "team")) redirect("/vendor");
  const employees = await getEmployees(storeSlug);

  const pending = employees.filter((e) => e.status !== "active").length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Give your staff their own logins with only the access they need — down
        to whether they can see what your stock cost you.
      </p>

      {/* Add employee */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">👥 Invite someone</h2>
        <form action={addEmployee} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="emp-name" className="label">Full name</label>
              <input id="emp-name" name="name" required placeholder="e.g. Hodan Yusuf" className="input" />
            </div>
            <div>
              <label htmlFor="emp-email" className="label">Email (their login)</label>
              <input id="emp-email" name="email" required type="email" placeholder="hodan@mystore.com" className="input" />
            </div>
          </div>

          <PermissionPicker
            store={storeSlug}
            roles={STORE_ROLES}
            initialRole="products"
            idPrefix="new-emp"
          />

          <button type="submit" className="btn-primary w-full">
            Create invitation
          </button>
        </form>
        <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-500">
          🔗 You will get a link to send them yourself — on WhatsApp, or however
          you normally reach them. Nothing is emailed automatically. They can
          also sign in at the login page with their email and the password{" "}
          <code className="font-bold">{EMPLOYEE_PASSWORD}</code>.
        </p>
      </div>

      {pending > 0 && (
        <p className="mt-5 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-800">
          ⏳ {pending} {pending === 1 ? "person has" : "people have"} not signed
          in yet. Their invitation links are below — send them again if they
          never arrived.
        </p>
      )}

      {/* Team list */}
      <div className="mt-5 space-y-3">
        {employees.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No employees yet — you are running this store solo. 💪
          </div>
        )}
        {employees.map((employee) => (
          <TeamMember key={employee.id} employee={employee} roles={STORE_ROLES} />
        ))}
      </div>
    </div>
  );
}
