"use client";

/**
 * Demo sign-in. Credentials are validated server-side (app/auth-actions.ts)
 * against the demo accounts AND employees added from the Team pages, then
 * the user is redirected by role:
 *   admin -> /admin · seller -> /vendor · customer -> /account
 * The "Demo accounts" panel fills the form with one tap for easy testing.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, type SignInState } from "@/app/auth-actions";

const QUICK_LOGINS = [
  { label: "🛡️ Admin", email: "admin@banaadirmall.com", password: "Admin@2026", note: "Full control panel" },
  { label: "🍳 Seller — Karaca", email: "karaca-home@seller.banaadirmall.com", password: "Seller@2026", note: "Brand store dashboard" },
  { label: "🐎 Seller — U.S. Polo Assn.", email: "us-polo-assn@seller.banaadirmall.com", password: "Seller@2026", note: "Brand store dashboard" },
  { label: "👩🏾 Customer — Ayaan", email: "ayaan@banaadirmall.com", password: "Customer@2026", note: "Account with order history" },
];

const INITIAL_STATE: SignInState = { error: null };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(signIn, INITIAL_STATE);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Sign-in form */}
        <div className="card p-6 sm:p-8">
          <span className="text-4xl">👋</span>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-ocean-950">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in as an admin, seller or customer to test the full flow.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                name="email"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@banaadirmall.com"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                name="password"
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>
            {state.error && (
              <p className="rounded-xl bg-coral-100 px-4 py-2.5 text-sm font-semibold text-coral-700">
                {state.error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
              {pending ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New to Banaadir Mall?{" "}
            <Link href="/register" className="font-bold text-ocean-700 hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        {/* Demo accounts panel */}
        <div className="rounded-2xl border-2 border-dashed border-ocean-200 bg-ocean-50 p-6">
          <h2 className="font-display text-lg font-bold text-ocean-950">
            🧪 Demo accounts
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Tap one to fill the form. Every active store also has its own
            login: <code className="font-semibold">&lt;store-id&gt;@seller.banaadirmall.com</code>{" "}
            with password <code className="font-semibold">Seller@2026</code>.
          </p>
          <div className="mt-4 space-y-2.5">
            {QUICK_LOGINS.map((q) => (
              <button
                key={q.email}
                type="button"
                onClick={() => { setEmail(q.email); setPassword(q.password); }}
                className="block w-full rounded-xl bg-white p-3.5 text-left shadow-sm transition hover:shadow-md"
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ocean-950">{q.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-mango-600">
                    {q.note}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {q.email} · {q.password}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
            ⚠ Demo only: accounts are hard-coded in <code>lib/auth.ts</code>.
            Employees added from a Team page sign in with their email and{" "}
            <code>Employee@2026</code>. Replace with real authentication
            before launch.
          </p>
        </div>
      </div>
    </div>
  );
}
