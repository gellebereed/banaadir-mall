import type { Metadata } from "next";
import { accountLabel, isPhoneLoginEmail } from "@/lib/phone-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import { accountsEnabled, findAuthUser, isRetiredStoreLogin, MIN_PASSWORD_LENGTH, verifiedPhoneOf } from "@/lib/accounts";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/storage";
import { AddPhoneForm, DeleteAccountForm, EmailForm, PasswordForm } from "./SecurityForms";

export const metadata: Metadata = { title: "Password & account" };
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

  /*
   * Which ways in this account has. Read from Supabase rather than the
   * cookie, so a number added in another browser shows here too.
   */
  const phoneOnly = isPhoneLoginEmail(session.email);
  const realEmail = phoneOnly ? null : session.email;
  let phone = phoneOnly ? (session.verifiedPhone ?? session.phone ?? accountLabel(session)) : session.verifiedPhone;
  if (live && !phoneOnly && accountsEnabled()) {
    phone = verifiedPhoneOf(await findAuthUser(session.email).catch(() => null)) ?? phone;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href={back} className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-ocean-950">Password &amp; account</h1>

      <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{session.name}</p>
          <p className="truncate text-sm text-slate-500">{accountLabel(session)}</p>
          <span className="mt-1 inline-block rounded-full bg-sand-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
            {roleLabel}
          </span>
        </div>
        <SignOutButton />
      </div>

      {live && !isStaff && session.role === "seller" && isRetiredStoreLogin(session.email) && (
        <div className="mt-5 rounded-2xl border border-mango-200 bg-mango-50 p-4 text-sm text-mango-900">
          <p className="font-bold">Please switch to your own email</p>
          <p className="mt-1">
            {session.email} is an old shared store login. Nobody receives mail there, so a
            forgotten password couldn&apos;t be reset. Enter your own email below — your store,
            products and orders stay exactly as they are.
          </p>
        </div>
      )}

      {emailParam === "confirmed" && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-bold">✓ Email confirmed</p>
          <p className="mt-1">
            You can now sign in with this email or your phone number, using the same password.
          </p>
        </div>
      )}

      {!live ? (
        <p className="mt-5 rounded-2xl bg-mango-50 p-4 text-sm text-mango-800">
          This is a demo install with shared demo passwords, so there is nothing to change here.
        </p>
      ) : (
        <>
          <section id="sign-in" className="card mt-5 scroll-mt-24 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ocean-950">Ways to sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sign in with either one, using the same password. Having both also means you can reset
              a forgotten password by SMS or by email.
            </p>
            <ul className="mt-4 divide-y divide-sand-200 rounded-2xl ring-1 ring-sand-200">
              {[
                { icon: "✉️", label: "Email", value: realEmail },
                { icon: "📱", label: "Phone number", value: phone },
              ].map((row) => (
                <li key={row.label} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl" aria-hidden>{row.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
                    <p className={`truncate text-sm font-semibold ${row.value ? "text-slate-800" : "text-slate-400"}`}>
                      {row.value ?? "Not added yet"}
                    </p>
                  </div>
                  {row.value ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">✓ Verified</span>
                  ) : (
                    <a href={row.label === "Email" ? "#add-email" : "#add-phone"} className="rounded-full bg-mango-50 px-2.5 py-1 text-[11px] font-bold text-mango-700 hover:bg-mango-100">
                      + Add
                    </a>
                  )}
                </li>
              ))}
            </ul>

            {!phone && !isAdmin && (
              <div id="add-phone" className="mt-6 scroll-mt-24 border-t border-sand-200 pt-5">
                <h3 className="font-display font-bold text-ocean-950">Add your phone number</h3>
                <p className="mt-1 mb-4 text-sm text-slate-500">
                  We&apos;ll text a code to check it&apos;s yours. A number can belong to one account only.
                </p>
                <AddPhoneForm />
              </div>
            )}
            {phone && !phoneOnly && !isAdmin && (
              <details className="mt-5 border-t border-sand-200 pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-ocean-700 hover:text-mango-600">
                  Change phone number
                </summary>
                <div className="mt-4">
                  <AddPhoneForm changing />
                </div>
              </details>
            )}
            {phoneOnly && (
              <div id="add-email" className="mt-6 scroll-mt-24 border-t border-sand-200 pt-5">
                <h3 className="font-display font-bold text-ocean-950">Add your email</h3>
                <p className="mt-1 mb-4 text-sm text-slate-500">
                  We&apos;ll email a link to confirm it. Your orders and points stay on this account.
                </p>
                <EmailForm currentEmail="" immediate={false} adding />
              </div>
            )}
          </section>

          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ocean-950">Change password</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Forgot your current one?{" "}
              <Link href="/forgot-password" className="font-semibold text-ocean-700 underline">
                Reset it by SMS or email
              </Link>
              .
            </p>
            <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
          </section>

          {!phoneOnly && (
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
                    {isRetiredStoreLogin(session.email)
                      ? "Your new email takes effect straight away — sign in with it and your current password."
                      : "We'll email a link to the new address; your email changes when you open it."}
                    {session.role === "customer" &&
                      " Orders you placed under your current email stay linked to it."}
                  </p>
                  <EmailForm currentEmail={session.email} immediate={isRetiredStoreLogin(session.email)} />
                </>
              )}
            </section>
          )}
        </>
      )}

      {live && session.role === "customer" && !isStaff && (
        <section className="card mt-5 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-ocean-950">Delete account</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">
            Close your Banaadir Mall account and remove your personal details. See our{" "}
            <Link href="/privacy#deletion" className="font-semibold text-ocean-700 underline">
              Privacy Policy
            </Link>{" "}
            for what is kept.
          </p>
          <DeleteAccountForm />
        </section>
      )}
      {live && session.role !== "customer" && (
        <p className="mt-5 text-xs text-slate-400">
          To close a store, team or admin login, contact Banaadir Mall support from the{" "}
          <Link href="/help" className="font-semibold underline">Help page</Link>.
        </p>
      )}
    </div>
  );
}
