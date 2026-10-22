import Link from "next/link";
import { openApprovedStore } from "@/app/auth-actions";
import type { Store } from "@/lib/types";

/**
 * Where a shopper's store application stands, at the top of their account.
 *
 * An applicant used to sign in and see an ordinary shopper account — no
 * mention of the store they had applied for, and after approval no way into
 * it short of signing out and back in, which nothing told them to do.
 */
export default function StoreApplicationStatus({ store }: { store: Store }) {
  if (store.status === "active") {
    return (
      <section className="card border-2 border-emerald-300 bg-emerald-50 p-5">
        <p className="font-display font-extrabold text-emerald-900">🎉 {store.name} is approved</p>
        <p className="mt-1 text-sm text-emerald-800">
          Your store is open on Banaadir Mall. Add your products and start selling.
        </p>
        <form action={openApprovedStore} className="mt-3">
          <button type="submit" className="btn-primary !py-2 text-sm">
            Open my store dashboard →
          </button>
        </form>
      </section>
    );
  }
  if (store.status === "pending") {
    return (
      <section className="card border-2 border-amber-300 bg-amber-50 p-5">
        <p className="font-display font-extrabold text-amber-900">⏳ {store.name} is awaiting approval</p>
        <p className="mt-1 text-sm text-amber-800">
          We review new stores within 48 hours. Once it&apos;s approved, a button to open your
          store dashboard will appear right here — there&apos;s nothing more you need to do.
        </p>
      </section>
    );
  }
  return (
    <section className="card border-2 border-coral-500/40 bg-coral-100 p-5">
      <p className="font-display font-extrabold text-coral-800">
        {store.status === "rejected" ? `❌ ${store.name} wasn't approved` : `⚠️ ${store.name} is suspended`}
      </p>
      <p className="mt-1 text-sm text-coral-800">
        Get in touch and we&apos;ll take another look.{" "}
        <Link href="/help" className="font-bold underline underline-offset-2">
          Contact support
        </Link>
      </p>
    </section>
  );
}
