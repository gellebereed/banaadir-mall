import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

/** Where "Delete my account" lands — a plain confirmation, signed out. */
export default function GoodbyePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="card p-8">
        <span className="text-5xl">👋</span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-ocean-950">Your account has been deleted</h1>
        <p className="mt-2 text-sm text-slate-500">
          You&apos;ve been signed out and your personal details have been removed. Thank you for
          shopping with Banaadir Mall — you&apos;re welcome back any time.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/" className="btn-primary">Back to the shop</Link>
          <Link href="/register" className="text-sm font-semibold text-ocean-700 hover:underline">
            Create a new account
          </Link>
        </div>
      </div>
    </div>
  );
}
