"use client";

/**
 * Sign in with a phone number and password — no code, no SMS cost, works
 * on wifi with no signal. "Forgot password?" swaps in the code-based reset
 * (PhoneAuthForm mode="reset") right here, without leaving the page.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import { phoneAuth, type PhoneAuthState } from "@/app/phone-auth-actions";
import { PasswordField, PhoneField } from "@/components/auth/fields";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";

const INITIAL_STATE: PhoneAuthState = { error: null };

export default function PhonePasswordLogin({
  next,
  startInReset = false,
}: {
  next?: string;
  startInReset?: boolean;
}) {
  const [state, formAction, pending] = useActionState(phoneAuth, INITIAL_STATE);
  const [resetting, setResetting] = useState(startInReset);
  const [country, setCountry] = useState("+252");
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");

  if (resetting) {
    return (
      <PhoneAuthForm
        mode="reset"
        next={next}
        defaultCountry={country}
        defaultNumber={number}
        onBack={() => setResetting(false)}
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="intent" value="password" />
      {next && <input type="hidden" name="next" value={next} />}

      <PhoneField country={country} onCountry={setCountry} number={number} onNumber={setNumber} autoFocus />

      <div>
        <PasswordField
          id="password"
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <p className="mt-2 text-right">
          <button
            type="button"
            onClick={() => setResetting(true)}
            className="text-sm font-semibold text-ocean-700 transition hover:text-mango-600"
          >
            Forgot password?
          </button>
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-slate-400">
        Signed up with just a code before?{" "}
        <button type="button" onClick={() => setResetting(true)} className="font-semibold text-ocean-700 hover:underline">
          Set your password
        </button>
        {" · "}
        <Link href="/help" className="font-semibold text-ocean-700 hover:underline">
          Help
        </Link>
      </p>
    </form>
  );
}
