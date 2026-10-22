"use client";

import { useRef, useState } from "react";
import type { OfferSuggestion } from "@/lib/offer-suggestions";
import type { Category, Product } from "@/lib/types";
import OfferBuilder from "./OfferBuilder";

/**
 * Suggestions worked out from the shop's own numbers, above the builder.
 * "Use this" loads one into the builder and scrolls to it.
 */
export default function OfferStudio({
  products,
  categories,
  suggestions,
}: {
  products: Product[];
  categories: Category[];
  suggestions: OfferSuggestion[];
}) {
  const [preset, setPreset] = useState<(OfferSuggestion & { nonce: number }) | undefined>();
  const builder = useRef<HTMLDivElement>(null);

  return (
    <>
      {suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">💡 Suggested for your shop</p>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className={`flex flex-col rounded-2xl border p-4 ${
                  preset?.id === s.id ? "border-emerald-400 bg-emerald-50/60" : "border-mango-500/30 bg-mango-500/5"
                }`}
              >
                <p className="flex items-start gap-2 text-sm font-bold text-ocean-950">
                  <span aria-hidden>{s.icon}</span>
                  {s.title}
                </p>
                <p className="mt-1 flex-1 text-xs leading-snug text-slate-600">{s.why}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPreset({ ...s, nonce: Date.now() });
                    requestAnimationFrame(() => builder.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }}
                  className="mt-3 self-start rounded-full bg-ocean-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-ocean-800"
                >
                  Use this →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div ref={builder} className="scroll-mt-24">
        <OfferBuilder products={products} categories={categories} preset={preset} />
      </div>
    </>
  );
}
