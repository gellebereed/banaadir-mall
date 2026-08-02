"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpSeller, type AuthActionState } from "@/app/auth-actions";

const INITIAL_STATE: AuthActionState = { error: null };

export default function StoreApplicationForm() {
  const [state, formAction, pending] = useActionState(signUpSeller, INITIAL_STATE);

  if (state.success) {
    return (
      <div className="mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center shadow-sm animate-fade-up">
        <span className="text-5xl">🎉</span>
        <h2 className="mt-3 font-display text-xl font-bold text-emerald-950">Store Application Received!</h2>
        <p className="mt-2 text-sm font-medium text-emerald-800">
          Thank you for applying to sell on Banaadir Mall. Your store application is currently <strong>awaiting admin approval</strong>.
        </p>
        <p className="mt-1 text-xs text-emerald-600">
          Our management team reviews applications promptly. Once approved by the admin, you will receive access to your seller dashboard.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/products" className="btn-primary !py-2.5 text-sm">
            Browse Storefront
          </Link>
          <Link href="/" className="btn-secondary !py-2.5 text-sm">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="storeName" className="label">Store name</label>
        <input id="storeName" name="storeName" required placeholder="e.g. Hodan Electronics" className="input" />
      </div>
      <div>
        <label htmlFor="ownerName" className="label">Owner name</label>
        <input id="ownerName" name="ownerName" required placeholder="Your full name" className="input" />
      </div>
      <div>
        <label htmlFor="email" className="label">Email address</label>
        <input id="email" name="email" required type="email" placeholder="owner@store.com" className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" required type="password" placeholder="At least 6 characters" className="input" />
      </div>
      <div>
        <label htmlFor="phone" className="label">Phone (WhatsApp)</label>
        <input id="phone" name="phone" required type="tel" placeholder="+252 61 000 0000" className="input" />
      </div>
      <div>
        <label htmlFor="city" className="label">City</label>
        <input id="city" name="city" required placeholder="Mogadishu" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="category" className="label">What do you sell?</label>
        <select id="category" name="category" className="input">
          {["Electronics", "Women's Fashion", "Men's Fashion", "Beauty & Care", "Home & Living", "Kids & Baby", "Sports & Outdoor", "Groceries", "Something else"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="about" className="label">Tell us about your business</label>
        <textarea id="about" name="about" rows={3} placeholder="How long have you been selling? Do you have a physical shop?" className="input resize-none" />
      </div>

      {state.error && (
        <div className="sm:col-span-2 rounded-xl bg-coral-100 px-4 py-2.5 text-sm font-semibold text-coral-700">
          {state.error}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary sm:col-span-2 disabled:opacity-60">
        {pending ? "Submitting application…" : "Submit Application & Open Store"}
      </button>
    </form>
  );
}
