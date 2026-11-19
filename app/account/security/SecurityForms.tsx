"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PhoneField } from "@/components/auth/fields";
import { addPhone, changeEmail, changePassword, deleteAccount, type PhoneStepState, type SecurityState } from "./actions";

const INITIAL: SecurityState = {};

function Result({ state }: { state: SecurityState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        state.ok ? "bg-emerald-50 text-emerald-800" : "bg-coral-100/60 text-coral-700"
      }`}
    >
      {state.ok ?? state.error}
    </p>
  );
}

/** Clears the form after a success, so passwords don't linger in the fields. */
function useResetOnSuccess(state: SecurityState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="label">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newPassword" className="label">New password</label>
          <input id="newPassword" name="newPassword" type="password" required minLength={minLength} autoComplete="new-password" className="input" />
          <p className="mt-1 text-xs text-slate-400">At least {minLength} characters.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="label">New password again</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={minLength} autoComplete="new-password" className="input" />
        </div>
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-primary !py-2.5 text-sm disabled:opacity-60">
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function EmailForm({
  currentEmail,
  immediate,
  adding = false,
}: {
  currentEmail: string;
  immediate: boolean;
  /** A phone-only account adding its first email. */
  adding?: boolean;
}) {
  const [state, action, pending] = useActionState(changeEmail, INITIAL);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newEmail" className="label">{adding ? "Email" : "New email"}</label>
          <input id="newEmail" name="newEmail" type="email" required autoComplete="email" placeholder={adding ? "you@example.com" : currentEmail} className="input" />
        </div>
        <div>
          <label htmlFor="confirmEmail" className="label">{adding ? "Email again" : "New email again"}</label>
          <input id="confirmEmail" name="confirmEmail" type="email" required autoComplete="off" className="input" />
        </div>
      </div>
      <div className="sm:max-w-[calc(50%-0.5rem)]">
        <label htmlFor="emailPassword" className="label">Current password</label>
        <input id="emailPassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-secondary !py-2.5 text-sm disabled:opacity-60">
        {pending ? "Saving…" : immediate ? "Change my email" : adding ? "Add email" : "Send confirmation link"}
      </button>
    </form>
  );
}

/**
 * Add (or change) the account's phone number: password + number, then the
 * SMS code. See addPhone in ./actions.ts.
 */
export function AddPhoneForm({ changing = false }: { changing?: boolean }) {
  const [state, action, pending] = useActionState<PhoneStepState, FormData>(addPhone, {});
  const [country, setCountry] = useState("+252");
  const [number, setNumber] = useState("");
  const [editing, setEditing] = useState(false);

  if (state.done) {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        ✓ {state.ok}
      </p>
    );
  }

  if (state.phone && !editing) {
    return (
      <div className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="phone" value={state.phone} />
          <p className="rounded-xl bg-ocean-50 px-4 py-3 text-sm font-medium text-ocean-800">
            📱 We sent a 6-digit code by SMS to <span className="font-bold">{state.phone}</span>.
          </p>
          <div className="sm:max-w-[calc(50%-0.5rem)]">
            <label htmlFor="addPhoneCode" className="label">Verification code</label>
            <input
              key={state.phone}
              id="addPhoneCode"
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{4,8}"
              maxLength={8}
              placeholder="000000"
              className="input text-center font-mono text-xl tracking-[0.35em]"
            />
          </div>
          {state.error && <Result state={{ error: state.error }} />}
          <button type="submit" disabled={pending} className="btn-primary !py-2.5 text-sm disabled:opacity-60">
            {pending ? "Checking…" : "Verify number"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-semibold text-ocean-700 hover:text-mango-600"
        >
          ← Use a different number, or send a new code
        </button>
      </div>
    );
  }

  return (
    <form action={action} onSubmit={() => setEditing(false)} className="space-y-4">
      <input type="hidden" name="intent" value="send" />
      <div className="sm:max-w-[calc(50%-0.5rem)]">
        <PhoneField country={country} onCountry={setCountry} number={number} onNumber={setNumber} required />
      </div>
      <div className="sm:max-w-[calc(50%-0.5rem)]">
        <label htmlFor="phonePassword" className="label">Current password</label>
        <input id="phonePassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
      </div>
      {state.error && <Result state={{ error: state.error }} />}
      <button type="submit" disabled={pending} className="btn-secondary !py-2.5 text-sm disabled:opacity-60">
        {pending ? "Sending code…" : changing ? "Send code to new number" : "Send verification code"}
      </button>
    </form>
  );
}

/**
 * Two deliberate steps — open the section, then type DELETE with the
 * password — so a stray tap on a phone can't close an account.
 */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, INITIAL);
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-coral-500/40 px-4 py-2.5 text-sm font-bold text-coral-700 hover:bg-coral-100 [&::-webkit-details-marker]:hidden">
        Delete my account…
      </summary>
      <form action={action} className="mt-4 space-y-4 rounded-2xl border border-coral-500/40 bg-coral-100/40 p-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>You&apos;ll be signed out and won&apos;t be able to sign in with this account again.</li>
          <li>Your back-in-stock alerts, synced recommendations and reward points are removed.</li>
          <li>
            Shops keep a record of orders you already received (for their accounts and returns), but it
            is no longer linked to you.
          </li>
          <li>This can&apos;t be undone. You can always create a new account later.</li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="deletePassword" className="label">Your password</label>
            <input id="deletePassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
          </div>
          <div>
            <label htmlFor="confirmText" className="label">Type DELETE to confirm</label>
            <input id="confirmText" name="confirmText" required autoComplete="off" autoCapitalize="characters" placeholder="DELETE" className="input" />
          </div>
        </div>
        <Result state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-coral-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-coral-700 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete my account for good"}
        </button>
      </form>
    </details>
  );
}
