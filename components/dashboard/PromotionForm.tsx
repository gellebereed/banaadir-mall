"use client";

import { useActionState, useState } from "react";
import { createPromotion, type SaveState } from "@/app/actions";
import ProductPicker from "./ProductPicker";
import SubmitButton from "./SubmitButton";
import { money } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Create a promotion. Uses useActionState + router.refresh so a new
 * promotion appears in the list straight away — it previously needed a
 * manual page refresh to show up.
 */
export default function PromotionForm({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  /**
   * No router.refresh() here on purpose. Calling it the moment the action
   * resolves aborts the action's own still-streaming response (the POST
   * ends in ERR_ABORTED), which left the button stuck on "Launching…" and
   * the new promotion missing until a manual reload. The action revalidates
   * the promotions cache tag, so the response it streams back already
   * carries the updated list.
   */
  const [state, formAction] = useActionState(createPromotion, INITIAL);

  const [scope, setScope] = useState<"store" | "products">("store");
  const [pct, setPct] = useState(15);

  // Live worked example so the seller sees the real effect before saving.
  const sample = products[0];
  const samplePrice = sample ? sample.price : 0;
  const discounted = Math.round(samplePrice * (1 - pct / 100) * 100) / 100;

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label htmlFor="promo-name" className="label">Name</label>
          <input id="promo-name" name="name" required placeholder="e.g. Weekend Flash Sale" className="input" />
        </div>
        <div>
          <label htmlFor="promo-pct" className="label">Discount %</label>
          <input
            id="promo-pct"
            name="pct"
            required
            type="number"
            min="1"
            max="90"
            value={pct}
            onChange={(e) => setPct(Number(e.target.value) || 0)}
            className="input"
          />
        </div>
      </div>

      {sample && pct > 0 && pct <= 90 && (
        <p className="rounded-xl bg-ocean-50 px-4 py-2.5 text-xs text-ocean-900">
          Example — <strong>{sample.name}</strong> would go from{" "}
          <span className="line-through">{money(samplePrice)}</span>{" "}
          to <strong className="text-coral-600">{money(discounted)}</strong>.
        </p>
      )}

      {/* Scope */}
      <div>
        <span className="label">Applies to</span>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["store", "🏪 Entire store", "Every product you sell"],
              ["products", "🎯 Selected products", "Pick exactly which ones"],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition ${
                scope === value
                  ? "border-ocean-700 bg-ocean-50"
                  : "border-sand-200 bg-white hover:border-ocean-300"
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
                className="mt-0.5 h-4 w-4 accent-ocean-700"
              />
              <span>
                <span className="block text-sm font-bold text-ocean-950">{title}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {scope === "products" && (
          <div className="mt-3">
            <ProductPicker products={products} categories={categories} />
          </div>
        )}
      </div>

      {/* Optional schedule */}
      <details className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
        <summary className="cursor-pointer text-sm font-bold text-ocean-800">
          🗓️ Schedule it (optional)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Leave empty to start immediately and run until you pause it.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="promo-start" className="label">Starts</label>
            <input id="promo-start" name="startsAt" type="datetime-local" className="input" />
          </div>
          <div>
            <label htmlFor="promo-end" className="label">Ends</label>
            <input id="promo-end" name="endsAt" type="datetime-local" className="input" />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Launching…">Launch Promotion</SubmitButton>
        {state.message && (
          <span
            className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}
          >
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
