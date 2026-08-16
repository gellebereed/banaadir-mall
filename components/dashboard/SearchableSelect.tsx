"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SEARCHABLE SELECT — a dropdown that stays usable past twenty options.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why a native <select> stopped working here ───────────────────────────
 * It was fine when this marketplace had eight categories. A supplier import
 * took it past two hundred, and a native select with two hundred options is
 * a full-screen scrolling column with no search: the only way to find
 * "Bedding Pillowcase Sets" is to scroll, or to know that typing "b"
 * repeatedly cycles through everything starting with b. On a phone it is
 * worse — the wheel picker shows four options at a time out of two hundred.
 *
 * So: a button, a panel that is never taller than the screen, and a search
 * box that is focused the moment it opens. Type three letters, press Enter.
 *
 * ── It still posts like a <select> ───────────────────────────────────────
 * The value travels in a hidden input with the given `name`, so every form
 * this drops into keeps working with no server change at all. That is the
 * whole reason it was built this shape rather than as a controlled field
 * every caller has to wire up.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered before the label — an emoji, usually. */
  icon?: string;
  /** Small grey text after the label: a parent's name, a price, a code. */
  hint?: string;
  /** Indentation level, for a tree flattened into a list. */
  depth?: number;
}

export default function SearchableSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Choose one…",
  searchPlaceholder = "Type to search…",
  required = false,
  id,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  id?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    /*
     * Matches that START with the query come first.
     *
     * Typing "bed" should offer "Bedding Pillows" before "Kids Bedroom",
     * and a plain `includes` filter puts them in whatever order the
     * catalogue happens to be in — which is how you end up scrolling a
     * filtered list, having already told it what you wanted.
     */
    const starts: SelectOption[] = [];
    const contains: SelectOption[] = [];
    for (const option of options) {
      const label = option.label.toLowerCase();
      if (label.startsWith(q)) starts.push(option);
      else if (label.includes(q) || option.hint?.toLowerCase().includes(q)) {
        contains.push(option);
      }
    }
    return [...starts, ...contains];
  }, [options, query]);

  // Reopening should not resume in the middle of the previous search.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(Math.max(0, options.findIndex((option) => option.value === value)));
      // The panel is useless without the caret in the search box.
      requestAnimationFrame(() => search.current?.focus());
    }
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const row = list.current?.children[active] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(option: SelectOption) {
    setValue(option.value);
    onChange?.(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(matches.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = matches[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapper} className="relative">
      {/* What the form actually posts. */}
      <input type="hidden" name={name} value={value} required={required} />

      <button
        type="button"
        id={id}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`flex min-w-0 items-center gap-2 ${selected ? "" : "text-slate-400"}`}>
          {selected?.icon && <span aria-hidden>{selected.icon}</span>}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[10px] text-slate-400">
          ▼
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-sand-200 bg-white shadow-2xl shadow-ocean-950/15">
          <div className="border-b border-sand-100 p-2">
            <input
              ref={search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-sand-200 px-3 py-2 text-sm outline-none focus:border-ocean-500"
            />
          </div>

          {matches.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Nothing matches “{query}”.
            </p>
          ) : (
            /* Capped, so the panel never runs off the bottom of the screen —
               the original complaint about the native control. */
            <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {matches.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => choose(option)}
                      onMouseEnter={() => setActive(index)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                        index === active ? "bg-ocean-50" : ""
                      } ${isSelected ? "font-bold text-ocean-800" : "text-slate-700"}`}
                      style={{ paddingLeft: `${12 + (option.depth ?? 0) * 14}px` }}
                    >
                      {option.icon && (
                        <span aria-hidden className="shrink-0">
                          {option.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint && (
                        <span className="shrink-0 truncate text-xs text-slate-400">
                          {option.hint}
                        </span>
                      )}
                      {isSelected && <span aria-hidden className="shrink-0 text-ocean-600">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {options.length > 12 && (
            <p className="border-t border-sand-100 bg-sand-50 px-3 py-1.5 text-[11px] text-slate-400">
              {matches.length} of {options.length} · ↑↓ to move, Enter to pick
            </p>
          )}
        </div>
      )}
    </div>
  );
}
