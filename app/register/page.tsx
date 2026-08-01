"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpCustomer, type AuthActionState } from "@/app/auth-actions";

const INITIAL_STATE: AuthActionState = { error: null };

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(signUpCustomer, INITIAL_STATE);

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="card p-6 sm:p-8">
        <span className="text-4xl">🎁</span>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-ocean-950">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Join thousands of shoppers — and get 10% off your first order with
          code <strong className="text-mango-600">BANAADIR10</strong>.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" name="name" required placeholder="Ayaan Warsame" className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email address</label>
            <input id="email" name="email" required type="email" placeholder="ayaan@banaadirmall.com" className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone number</label>
            <input id="phone" name="phone" required type="tel" placeholder="+252 61 000 0000" className="input" />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" name="password" required type="password" placeholder="At least 6 characters" className="input" />
          </div>
          {state.error && (
            <p className="rounded-xl bg-coral-100 px-4 py-2.5 text-sm font-semibold text-coral-700">
              {state.error}
            </p>
          )}
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-ocean-700" />
            I agree to the Terms of Service and Privacy Policy
          </label>
          <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
            {pending ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-ocean-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
