"use client";

import { useActionState, useState } from "react";
import { transferOwnership, type MoneyState } from "@/app/money-actions";

/** See transferOwnership in app/money-actions.ts for the guard rails. */
export default function TransferOwnershipForm({ storeName }: { storeName: string }) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(transferOwnership, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-coral-500 px-4 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
      >
        Transfer this store…
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newOwner" className="label">New owner&apos;s email</label>
          <input id="newOwner" name="newOwner" type="email" required className="input" />
          <p className="mt-1 text-xs text-slate-400">They need a Banaadir Mall account first.</p>
        </div>
        <div>
          <label htmlFor="confirmName" className="label">
            Type <strong>{storeName}</strong> to confirm
          </label>
          <input id="confirmName" name="confirmName" required autoComplete="off" className="input" />
        </div>
        <div>
          <label htmlFor="transferPassword" className="label">Your password</label>
          <input id="transferPassword" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <label className="flex items-start gap-2 self-end pb-3 text-sm text-slate-700">
          <input type="checkbox" name="stayAsManager" className="mt-0.5 h-4 w-4 accent-ocean-700" />
          Keep me on the team as a manager
        </label>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-coral-100/60 px-4 py-3 text-sm font-semibold text-coral-700">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-coral-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-coral-700 disabled:opacity-60"
        >
          {pending ? "Transferring…" : "Transfer ownership"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          Cancel
        </button>
      </div>
    </form>
  );
}
