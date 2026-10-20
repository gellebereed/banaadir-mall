"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptState } from "./actions";

/**
 * Accept button — plus the password step on a live marketplace. See
 * acceptInvite for why an existing account confirms its password rather
 * than choosing a new one.
 */
export default function AcceptInviteForm({
  token,
  mode,
  minLength,
}: {
  token: string;
  /** "create": choose a password · "confirm": existing account · "none": demo install */
  mode: "create" | "confirm" | "none";
  minLength: number;
}) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(
    acceptInvite.bind(null, token),
    {},
  );

  return (
    <form action={formAction} className="mt-5 space-y-3">
      {mode === "create" && (
        <>
          <div>
            <label htmlFor="password" className="label">
              Choose your password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={minLength}
              autoComplete="new-password"
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">At least {minLength} characters.</p>
          </div>
          <div>
            <label htmlFor="confirm" className="label">
              Type it again
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={minLength}
              autoComplete="new-password"
              className="input"
            />
          </div>
        </>
      )}
      {mode === "confirm" && (
        <div>
          <label htmlFor="password" className="label">
            Your password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            You already have a Banaadir Mall account — use the password you sign in with.
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-xl bg-coral-100/60 px-4 py-3 text-sm font-semibold text-coral-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? "Opening your dashboard…" : "Accept & open my dashboard"}
      </button>
    </form>
  );
}
