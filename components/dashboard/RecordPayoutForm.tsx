"use client";

import { useActionState, useTransition } from "react";
import { recordPayout, removePayout, type MoneyState } from "@/app/money-actions";

export function RecordPayoutForm({
  store,
  period,
  owed,
  defaultMethod,
  methods,
}: {
  store: string;
  period: string;
  owed: number;
  defaultMethod?: string;
  methods: readonly string[];
}) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(recordPayout, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="store" value={store} />
      <input type="hidden" name="period" value={period} />
      <label className="block">
        <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">Amount</span>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={owed > 0 ? owed.toFixed(2) : ""}
          required
          className="input !w-28 !px-3 !py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">Method</span>
        <select name="method" defaultValue={defaultMethod ?? "EVC Plus"} className="input !w-36 !px-3 !py-1.5 text-sm">
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">Reference</span>
        <input name="reference" placeholder="Transaction id" className="input !w-40 !px-3 !py-1.5 text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {state.error && <p className="w-full text-xs font-semibold text-coral-600">{state.error}</p>}
      {state.ok && <p className="w-full text-xs font-semibold text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function RemovePayoutButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this recorded payment? Use this only to correct a mistake.")) return;
        start(async () => {
          const res = await removePayout(id);
          if (res.error) alert(res.error);
        });
      }}
      className="text-[11px] font-semibold text-slate-400 underline hover:text-coral-600 disabled:opacity-50"
    >
      {pending ? "Removing…" : "delete"}
    </button>
  );
}
