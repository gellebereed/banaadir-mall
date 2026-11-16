"use client";

/**
 * Create an account with a phone number — or set a new password for one —
 * proving the number once with a 6-digit code by SMS or WhatsApp.
 *
 *   signup: name, number, password  → code → signed in
 *   reset:  number, new password    → code → signed in with the new password
 *
 * Signing in day to day is number + password (PhonePasswordLogin), no code.
 * The server side is app/phone-auth-actions.ts.
 */

import { useActionState, useState } from "react";
import { phoneAuth, type Channel, type PhoneAuthState } from "@/app/phone-auth-actions";
import RequiredMark from "@/components/RequiredMark";
import { PasswordField, PhoneField } from "@/components/auth/fields";

const INITIAL_STATE: PhoneAuthState = { error: null };

export default function PhoneAuthForm({
  mode,
  next,
  defaultName = "",
  defaultCountry = "+252",
  defaultNumber = "",
  onBack,
}: {
  mode: "signup" | "reset";
  next?: string;
  defaultName?: string;
  defaultCountry?: string;
  defaultNumber?: string;
  /** Reset only: back to the password sign-in. */
  onBack?: () => void;
}) {
  const [state, formAction, pending] = useActionState(phoneAuth, INITIAL_STATE);
  // "Change number" goes back to step one without losing what was typed.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(defaultName);
  const [country, setCountry] = useState(defaultCountry);
  const [number, setNumber] = useState(defaultNumber);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Which button was pressed, so only that one says "Sending…".
  const [sending, setSending] = useState<Channel>("sms");
  const other: Channel = state.channel === "whatsapp" ? "sms" : "whatsapp";
  const mismatch = confirm.length > 0 && confirm !== password;

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

  // What every post carries: the step-one answers, held here between steps.
  const carried = (
    <>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="phone" value={state.phone ?? ""} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="password" value={password} />
      <input type="hidden" name="confirmPassword" value={confirm} />
      {next && <input type="hidden" name="next" value={next} />}
    </>
  );

  if (codeStep) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-sand-50 p-4 ring-1 ring-sand-200">
          <span className="text-2xl" aria-hidden>
            {state.channel === "whatsapp" ? "💬" : "📱"}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-bold text-slate-800">Check your {state.channel === "whatsapp" ? "WhatsApp" : "messages"}</p>
            <p className="mt-0.5 text-slate-500">
              We sent a 6-digit code to <span className="font-semibold text-slate-700">{state.phone}</span>.
              {mode === "signup"
                ? " Enter it to verify your number and finish creating your account."
                : " Enter it to confirm it's you and save your new password."}
            </p>
          </div>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="intent" value="verify" />
          {carried}
          <div>
            <label htmlFor="code" className="label">
              Verification code
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
              placeholder="000000"
              className="input text-center font-mono text-2xl tracking-[0.4em]"
            />
          </div>
          {state.error && notice}
          <button type="submit" disabled={pending} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Checking…" : mode === "signup" ? "Verify & create account" : "Verify & save password"}
          </button>
        </form>

        <div className="flex items-start justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-ocean-700 transition hover:text-mango-600"
          >
            ← Change number
          </button>
          {/* Resend: the same way, or the other way when the first didn't arrive. */}
          <form action={formAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="intent" value="send" />
            {carried}
            <button
              type="submit"
              name="channel"
              value={state.channel ?? "sms"}
              disabled={pending}
              className="font-semibold text-ocean-700 transition hover:text-mango-600 disabled:opacity-60"
            >
              Send a new code
            </button>
            <button
              type="submit"
              name="channel"
              value={other}
              disabled={pending}
              className="text-xs font-semibold text-slate-500 transition hover:text-mango-600 disabled:opacity-60"
            >
              {other === "whatsapp" ? "💬 Get it on WhatsApp instead" : "📱 Get it by SMS instead"}
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
      <input type="hidden" name="name" value={name} />
      {next && <input type="hidden" name="next" value={next} />}

      {mode === "reset" && (
        <p className="text-sm text-slate-500">
          Enter your number and choose a new password. We'll send a code to confirm it's you.
        </p>
      )}

      {mode === "signup" && (
        <div>
          <label htmlFor="name" className="label">
            Full name
            <RequiredMark />
          </label>
          <input
            id="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ayaan Warsame"
            className="input"
          />
        </div>
      )}

      <PhoneField
        country={country}
        onCountry={setCountry}
        number={number}
        onNumber={setNumber}
        required={mode === "signup"}
        autoFocus={mode === "reset"}
      />

      <PasswordField
        id="password"
        name="password"
        label={mode === "signup" ? "Create a password" : "New password"}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        showStrength
      />
      <div>
        <label htmlFor="confirmPassword" className="label">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          maxLength={72}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          className={`input ${mismatch ? "!border-coral-400" : ""}`}
        />
        {mismatch && <p className="mt-1 text-xs font-medium text-coral-600">The passwords don't match yet.</p>}
      </div>

      {(!state.phone || state.error) && notice}

      {mode === "signup" && (
        <label className="flex items-start gap-2 text-xs text-slate-500">
          <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-ocean-700" />
          I agree to the Terms of Service and Privacy Policy
        </label>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500">
          {mode === "signup" ? "Verify your number with a code by:" : "Send the code by:"}
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="submit"
            name="channel"
            value="sms"
            onClick={() => setSending("sms")}
            disabled={pending || mismatch}
            className="btn-primary w-full !px-4 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && sending === "sms" ? "Sending…" : "📱 SMS"}
          </button>
          <button
            type="submit"
            name="channel"
            value="whatsapp"
            onClick={() => setSending("whatsapp")}
            disabled={pending || mismatch}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && sending === "whatsapp" ? "Sending…" : "💬 WhatsApp"}
          </button>
        </div>
      </div>

      {onBack && (
        <p className="text-center text-sm">
          <button type="button" onClick={onBack} className="font-semibold text-ocean-700 transition hover:text-mango-600">
            ← Back to sign in
          </button>
        </p>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
        <span aria-hidden>🔒</span> Your number is verified once. After that you sign in with your password.
      </p>
    </form>
  );
}
