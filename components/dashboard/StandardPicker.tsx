"use client";

import { useEffect, useRef, useState } from "react";
import { searchStandardAction, type StandardOption } from "@/app/admin/categories/standard-actions";

/**
 * Search the standard taxonomy and pick one node. Posts the choice as a
 * hidden `name` input (default "standardId"), like SearchableSelect.
 *
 * The 4,000-node list lives on the server (lib/taxonomy.ts); shipping it to
 * the browser for a picker opened a few times a month isn't worth 180KB.
 */
export default function StandardPicker({
  name = "standardId",
  initial,
  onChange,
  autoFocus,
}: {
  name?: string;
  initial?: StandardOption | null;
  onChange?: (option: StandardOption | null) => void;
  autoFocus?: boolean;
}) {
  const [chosen, setChosen] = useState<StandardOption | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardOption[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    // Debounced, and only the latest answer is shown — a slow early search
    // must not overwrite the results for what the admin has typed since.
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchStandardAction(q);
      if (mine === seq.current) {
        setResults(found);
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (option: StandardOption | null) => {
    setChosen(option);
    setQuery("");
    setResults([]);
    onChange?.(option);
  };

  return (
    <div>
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-sm text-emerald-900">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-600">Standard category</span>
            {chosen.path}
          </p>
          <button
            type="button"
            onClick={() => choose(null)}
            className="shrink-0 text-xs font-semibold text-emerald-700 underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="search"
            value={query}
            autoFocus={autoFocus}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter picks the top result rather than submitting the form.
              if (e.key === "Enter") {
                e.preventDefault();
                if (results[0]) choose(results[0]);
              }
            }}
            placeholder="Search the standard list, e.g. dresses, cookware, phones"
            className="input"
          />
          {(results.length > 0 || searching) && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-sand-200 bg-white py-1 shadow-lg">
              {searching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>
              )}
              {results.map((r) => {
                const parts = r.path.split(" › ");
                const leaf = parts.pop();
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => choose(r)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-sand-50"
                    >
                      <span className="font-semibold text-ocean-950">{leaf}</span>
                      {parts.length > 0 && (
                        <span className="block text-xs text-slate-400">{parts.join(" › ")}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">Nothing matches — try a broader word.</p>
          )}
        </div>
      )}
    </div>
  );
}
