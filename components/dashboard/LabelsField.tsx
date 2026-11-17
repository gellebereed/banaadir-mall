"use client";

import { useState } from "react";
import { MAX_LABELS_PER_PRODUCT, tidyLabels } from "@/lib/labels";

/**
 * The seller's private labels on one product (lib/labels.ts): chips, a box
 * to type a new one, and the store's existing labels one tap away so
 * "Clearance" is never typed three different ways.
 *
 * Posts `labelsJson`. Always posted — an empty list is how the last label
 * comes off.
 */
export default function LabelsField({
  defaultValue = [],
  known = [],
}: {
  defaultValue?: string[];
  /** Labels already used in this store. */
  known?: string[];
}) {
  const [labels, setLabels] = useState<string[]>(() => tidyLabels(defaultValue, known));
  const [draft, setDraft] = useState("");
  const full = labels.length >= MAX_LABELS_PER_PRODUCT;

  const add = (raw: string) => {
    const next = tidyLabels([...labels, raw], known);
    setLabels(next);
    setDraft("");
  };
  const remove = (label: string) => setLabels(labels.filter((l) => l !== label));

  const has = (l: string) => labels.some((x) => x.toLowerCase() === l.toLowerCase());
  const suggestions = known.filter((l) => !has(l));

  return (
    <div>
      <label htmlFor="labels-input" className="label">
        Labels <span className="font-normal text-slate-400">(private — only you see them)</span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-sand-200 bg-white p-2 focus-within:border-ocean-400">
        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 rounded-full bg-ocean-50 py-1 pl-2.5 pr-1 text-xs font-bold text-ocean-800 ring-1 ring-ocean-100"
          >
            🏷️ {l}
            <button
              type="button"
              onClick={() => remove(l)}
              aria-label={`Remove label ${l}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ocean-600 hover:bg-ocean-100"
            >
              ×
            </button>
          </span>
        ))}
        {!full && (
          <input
            id="labels-input"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              // A comma finishes a label, the way people type lists.
              if (v.includes(",")) add(v.replace(/,/g, ""));
              else setDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter adds the label; it must not submit the whole product.
                e.preventDefault();
                if (draft.trim()) add(draft);
              } else if (e.key === "Backspace" && !draft && labels.length) {
                remove(labels[labels.length - 1]);
              }
            }}
            onBlur={() => draft.trim() && add(draft)}
            placeholder={labels.length ? "Add another…" : "e.g. Clearance, Winter 2026"}
            className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
          />
        )}
      </div>
      {suggestions.length > 0 && !full && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 12).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => add(l)}
              className="rounded-full border border-dashed border-sand-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-ocean-300 hover:text-ocean-800"
            >
              + {l}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-slate-500">
        Group products your own way. Shoppers never see labels; promotions can include or leave out
        everything with a label.
      </p>
      <input type="hidden" name="labelsJson" value={JSON.stringify(labels)} />
    </div>
  );
}
