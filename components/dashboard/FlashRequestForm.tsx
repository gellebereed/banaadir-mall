"use client";

import { useActionState } from "react";
import { requestFlashDeal, type SaveState } from "@/app/actions";
import ProductPicker from "./ProductPicker";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import type { Category, Product } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Sellers apply to the flash-deal campaign with as many products as they
 * like at once, all offered at the same discount.
 */
export default function FlashRequestForm({
  products,
  categories,
}: {
  /** Products without an open application. */
  products: Product[];
  categories: Category[];
}) {
  const [state, formAction] = useActionState(requestFlashDeal, INITIAL);
  useRefreshOnSuccess(state);

  if (products.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-sand-100 px-4 py-3 text-sm text-slate-600">
        Every product already has an open application.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <span className="label">Products to apply with</span>
        <ProductPicker products={products} categories={categories} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <div>
          <label htmlFor="pct" className="label">Discount %</label>
          <input id="pct" name="pct" type="number" min="1" max="90" defaultValue={20} className="input" />
        </div>
        <div>
          <label htmlFor="note" className="label">
            Note to the team <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="note" name="note" placeholder="e.g. we have 200 units ready to ship" className="input" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Submitting…">Submit Application</SubmitButton>
        {state.message && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}>
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
