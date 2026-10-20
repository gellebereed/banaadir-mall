"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeEmail, changePassword, type SecurityState } from "./actions";

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

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(changeEmail, INITIAL);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newEmail" className="label">New email</label>
          <input id="newEmail" name="newEmail" type="email" required autoComplete="email" placeholder={currentEmail} className="input" />
        </div>
        <div>
          <label htmlFor="emailPassword" className="label">Current password</label>
          <input id="emailPassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
        </div>
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-secondary !py-2.5 text-sm disabled:opacity-60">
        {pending ? "Sending…" : "Send confirmation link"}
      </button>
    </form>
  );
}
