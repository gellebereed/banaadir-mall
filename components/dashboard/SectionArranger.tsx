"use client";

import { useActionState, useState } from "react";
import { updateSections, type SaveState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import type { HomeSection, SectionKey } from "@/lib/types";

const LABELS: Record<SectionKey, { name: string; hint: string }> = {
  banners: { name: "🖼️ Banner carousel", hint: "Your big promotional banners" },
  promoTiles: { name: "🏷️ Campaign tiles", hint: "Discount tiles strip" },
  categories: { name: "📱 Category circles", hint: "Shop by category" },
  brands: { name: "🏆 Official brand stores", hint: "Franchised brands" },
  flash: { name: "⚡ Flash deals", hint: "Countdown campaign rail" },
  value: { name: "🚚 Trust badges", hint: "Delivery, payment, returns" },
  trending: { name: "🔥 Trending now", hint: "Bestselling products" },
  stores: { name: "🏪 Featured stores", hint: "Local seller spotlight" },
  new: { name: "✨ Just landed", hint: "Newest products" },
};

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Drag-free section arranger: move sections up/down and toggle them on or
 * off. The order of this list is the order of the home page.
 */
export default function SectionArranger({ initial }: { initial: HomeSection[] }) {
  const [sections, setSections] = useState<HomeSection[]>(initial);
  const [state, formAction] = useActionState(updateSections, INITIAL);
  useRefreshOnSuccess(state);

  function move(index: number, delta: number) {
    setSections((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggle(key: SectionKey) {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s)),
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="sectionsJson" value={JSON.stringify(sections)} />

      <ol className="space-y-2">
        {sections.map((section, i) => (
          <li
            key={section.key}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
              section.visible
                ? "border-sand-200 bg-white"
                : "border-dashed border-sand-200 bg-sand-50 opacity-60"
            }`}
          >
            <span className="font-display text-sm font-extrabold text-slate-300">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ocean-950">
                {LABELS[section.key].name}
              </p>
              <p className="text-xs text-slate-400">{LABELS[section.key].hint}</p>
            </div>

            <button
              type="button"
              onClick={() => toggle(section.key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                section.visible
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-sand-100 text-slate-500 hover:bg-sand-200"
              }`}
            >
              {section.visible ? "Visible" : "Hidden"}
            </button>

            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move section up"
                className="px-2 text-xs text-slate-400 hover:text-ocean-700 disabled:opacity-25"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === sections.length - 1}
                aria-label="Move section down"
                className="px-2 text-xs text-slate-400 hover:text-ocean-700 disabled:opacity-25"
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-4">
        <SubmitButton>Save Layout</SubmitButton>
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
