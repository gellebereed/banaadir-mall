"use client";

import { signOut } from "@/app/auth-actions";

/** Clears the demo session (server action) and returns to the home page with a full refresh. */
export default function SignOutButton() {
  const handleSignOut = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signOut();
    } catch {
      // Redirect error is expected from Next.js server action redirects
    }
    window.location.href = "/";
  };

  return (
    <form onSubmit={handleSignOut}>
      <button
        type="submit"
        className="rounded-full border border-sand-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-sand-100"
      >
        Sign out
      </button>
    </form>
  );
}
