"use client";

import { useActionState, useMemo, useState } from "react";
import { updateCommissionSettings } from "@/app/actions";
import type { SaveState } from "@/app/actions";
import { money } from "@/lib/format";
import { normalisePct, rateFor } from "@/lib/commission";
import type { CommissionRule, CommissionSettings } from "@/lib/types";

export interface PickerOption {
  slug: string;
  name: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  COMMISSION SETUP
 * ─────────────────────────────────────────────────────────────────────────
 * The default rate, the per-order fee, and the stack of overrides.
 *
 * ── Why there is a worked example on the screen ──────────────────────────
 * A percentage and a flat fee interact, and nobody can hold that in their
 * head: 8% plus $0.30 is 8.6% on a $5 order and 8.03% on a $100 one. An
 * admin setting a rate is trying to answer "what do I actually take, and
 * what does the seller actually get", and a form made of three number
 * boxes does not answer it. The panel at the bottom does — live, against
 * the real rules, before anything is saved.
 *
 * The rules themselves travel as JSON in a hidden field, the same way the
 * variant and photo editors work, so the whole table is one atomic save
 * rather than a row at a time.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function CommissionForm({
  initial,
  stores,
  categories,
}: {
  initial: CommissionSettings;
  stores: PickerOption[];
  categories: PickerOption[];
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateCommissionSettings,
    { ok: false, message: "" },
  );

  const [enabled, setEnabled] = useState(initial.enabled);
  const [defaultPct, setDefaultPct] = useState(String(initial.defaultPct));
  const [orderFee, setOrderFee] = useState(String(initial.orderFee));
  const [chargeOnDelivery, setChargeOnDelivery] = useState(initial.chargeOnDelivery);
  const [showToSellers, setShowToSellers] = useState(initial.showToSellers);
  const [rules, setRules] = useState<CommissionRule[]>(initial.rules ?? []);

  // What the example order is worth. A number the admin can change, because
  // "what do I take on a typical order" has a different answer for a shop
  // selling $4 spice jars and one selling $400 suits.
  const [exampleValue, setExampleValue] = useState("50");
  const [exampleStore, setExampleStore] = useState("");
  const [exampleCategory, setExampleCategory] = useState("");

  const draft: CommissionSettings = useMemo(
    () => ({
      enabled,
      defaultPct: normalisePct(Number(defaultPct)),
      orderFee: Math.max(0, Number(orderFee) || 0),
      chargeOnDelivery,
      showToSellers,
      rules,
    }),
    [enabled, defaultPct, orderFee, chargeOnDelivery, showToSellers, rules],
  );

  const example = useMemo(() => {
    const value = Math.max(0, Number(exampleValue) || 0);
    const { pct, basis, rule } = rateFor(
      draft,
      exampleStore || undefined,
      exampleCategory || undefined,
    );
    const rate = (value * pct) / 100;
    const commission = Math.min(value, rate + (draft.enabled ? draft.orderFee : 0));
    return {
      value,
      pct,
      basis,
      rule,
      commission,
      payout: Math.max(0, value - commission),
      effective: value > 0 ? (commission / value) * 100 : 0,
    };
  }, [draft, exampleValue, exampleStore, exampleCategory]);

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now().toString(36)}${prev.length}`,
        store: stores[0]?.slug,
        category: undefined,
        pct: draft.defaultPct,
        active: true,
      },
    ]);
  }

  function update(id: string, patch: Partial<CommissionRule>) {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  function remove(id: string) {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
  }

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <input type="hidden" name="rulesJson" value={JSON.stringify(rules)} />

      {/* ── The switch ───────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
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
              Charge a commission on every sale
            </span>
            <span className="mt-0.5 block text-sm text-slate-500">
              While this is off, every seller keeps the full value of every
              order and no fee appears anywhere. Turning it on applies to
              orders as they are counted — including ones already placed.
            </span>
          </span>
        </label>
      </section>

      {/* ── Rates ────────────────────────────────────────────────── */}
      <section className={`card p-5 sm:p-6 ${enabled ? "" : "opacity-60"}`}>
        <h2 className="font-display font-bold text-ocean-950">💰 The base rate</h2>
        <p className="mt-1 text-sm text-slate-500">
          What the marketplace keeps when no override below applies.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Commission rate</span>
            <div className="relative">
              <input
                name="defaultPct"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={defaultPct}
                onChange={(e) => setDefaultPct(e.target.value)}
                className="input pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                %
              </span>
            </div>
            <span className="mt-1 block text-xs text-slate-400">
              Taken from the value of the goods on each order.
            </span>
          </label>

          <label className="block">
            <span className="label">Fixed fee per order</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                $
              </span>
              <input
                name="orderFee"
                type="number"
                min="0"
                step="0.01"
                value={orderFee}
                onChange={(e) => setOrderFee(e.target.value)}
                className="input pl-7"
              />
            </div>
            {/*
              Named for what it is for. Payment processing is charged per
              transaction, not per dollar, so a pure percentage loses money
              on small baskets however high the percentage goes.
            */}
            <span className="mt-1 block text-xs text-slate-400">
              Covers the per-transaction cost of taking payment. Leave at 0
              if you do not want one.
            </span>
          </label>
        </div>

        <div className="mt-4 space-y-3 border-t border-sand-100 pt-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="chargeOnDelivery"
              checked={chargeOnDelivery}
              onChange={(e) => setChargeOnDelivery(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-ocean-700"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-700">
                Also charge on the delivery fee
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Off by default. The seller collected that money to hand to a
                driver, so a cut of it is a cut of someone else&apos;s wage.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="showToSellers"
              checked={showToSellers}
              onChange={(e) => setShowToSellers(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-ocean-700"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-700">
                Show sellers the fee and their payout
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Recommended. A fee a seller only discovers when the money
                arrives short costs more in trust than it saves in questions.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* ── Overrides ────────────────────────────────────────────── */}
      <section className={`card p-5 sm:p-6 ${enabled ? "" : "opacity-60"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-ocean-950">🎯 Overrides</h2>
            <p className="mt-1 text-sm text-slate-500">
              Different rates for a store, a category, or one store&apos;s
              products in one category.
            </p>
          </div>
          <button type="button" onClick={addRule} className="btn-secondary !py-2 text-sm">
            + Add an override
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-sand-200 bg-sand-50 p-6 text-center">
            <p className="text-sm text-slate-500">
              Every sale is charged the base rate above.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Add an override when a brand has negotiated its own rate, or
              when a thin-margin category cannot carry the standard one.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-2xl border-2 p-4 transition ${
                  rule.active ? "border-sand-200 bg-white" : "border-sand-100 bg-sand-50"
                }`}
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_auto]">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">
                      Store
                    </span>
                    <select
                      value={rule.store ?? ""}
                      onChange={(e) => update(rule.id, { store: e.target.value || undefined })}
                      className="input !py-2 w-full text-sm"
                    >
                      <option value="">Every store</option>
                      {stores.map((store) => (
                        <option key={store.slug} value={store.slug}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">
                      Category
                    </span>
                    <select
                      value={rule.category ?? ""}
                      onChange={(e) => update(rule.id, { category: e.target.value || undefined })}
                      className="input !py-2 w-full text-sm"
                    >
                      <option value="">Every category</option>
                      {categories.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">
                      Rate %
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={rule.pct}
                      onChange={(e) => update(rule.id, { pct: Number(e.target.value) })}
                      className="input !py-2 text-sm"
                    />
                  </label>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => update(rule.id, { active: !rule.active })}
                      className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                        rule.active
                          ? "border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                          : "border-slate-300 text-slate-400 hover:bg-sand-100"
                      }`}
                    >
                      {rule.active ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(rule.id)}
                      className="rounded-full border border-coral-500 px-3 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <input
                  value={rule.note ?? ""}
                  onChange={(e) => update(rule.id, { note: e.target.value })}
                  placeholder="Why this rate exists — e.g. “Agreed at signing, review Jan 2027”"
                  className="input !py-2 mt-3 w-full text-sm"
                />

                {!rule.store && !rule.category && (
                  <p className="mt-2 text-xs font-semibold text-coral-600">
                    Pick a store or a category — a rule covering everything is
                    just the base rate.
                  </p>
                )}
              </div>
            ))}

            <p className="text-xs text-slate-400">
              The most specific rule wins, whatever order they are in here:
              store + category, then store, then category, then the base rate.
            </p>
          </div>
        )}
      </section>

      {/* ── Worked example ───────────────────────────────────────── */}
      <section className="card border-2 border-ocean-100 bg-ocean-50/40 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🧮 What that comes to</h2>
        <p className="mt-1 text-sm text-slate-500">
          Live, against the rules above — before you save.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              An order worth
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                $
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={exampleValue}
                onChange={(e) => setExampleValue(e.target.value)}
                className="input !py-2 pl-7 text-sm"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">from</span>
            <select
              value={exampleStore}
              onChange={(e) => setExampleStore(e.target.value)}
              className="input !py-2 w-full text-sm"
            >
              <option value="">Any store</option>
              {stores.map((store) => (
                <option key={store.slug} value={store.slug}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">in</span>
            <select
              value={exampleCategory}
              onChange={(e) => setExampleCategory(e.target.value)}
              className="input !py-2 w-full text-sm"
            >
              <option value="">Any category</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 ring-1 ring-sand-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              You keep
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ocean-950">
              {money(example.commission)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {example.effective.toFixed(1)}% of the order
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-sand-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              The seller gets
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-emerald-700">
              {money(example.payout)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">paid out</p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-sand-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rate applied
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ocean-950">
              {enabled ? `${example.pct}%` : "—"}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {!enabled
                ? "commission is off"
                : example.basis === "default"
                  ? "the base rate"
                  : `override · ${example.basis.replace("+", " + ")}`}
            </p>
          </div>
        </div>

        {/*
          The small-order warning. A flat fee is invisible in a form and
          brutal at the bottom of the range — this is the number that starts
          the argument with a seller, so it is said here first.
        */}
        {enabled && draft.orderFee > 0 && example.value > 0 && example.effective > draft.defaultPct + 5 && (
          <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-xs text-mango-900">
            ⚠ On an order this size the fixed {money(draft.orderFee)} fee dominates:
            the seller is really paying {example.effective.toFixed(1)}%, not{" "}
            {example.pct}%. Worth checking against your smallest typical basket.
          </p>
        )}
      </section>

      {/* ── Save ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Saving…" : "Save commission settings"}
        </button>
        {state.message && (
          <p
            role="status"
            className={`text-sm font-semibold ${
              state.ok ? "text-emerald-700" : "text-coral-700"
            }`}
          >
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
