import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvite } from "./actions";
import { getEmployeeByInviteToken, getStore } from "@/lib/api";
import {
  EMPLOYEE_PASSWORD,
  PERMISSIONS_BY_KEY,
  permissionsFor,
  ROLE_DESCRIPTIONS,
} from "@/lib/auth";

export const metadata: Metadata = { title: "Your invitation" };
export const dynamic = "force-dynamic";

/**
 * What somebody sees when they open the link their store owner sent them.
 *
 * It states, before they accept anything, exactly which store they are
 * joining and exactly what they will be able to do — because "you have
 * been invited, click here" is how people end up with access nobody
 * intended them to have and nobody can later account for.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const employee = await getEmployeeByInviteToken(token);

  if (!employee) return <InviteProblem />;

  const store =
    employee.store === "platform" ? null : await getStore(employee.store);

  if (employee.store !== "platform" && (!store || store.status !== "active")) {
    return (
      <InviteProblem
        title="This store isn't open yet"
        message="The store that invited you is not active on Banaadir Mall right now. Ask whoever invited you to try again once it is."
      />
    );
  }

  const grants = permissionsFor(employee);
  const placeName = store?.name ?? "Banaadir Mall (platform team)";

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="card p-6 sm:p-8">
        <span className="text-4xl">🎉</span>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-ocean-950">
          You have been invited to {placeName}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Hello {employee.name.split(" ")[0]} — this invitation is for{" "}
          <strong className="text-slate-700">{employee.email}</strong>.
        </p>

        <div className="mt-5 rounded-2xl bg-sand-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ocean-700">
            Your access · {employee.role}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {ROLE_DESCRIPTIONS[employee.role]}
          </p>
          <ul className="mt-3 space-y-1.5">
            {grants.map((key) => (
              <li key={key} className="flex gap-2 text-sm text-slate-700">
                <span aria-hidden>✅</span>
                <span>{PERMISSIONS_BY_KEY[key]?.label ?? key}</span>
              </li>
            ))}
            {grants.length === 0 && (
              <li className="text-sm text-slate-500">
                View-only for now — the owner can widen this at any time.
              </li>
            )}
          </ul>
          {!grants.includes("costs.view") && (
            <p className="mt-3 border-t border-sand-200 pt-3 text-xs text-slate-500">
              You will see selling prices, but not cost prices or profit.
            </p>
          )}
        </div>

        {employee.status === "active" && (
          <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-xs text-mango-800">
            This invitation has already been used once. Opening it again just
            signs you back in.
          </p>
        )}

        <form action={acceptInvite.bind(null, token)} className="mt-5">
          <button type="submit" className="btn-primary w-full">
            Accept &amp; open my dashboard
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400">
          You can also sign in at any time at{" "}
          <Link href="/login" className="font-semibold text-ocean-700 underline">
            the login page
          </Link>{" "}
          with your email and the password{" "}
          <code className="font-bold">{EMPLOYEE_PASSWORD}</code>.
        </p>
      </div>
    </div>
  );
}

function InviteProblem({
  title = "This invitation is no longer valid",
  message = "The link may have been replaced with a newer one, or the invitation may have been withdrawn. Ask whoever invited you to send a fresh link.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="card p-8">
        <span className="text-4xl">🔒</span>
        <h1 className="mt-3 font-display text-xl font-extrabold text-ocean-950">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <Link href="/" className="btn-primary mt-6 inline-block">
          Go to Banaadir Mall
        </Link>
      </div>
    </div>
  );
}
