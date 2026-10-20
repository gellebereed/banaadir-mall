"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";

export interface SetupStep {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FIRST WEEK — what a new store should do, in the order that sells.
 * ─────────────────────────────────────────────────────────────────────────
 * A store used to be approved straight into a dashboard of zeroes, with
 * nothing saying what to do first. Sellers found the logo upload weeks
 * later, left WhatsApp empty (so orders went to the platform's number),
 * and listed products without photos.
 *
 * Each step is worked out from the store itself — nothing to tick by hand
 * — and links straight to where it is done. The list disappears once
 * everything is done; it can also be hidden early, per store, on this
 * device.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function SetupChecklist({ storeSlug, steps }: { storeSlug: string; steps: SetupStep[] }) {
  const key = `banaadir_setup_hidden_${storeSlug}`;
  const [hidden, setHidden] = useState(true); // avoid a flash before storage is read

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);

  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-sand-100 bg-gradient-to-r from-ocean-50 to-white p-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold text-ocean-950">Get your store ready to sell</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {done} of {steps.length} done{next ? ` · Next: ${next.label}` : ""}
          </p>
          <div className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-sand-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(key, "1");
            } catch {}
          }}
          aria-label="Hide this checklist"
          title="Hide this checklist"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-sand-100">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={`flex items-center gap-3 px-5 py-3.5 transition hover:bg-sand-50 ${
                step.key === next?.key ? "bg-mango-50/40" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  step.done ? "bg-emerald-500 text-white" : "border-2 border-sand-200 bg-white"
                }`}
              >
                {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${step.done ? "text-slate-400 line-through" : "text-slate-800"}`}
                >
                  {step.label}
                </span>
                {!step.done && <span className="block text-xs text-slate-500">{step.hint}</span>}
              </span>
              {!step.done && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
