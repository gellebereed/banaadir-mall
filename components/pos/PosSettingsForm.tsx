"use client";

import { useActionState, useState } from "react";
import { savePosSettings, type PosState } from "@/app/vendor/pos/actions";
import { PAYMENT_LABELS } from "@/lib/pos";
import type { PaymentMethod, PosSettings } from "@/lib/types";

const METHODS: PaymentMethod[] = ["cash", "evc", "edahab", "card"];

/**
 * The switch, and the two numbers behind every price the counter suggests.
 *
 * Kept to four controls on purpose. A settings screen is where a simple
 * tool becomes a complicated one, and everything that is not here — tax
 * rules, receipt templates, cash drawers, shifts — is something a shop
 * selling cinnamon rolls does not have and should not be asked about.
 */
export default function PosSettingsForm({ initial }: { initial: PosSettings }) {
  const [state, formAction, pending] = useActionState<PosState, FormData>(savePosSettings, {
    ok: false,
    message: "",
  });

  const [enabled, setEnabled] = useState(initial.enabled);
  const [margin, setMargin] = useState(String(initial.targetMarginPct));
  const [roundTo, setRoundTo] = useState(String(initial.roundTo));
  const [methods, setMethods] = useState<PaymentMethod[]>(initial.methods ?? ["cash"]);

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method],
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-5 w-5 accent-ocean-700"
        />
        <span>
          <span className="font-display font-bold text-ocean-950">
            Use the counter in this shop
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">
            Adds Pantry, Recipes and Sell to your dashboard. Switching it off
            later hides them again and changes nothing you have entered.
          </span>
        </span>
      </label>

      {enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Profit you want to make</span>
              <div className="relative">
                <input
                  name="targetMarginPct"
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  className="input pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  %
                </span>
              </div>
              {/*
                Said in money, not in jargon. "35% margin" means 35 shillings
                of every 100 the customer pays — which is not what most
                people assume it means, so the example is the explanation.
              */}
              <span className="mt-1 block text-xs text-slate-400">
                Out of every 100 the customer pays, {margin || 0} is yours. Only
                used to suggest a price — you can always type your own.
              </span>
            </label>

            <label className="block">
              <span className="label">Round prices to</span>
              <input
                name="roundTo"
                type="number"
                min="0"
                step="1"
                value={roundTo}
                onChange={(e) => setRoundTo(e.target.value)}
                className="input"
              />
              <span className="mt-1 block text-xs text-slate-400">
                {Number(roundTo) > 0
                  ? `Prices land on ${roundTo}, ${Number(roundTo) * 2}, ${Number(roundTo) * 3}… — the kind of number that fits on a board.`
                  : "No rounding — suggestions will be exact, like 45.51."}
              </span>
            </label>
          </div>

          <div>
            <span className="label">How customers pay</span>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((method) => {
                const on = methods.includes(method);
                return (
                  <label
                    key={method}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                      on
                        ? "border-ocean-700 bg-ocean-700 text-white"
                        : "border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={`method-${method}`}
                      checked={on}
                      onChange={() => toggleMethod(method)}
                      className="sr-only"
                    />
                    <span aria-hidden>{PAYMENT_LABELS[method]?.icon}</span>
                    {PAYMENT_LABELS[method]?.label ?? method}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Saving…" : enabled ? "Turn the counter on" : "Save"}
        </button>
        {state.message && (
          <p
            role="status"
            className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-coral-700"}`}
          >
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
