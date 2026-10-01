"use client";

import { useActionState, useState } from "react";
import { resetPassword, type ResetState } from "./actions";

const INITIAL: ResetState = { error: null };

export default function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, INITIAL);
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="password" className="label !mb-0">
            New password
          </label>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-xs font-semibold text-ocean-700 transition hover:text-mango-600"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="input"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
