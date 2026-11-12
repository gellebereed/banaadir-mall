"use client";

import { useActionState } from "react";
import { updateRewardSettings, type SaveState } from "@/app/actions";
import { MAX_EARN_PCT, MAX_SPEND_PCT } from "@/lib/rewards";
import type { RewardSettings } from "@/lib/types";

/**
 * BANAADIR REWARDS — the admin's three controls: on/off, what an order
 * earns, and how much of an order credit may pay for.
 *
 * The shops fund it by joining (lib/rewards.ts), so the second number is
 * the one to set with care: it is the most any shop can be asked to give
 * up on a single order. Changing either rate affects future orders only —
 * what an order earned is stamped on it when it is placed.
 */
export default function RewardsSettingsForm({
  rewards,
  storeNames,
}: {
  rewards: RewardSettings;
  /** Display names of the shops that have joined. */
  storeNames: string[];
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(updateRewardSettings, {
    ok: false,
    message: "",
  });

  return (
    <form action={formAction} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-ocean-950">🎁 Banaadir Rewards</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Customers earn credit on every order from a participating shop and spend it on the next one.
            Each shop joins from its Promotions page and funds the credit spent at its own till.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-full bg-sand-100 px-4 py-2 text-sm font-bold text-slate-700">
          <input type="checkbox" name="active" defaultChecked={rewards.active} className="h-4 w-4 accent-emerald-600" />
          Running
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="earnPct" className="label">Credit earned per order (%)</label>
          <input
            id="earnPct"
            name="earnPct"
            type="number"
            min="0.5"
            max={MAX_EARN_PCT}
            step="0.5"
            required
            defaultValue={rewards.earnPct}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">At 2%, a $50 order earns $1.00 — released when it is delivered.</p>
        </div>
        <div>
          <label htmlFor="maxSpendPct" className="label">Most of an order credit can pay for (%)</label>
          <input
            id="maxSpendPct"
            name="maxSpendPct"
            type="number"
            min="1"
            max={MAX_SPEND_PCT}
            step="1"
            required
            defaultValue={rewards.maxSpendPct}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">Protects shops: at 20%, a $50 order always brings in at least $40.</p>
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-sand-50 px-4 py-3 text-xs text-slate-600">
        <strong>{storeNames.length}</strong> shop{storeNames.length === 1 ? " has" : "s have"} joined
        {storeNames.length > 0 ? `: ${storeNames.join(", ")}.` : ". Until one does, nobody can earn or spend credit — tell your shops it is on their Promotions page."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-60">
          {pending ? "Saving…" : "Save rewards"}
        </button>
        {state.message && (
          <p className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-coral-700"}`}>
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
