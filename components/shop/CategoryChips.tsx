"use client";

import { useMemo, useState } from "react";

export interface ChipOption {
  slug: string;
  name: string;
  count: number;
  icon?: string;
  /** The department it sits under, used to group the full list. */
  parentName?: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE QUICK CUT — a chip row that survives a real catalogue.
 * ─────────────────────────────────────────────────────────────────────────
 * This row used to render EVERY category present in the results. With a
 * demo catalogue that was a tidy dozen pills. One supplier import later it
 * is eighty-four, wrapping into six dense lines that push the products
 * themselves below the fold — and the more categories a marketplace has,
 * the worse the control for choosing between them gets. A filter that
 * degrades as the shop succeeds is the wrong shape.
 *
 * So: the biggest few are chips, and the rest are one click away behind a
 * searchable panel grouped by department.
 *
 * ── Three rules that make it work ────────────────────────────────────────
 *  1. The chips are the BIGGEST categories, not the first alphabetically.
 *     On this catalogue eight chips already cover most of the products, so
 *     the common cut stays one tap away.
 *  2. The selected category is ALWAYS a visible chip, even when it is the
 *     smallest in the shop. A filter you cannot see is a filter you cannot
 *     undo.
 *  3. Past a threshold the panel gets a search box, because scanning
 *     eighty names is not meaningfully better than scrolling a wall of
 *     pills — typing three letters is.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** How many chips stay on the row. Enough to cover the common cuts. */
const VISIBLE_CHIPS = 8;
/** Past this many, the panel earns a search box. */
const SEARCHABLE_FROM = 12;

export default function CategoryChips({
  options,
  activeSlug,
  onSelect,
  allLabel = "All",
  allCount,
}: {
  /** Already sorted by whatever "most useful first" means to the caller. */
  options: ChipOption[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  allLabel?: string;
  allCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { chips, hidden } = useMemo(() => {
    const top = options.slice(0, VISIBLE_CHIPS);
    const rest = options.slice(VISIBLE_CHIPS);

    // Rule 2 — the active one is promoted onto the row if it isn't there.
    const activeInRest = rest.find((o) => o.slug === activeSlug);
    return {
      chips: activeInRest ? [...top, activeInRest] : top,
      hidden: activeInRest ? rest.filter((o) => o.slug !== activeSlug) : rest,
    };
  }, [options, activeSlug]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? options : hidden;
    return q
      ? pool.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.parentName ?? "").toLowerCase().includes(q),
      )
      : pool;
  }, [query, options, hidden]);

  /** The panel list, grouped under the department each category sits in. */
  const grouped = useMemo(() => {
    const byParent = new Map<string, ChipOption[]>();
    for (const option of matches) {
      const key = option.parentName ?? "Other";
      const list = byParent.get(key);
      if (list) list.push(option);
      else byParent.set(key, [option]);
    }
    return [...byParent.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches]);

  function choose(slug: string | null) {
    onSelect(slug);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={activeSlug === null} onClick={() => choose(null)} label={allLabel} count={allCount} />

        {chips.map((option) => (
          <Chip
            key={option.slug}
            active={activeSlug === option.slug}
            onClick={() => choose(activeSlug === option.slug ? null : option.slug)}
            label={option.icon ? `${option.icon} ${option.name}` : option.name}
            count={option.count}
          />
        ))}

        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              open
                ? "border-ocean-400 bg-ocean-50 text-ocean-800"
                : "border-dashed border-sand-300 bg-white text-slate-500 hover:border-ocean-400 hover:text-ocean-700"
            }`}
          >
            {open ? "Close" : `+${hidden.length} more`}
            <span aria-hidden className="text-[10px]">
              {open ? "▲" : "▼"}
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-sm">
          {options.length >= SEARCHABLE_FROM && (
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${options.length} categories…`}
              aria-label="Search categories"
              className="input mb-3 !py-2"
            />
          )}

          {grouped.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              Nothing matches “{query}”.
            </p>
          ) : (
            <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
              {grouped.map(([parent, list]) => (
                <div key={parent}>
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    {parent}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((option) => (
                      <Chip
                        key={option.slug}
                        active={activeSlug === option.slug}
                        onClick={() => choose(option.slug)}
                        label={option.icon ? `${option.icon} ${option.name}` : option.name}
                        count={option.count}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-ocean-700 text-white"
          : "border border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
      )}
    </button>
  );
}
