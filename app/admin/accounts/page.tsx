import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccountsClient from "@/components/dashboard/AccountsClient";
import { accountsEnabled, listAccounts } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Accounts & Passwords" };

export const dynamic = "force-dynamic";

/** Every login on the marketplace, and the controls to change its password. */
export default async function AdminAccountsPage() {
  const session = await getSession();
  // The main administrator only — see app/admin/accounts/actions.ts.
  if (session?.role !== "admin" || session.access) redirect("/admin");

  const enabled = accountsEnabled();
  const accounts = await listAccounts();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Accounts &amp; Passwords</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every email has one password, and signing in always opens the same
        place — the admin panel, a store dashboard, or a shopper account —
        whichever password they use. Set a new password here, or send a
        one-time link so the person chooses their own.
      </p>

      {!enabled && (
        <div className="mt-5 rounded-2xl border border-mango-200 bg-mango-50 p-4 text-sm text-mango-900">
          <p className="font-bold">⚠️ Password changes are switched off</p>
          <p className="mt-1">
            Add <code className="font-bold">SUPABASE_SERVICE_ROLE_KEY</code> to the
            site&apos;s environment variables (Netlify → Site configuration →
            Environment variables; the key is in Supabase → Project Settings → API)
            and redeploy. Until then, the shared default passwords keep working
            alongside each account&apos;s own one.
          </p>
        </div>
      )}

      <AccountsClient accounts={accounts} enabled={enabled} />
    </div>
  );
}
