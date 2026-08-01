"use client";

import { useState } from "react";
import ProductPicker from "./ProductPicker";
import type { Category, Product } from "@/lib/types";

/**
 * Lets a seller choose whether a promotion covers the whole store or only
 * selected products. The chosen product ids submit as `productIds`.
 */
export default function PromotionScopePicker({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const [scope, setScope] = useState<"store" | "products">("store");

  return (
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
  );
}
