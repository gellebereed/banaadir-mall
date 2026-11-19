"use client";

/**
 * The inputs the phone sign-in and sign-up forms share: the number with
 * its country code, and a password with show / hide.
 */

import { useState } from "react";
import { PHONE_COUNTRIES } from "@/lib/phone-auth";
import RequiredMark from "@/components/RequiredMark";

export function PhoneField({
  country,
  onCountry,
  number,
  onNumber,
  required = false,
  autoFocus = false,
  hint,
}: {
  country: string;
  onCountry: (code: string) => void;
  number: string;
  onNumber: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor="phone" className="label">
        Mobile number
        {required && <RequiredMark />}
      </label>
      <div className="flex gap-2">
        {/* `.input` is w-full, so the width lives on a wrapper — on the
            select itself it lost to w-full and pushed the number off-screen. */}
        <div className="w-32 shrink-0">
          <select
            name="countryCode"
            aria-label="Country code"
            value={country}
            onChange={(e) => onCountry(e.target.value)}
            className="input px-2"
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.phoneCode}>
                {c.flag} {c.phoneCode}
              </option>
            ))}
          </select>
        </div>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          autoFocus={autoFocus}
          inputMode="tel"
          autoComplete="tel-national"
          value={number}
          onChange={(e) => onNumber(e.target.value)}
          placeholder="61 777 8899"
          className="input !w-auto min-w-0 flex-1"
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** How strong a new password looks — a nudge, not a rule (the rule is 8+). */
function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 8) return { score: 0, label: "At least 8 characters" };
  let points = 0;
  if (pw.length >= 12) points++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++;
  if (/\d/.test(pw)) points++;
  if (/[^A-Za-z0-9]/.test(pw)) points++;
  if (points <= 1) return { score: 1, label: "Okay — a longer one is safer" };
  if (points === 2) return { score: 2, label: "Good" };
  return { score: 3, label: "Strong" };
}

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  showStrength = false,
  required = true,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  showStrength?: boolean;
  required?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const s = strength(value);
  const bar = ["bg-sand-200", "bg-coral-400", "bg-mango-400", "bg-emerald-500"][s.score];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="label !mb-0">
          {label}
          {required && showStrength && <RequiredMark />}
        </label>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="text-xs font-semibold text-ocean-700 transition hover:text-mango-600"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        required={required}
        minLength={autoComplete === "new-password" ? 8 : undefined}
        maxLength={72}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={autoComplete === "new-password" ? "At least 8 characters" : "••••••••"}
        className="input"
      />
      {showStrength && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1 flex-1 rounded-full ${s.score >= n ? bar : "bg-sand-200"}`} />
            ))}
          </div>
          <span className="text-xs text-slate-400">{value ? s.label : "At least 8 characters"}</span>
        </div>
      )}
    </div>
  );
}
