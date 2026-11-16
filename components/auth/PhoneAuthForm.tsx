"use client";

/**
 * Sign in / sign up with a code by SMS — the default way in for shoppers.
 * Two steps on one form: the number (and, signing up, a name), then the
 * 6-digit code. The server side is app/phone-auth-actions.ts.
 */

import { useActionState, useState } from "react";
import { phoneAuth, type PhoneAuthState } from "@/app/phone-auth-actions";
import { PHONE_COUNTRIES } from "@/lib/phone-auth";
import RequiredMark from "@/components/RequiredMark";

const INITIAL_STATE: PhoneAuthState = { error: null };

export default function PhoneAuthForm({
  mode,
  next,
  defaultName = "",
  defaultCountry = "+252",
  defaultNumber = "",
}: {
  mode: "login" | "signup";
  next?: string;
  defaultName?: string;
  defaultCountry?: string;
  defaultNumber?: string;
}) {
  const [state, formAction, pending] = useActionState(phoneAuth, INITIAL_STATE);
  // "Change number" goes back to step one without losing what was typed.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(defaultName);
  const [country, setCountry] = useState(defaultCountry);
  const [number, setNumber] = useState(defaultNumber);

  const codeStep = Boolean(state.phone) && !editing;

  const notice = (
    <>
      {state.error && (
        <p role="alert" className="rounded-xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-700">
          {state.error}
        </p>
      )}
      {state.message && !state.error && (
        <p className="rounded-xl bg-ocean-50 px-4 py-3 text-sm font-medium text-ocean-700">{state.message}</p>
      )}
    </>
  );

  if (codeStep) {
    return (
      <div className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="phone" value={state.phone} />
          <input type="hidden" name="name" value={name} />
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <label htmlFor="code" className="label">
              Code from the SMS
            </label>
            <input
              key={state.phone}
              id="code"
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{4,8}"
              maxLength={8}
              placeholder="123456"
              className="input text-center font-mono text-2xl tracking-[0.4em]"
            />
          </div>
          {notice}
          <button type="submit" disabled={pending} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Checking…" : mode === "signup" ? "Verify & create account" : "Verify & sign in"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-ocean-700 transition hover:text-mango-600"
          >
            ← Change number
          </button>
          {/* Resend: the same number, step one again. */}
          <form action={formAction}>
            <input type="hidden" name="intent" value="send" />
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="phone" value={state.phone} />
            <input type="hidden" name="name" value={name} />
            <button type="submit" disabled={pending} className="font-semibold text-ocean-700 transition hover:text-mango-600 disabled:opacity-60">
              Send a new code
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setEditing(false)} className="space-y-4">
      <input type="hidden" name="intent" value="send" />
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}

      {mode === "signup" && (
        <div>
          <label htmlFor="name" className="label">
            Full name
            <RequiredMark />
          </label>
          <input
            id="name"
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ayaan Warsame"
            className="input"
          />
        </div>
      )}

      <div>
        <label htmlFor="phone" className="label">
          Mobile number
          {mode === "signup" && <RequiredMark />}
        </label>
        <div className="flex gap-2">
          {/* `.input` is w-full, so the width lives on a wrapper — on the
              select itself it lost to w-full and pushed the number off-screen. */}
          <div className="w-32 shrink-0">
          <select
            name="countryCode"
            aria-label="Country code"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
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
            autoFocus={mode === "login"}
            inputMode="tel"
            autoComplete="tel-national"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="61 777 8899"
            className="input !w-auto min-w-0 flex-1"
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">We'll text you a 6-digit code. No password needed.</p>
      </div>

      {!state.phone && notice}
      {state.phone && state.error && notice}

      {mode === "signup" && (
        <label className="flex items-start gap-2 text-xs text-slate-500">
          <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-ocean-700" />
          I agree to the Terms of Service and Privacy Policy
        </label>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Sending code…" : "Send code"}
      </button>
    </form>
  );
}
