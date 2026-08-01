"use client";

import { useActionState } from "react";
import { signUpSeller, type AuthActionState } from "@/app/auth-actions";

const INITIAL_STATE: AuthActionState = { error: null };

export default function StoreApplicationForm() {
  const [state, formAction, pending] = useActionState(signUpSeller, INITIAL_STATE);

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
