import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Create Account" };

/** Demo registration page (no real authentication yet). */
export default function RegisterPage() {
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

        <form className="mt-6 space-y-4" action="/account">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" required placeholder="Ayaan Warsame" className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone number</label>
            <input id="phone" required type="tel" placeholder="+252 61 000 0000" className="input" />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" required type="password" placeholder="At least 8 characters" className="input" />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-ocean-700" />
            I agree to the Terms of Service and Privacy Policy
          </label>
          <button type="submit" className="btn-primary w-full">Create Account</button>
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
