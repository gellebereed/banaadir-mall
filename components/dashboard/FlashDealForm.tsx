"use client";

import { useActionState } from "react";
import { updateFlashDeal, type SaveState } from "@/app/actions";
import ProductPicker from "./ProductPicker";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import type { Category, Product, Store } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Flash-deal campaign editor: name, countdown target, and the product
 * picker (searchable, filterable by category and store) that decides which
 * products appear in the rail.
 */
export default function FlashDealForm({
  flash,
  products,
  categories,
  stores,
}: {
  flash: { active: boolean; name: string; endsAt: string; productIds: string[] };
  products: Product[];
  categories: Category[];
  stores: Store[];
}) {
  const [state, formAction] = useActionState(updateFlashDeal, INITIAL);
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="mt-4 space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr_240px]">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-sand-200 px-4 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="active" defaultChecked={flash.active} className="h-4 w-4 accent-ocean-700" />
          Active
        </label>
        <div>
          <label htmlFor="flash-name" className="label">Campaign name</label>
          <input id="flash-name" name="name" defaultValue={flash.name} placeholder="Flash Deals" className="input" />
        </div>
        <div>
          <label htmlFor="flash-ends" className="label">
            Countdown ends{" "}
            <span className="font-normal text-slate-400">(blank = midnight)</span>
          </label>
          <input id="flash-ends" name="endsAt" type="datetime-local" defaultValue={flash.endsAt} className="input" />
        </div>
      </div>

      <div>
        <span className="label">Products in the campaign</span>
        <ProductPicker
          products={products}
          categories={categories}
          stores={stores}
          initial={flash.productIds}
        />
        <p className="mt-2 text-xs text-slate-400">
          Leave empty to fall back to whatever is currently on sale.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <SubmitButton>Save Campaign</SubmitButton>
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
