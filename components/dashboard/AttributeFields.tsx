"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttributeDef, AttributeSets } from "@/lib/taxonomy-attributes";

/** Up to this many values are shown as tap-to-toggle chips; longer lists get a search. */
const CHIP_LIMIT = 14;

/**
 * The standard attributes of the product's category — Fabric, Neckline,
 * Operating system… — picked from fixed lists, which is what lets shoppers
 * filter across every store at once. Follows the category picked in the
 * same form; posts everything as `attributesJson` (the server drops what
 * the final category doesn't have).
 */
export default function AttributeFields({
  category,
  sets,
  initial,
  incoming,
  onFilledChange,
}: {
  category: string;
  sets: AttributeSets;
  initial?: Record<string, string[]>;
  /** Suggested values to merge in (✨ Suggest); a new nonce applies them again. */
  incoming?: { values: Record<string, string[]>; nonce: number } | null;
  /** How many of this category's attributes have a value — for the checklist. */
  onFilledChange?: (filled: number, total: number) => void;
}) {
  const [values, setValues] = useState<Record<string, string[]>>(initial ?? {});
  const attrs = useMemo(
    () => (sets.byCategory[category] ?? []).map((h) => sets.defs[h]).filter(Boolean),
    [category, sets],
  );
  const filled = attrs.filter((a) => values[a.handle]?.length).length;

  // Added to what the seller already picked, never replacing it.
  useEffect(() => {
    if (!incoming) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [handle, keys] of Object.entries(incoming.values)) {
        next[handle] = [...new Set([...(prev[handle] ?? []), ...keys])];
      }
      return next;
    });
  }, [incoming]);

  useEffect(() => onFilledChange?.(filled, attrs.length), [filled, attrs.length, onFilledChange]);

  const toggle = (handle: string, key: string) =>
    setValues((prev) => {
      const current = prev[handle] ?? [];
      return {
        ...prev,
        [handle]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
      };
    });

  return (
    <div>
      <input type="hidden" name="attributesJson" value={JSON.stringify(values)} />
      {!category ? (
        <p className="text-sm text-slate-400">Choose a category first — the details asked for depend on it.</p>
      ) : attrs.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing extra to fill in for this category yet. Colour and size come from Options &amp; stock.
        </p>
      ) : (
        <div className="space-y-5">
          {attrs.map((attr) => (
            <AttributeRow
              key={attr.handle}
              attr={attr}
              selected={values[attr.handle] ?? []}
              onToggle={(key) => toggle(attr.handle, key)}
            />
          ))}
          <p className="text-xs text-slate-400">
            Optional, but each one is a filter shoppers use to find this product. Colour and size
            are taken from Options &amp; stock.
          </p>
        </div>
      )}
    </div>
  );
}

function AttributeRow({
  attr,
  selected,
  onToggle,
}: {
  attr: AttributeDef;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const name = (key: string) => attr.values.find((v) => v.key === key)?.name ?? key;
  const chip = (key: string, active: boolean) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(key)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-ocean-700 text-white"
          : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
      }`}
    >
      {active && "✓ "}
      {name(key)}
    </button>
  );

  if (attr.values.length <= CHIP_LIMIT) {
    return (
      <fieldset>
        <legend className="label">{attr.name}</legend>
        <div className="flex flex-wrap gap-1.5">
          {attr.values.map((v) => chip(v.key, selected.includes(v.key)))}
        </div>
      </fieldset>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? attr.values.filter((v) => v.name.toLowerCase().includes(q) && !selected.includes(v.key)).slice(0, 12)
    : [];
  return (
    <fieldset>
      <legend className="label">{attr.name}</legend>
      {selected.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{selected.map((k) => chip(k, true))}</div>}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter picks the first match rather than submitting the product.
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0]) {
              onToggle(matches[0].key);
              setQuery("");
            }
          }
        }}
        placeholder={`Search ${attr.values.length} options, e.g. ${attr.values
          .slice(0, 2)
          .map((v) => v.name)
          .join(", ")}`}
        className="input !py-2 text-sm"
        aria-label={`Search ${attr.name}`}
      />
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                onToggle(v.key);
                setQuery("");
              }}
              className="rounded-full border border-dashed border-ocean-300 bg-ocean-50 px-3 py-1 text-xs font-semibold text-ocean-800 hover:bg-ocean-100"
            >
              + {v.name}
            </button>
          ))}
        </div>
      )}
      {q && matches.length === 0 && <p className="mt-1 text-xs text-slate-400">No option matches.</p>}
    </fieldset>
  );
}
