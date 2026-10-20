"use client";

import { useActionState } from "react";
import { savePayoutDetails, type MoneyState } from "@/app/money-actions";
import type { PayoutAccount } from "@/lib/ledger-types";

export default function PayoutDetailsForm({
  account,
  methods,
}: {
  account?: PayoutAccount;
  methods: readonly string[];
}) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(savePayoutDetails, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="method" className="label">Pay me by</label>
          <select id="method" name="method" defaultValue={account?.method ?? "EVC Plus"} className="input">
            {methods.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="accountNumber" className="label">Number / account</label>
          <input
            id="accountNumber"
            name="accountNumber"
            defaultValue={account?.accountNumber === "—" ? "" : account?.accountNumber}
            placeholder="e.g. 61 555 1234"
            inputMode="tel"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="accountName" className="label">Name on the account</label>
          <input id="accountName" name="accountName" defaultValue={account?.accountName} className="input" />
        </div>
      </div>
      {state.error && <p className="text-sm font-semibold text-coral-600">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold text-emerald-700">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn-primary !py-2.5 text-sm disabled:opacity-60">
        {pending ? "Saving…" : "Save payout details"}
      </button>
    </form>
  );
}
