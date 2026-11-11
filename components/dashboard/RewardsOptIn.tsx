"use client";

import { useState, useTransition } from "react";
import { setRewardsOptIn } from "@/app/actions";

/**
 * Join or leave Banaadir Rewards — the shop's own decision, because the
 * shop pays: credit a customer spends here is money this till does not
 * collect. So the card says exactly what joining costs and what it caps
 * at, in the shop's own numbers, before the button.
 */
export default function RewardsOptIn({
  joined,
  running,
  earnPct,
  maxSpendPct,
}: {
  joined: boolean;
  /** False while the marketplace has the programme switched off. */
  running: boolean;
  earnPct: number;
  maxSpendPct: number;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className={`rounded-2xl border p-4 sm:col-span-2 ${joined ? "border-emerald-300 bg-emerald-50/60" : "border-sand-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-ocean-950">
            🎁 Banaadir Rewards
            {joined && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Joined</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {running
              ? `Customers earn ${earnPct}% of every order from you as credit, and come back to spend it. Credit from any participating shop can pay for up to ${maxSpendPct}% of an order at yours — that part you do not collect, so a $50 order always brings in at least $${(50 * (1 - maxSpendPct / 100)).toFixed(0)}.`
              : "Not running right now. You can join ahead of time and it will apply when the marketplace switches it on."}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setRewardsOptIn(!joined);
              setMessage({ ok: result.ok, text: result.message });
            })
          }
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-60 ${
            joined ? "bg-sand-100 text-slate-600 hover:bg-sand-200" : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {pending ? "Saving…" : joined ? "Leave" : "Join"}
        </button>
      </div>
      {message && (
        <p className={`mt-2 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-coral-600"}`}>{message.text}</p>
      )}
    </div>
  );
}
