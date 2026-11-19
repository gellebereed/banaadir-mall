"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "./actions";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {});

  if (state.sent) {
    return (
      <div className="mt-4 rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-bold">📬 Check your inbox</p>
        <p className="mt-1">
          If <span className="font-semibold">{state.email}</span> belongs to an account, a link to
          choose a new password is on its way. It can take a minute, so check spam too. The link
          works once.
        </p>
        <p className="mt-3 text-emerald-800">
          Nothing arrived? You may have signed up with your phone number. Use the{" "}
          <span className="font-semibold">Phone number</span> tab above to get a code by SMS.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-coral-100/60 px-4 py-3 text-sm font-semibold text-coral-700">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
