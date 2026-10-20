import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import { MIN_PASSWORD_LENGTH } from "@/lib/accounts";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/storage";
import { EmailForm, PasswordForm } from "./SecurityForms";

export const metadata: Metadata = { title: "Password & email" };
export const dynamic = "force-dynamic";

/**
 * Password & email, for everyone who signs in — shoppers, store owners,
 * staff and the admin. See ./actions.ts for who may change what.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/security");
  const { email: emailParam } = await searchParams;

  const live = isSupabaseConfigured();
  const isStaff = Boolean(session.access);
  const isAdmin = session.role === "admin" && !isStaff;
  const back =
    session.role === "admin" ? "/admin" : session.role === "seller" ? "/vendor" : "/account";
  const roleLabel = isAdmin
    ? "Marketplace admin"
    : isStaff
      ? "Team member"
      : session.role === "seller"
        ? "Store owner"
        : "Shopper";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href={back} className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-ocean-950">Password &amp; email</h1>

      <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{session.name}</p>
          <p className="truncate text-sm text-slate-500">{session.email}</p>
          <span className="mt-1 inline-block rounded-full bg-sand-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
            {roleLabel}
          </span>
        </div>
        <SignOutButton />
      </div>

      {emailParam === "confirmed" && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-bold">✓ Email confirmed</p>
          <p className="mt-1">
            Sign out and sign back in with your new address to finish — this page still shows
            the one you signed in with.
          </p>
        </div>
      )}

      {!live ? (
        <p className="mt-5 rounded-2xl bg-mango-50 p-4 text-sm text-mango-800">
          This is a demo install with shared demo passwords, so there is nothing to change here.
        </p>
      ) : (
        <>
          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ocean-950">Change password</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Forgot your current one?{" "}
              <Link href="/forgot-password" className="font-semibold text-ocean-700 underline">
                Reset it by email
              </Link>
              .
            </p>
            <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
          </section>

          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ocean-950">Change email</h2>
            {isAdmin ? (
              <p className="mt-2 text-sm text-slate-500">
                The admin address is part of the site&apos;s configuration (the{" "}
                <code className="font-semibold">ADMIN_EMAIL</code> setting in Netlify), so it is
                changed there rather than here.
              </p>
            ) : isStaff ? (
              <p className="mt-2 text-sm text-slate-500">
                Your store knows you by this address. To use a different one, ask the store owner
                to invite your new address from their Team page.
              </p>
            ) : (
              <>
                <p className="mt-1 mb-4 text-sm text-slate-500">
                  We&apos;ll email a link to the new address; your email changes when you open it.
                  {session.role === "customer" &&
                    " Orders you placed under your current email stay linked to it."}
                </p>
                <EmailForm currentEmail={session.email} />
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
