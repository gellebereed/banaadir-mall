"use client";

/**
 * Sign in.
 *
 * Credentials go to app/auth-actions.ts, which tries Supabase Auth first and
 * falls back to the built-in accounts, then redirects by role:
 *   admin → /admin · seller → /vendor · customer → /account
 *
 * ── Why the demo-account panel is gone ───────────────────────────────────
 * This page used to list working credentials for the admin and two seller
 * accounts, one tap from signing in. That is exactly right for a prototype
 * being passed around for testing, and indefensible for a marketplace
 * taking real sellers and real money — it published a set of keys to the
 * control panel. It came out along with the demo data.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, type SignInState } from "@/app/auth-actions";

const INITIAL_STATE: SignInState = { error: null };

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(signIn, INITIAL_STATE);

  return (
    <div className="grid min-h-[calc(100vh-13rem)] lg:grid-cols-2">
      {/* ── The form ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ocean-950">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to track your orders, save what you like, and pick up
            where you left off.
          </p>

          <form action={formAction} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="password" className="label !mb-0">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="text-xs font-semibold text-ocean-700 transition hover:text-mango-600"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="input"
              />
            </div>

            {state?.error && (
              <p
                role="alert"
                className="rounded-xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-700"
              >
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New to Banaadir Mall?{" "}
            <Link
              href="/register"
              className="font-bold text-ocean-700 transition hover:text-mango-600"
            >
              Create an account
            </Link>
          </p>

          <div className="mt-8 border-t border-sand-200 pt-6">
            <p className="text-center text-xs text-slate-400">
              Selling with us?{" "}
              <Link href="/sell" className="font-semibold text-slate-600 hover:text-ocean-700">
                Apply to open a store
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/*
        The brand panel. Hidden below `lg` rather than stacked above the
        form: on a phone the only thing that matters is signing in, and a
        decorative half-screen would push the password field under the fold.
      */}
      <div className="texture-weave relative hidden overflow-hidden bg-gradient-to-br from-ocean-950 via-ocean-800 to-ocean-600 lg:flex lg:items-center">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-mango-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-ocean-400/20 blur-3xl" />

        <div className="relative px-12 py-16 xl:px-16">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mango-300 ring-1 ring-inset ring-white/20">
            🇸🇴 Proudly Somali
          </span>

          <p className="mt-6 max-w-md font-display text-3xl font-extrabold leading-tight text-white xl:text-4xl">
            The whole market,{" "}
            <span className="bg-gradient-to-r from-mango-300 to-mango-500 bg-clip-text text-transparent">
              in your pocket.
            </span>
          </p>

          <ul className="mt-8 space-y-4">
            {[
              ["📦", "Track every parcel", "Each shop ships its own — follow them all in one place."],
              ["♡", "Keep a wishlist", "Save now, and we'll tell you when the price drops."],
              ["✦", "Shelves that learn", "The more you browse, the less you have to search."],
            ].map(([icon, title, body]) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm ring-1 ring-inset ring-white/15">
                  {icon}
                </span>
                <span className="max-w-xs">
                  <span className="block text-sm font-bold text-white">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ocean-100/80">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ocean-100/70">
            {["EVC Plus", "Zaad", "eDahab", "Cash on delivery"].map((method) => (
              <span key={method} className="rounded-full bg-white/10 px-2.5 py-1">
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
