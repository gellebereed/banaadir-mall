"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fileHeldProducts } from "@/app/admin/categories/holding-actions";
import SearchableSelect, { type SelectOption } from "@/components/dashboard/SearchableSelect";

export interface HeldGroup {
  key: string;
  store: string;
  storeName: string;
  grouping: string;
  count: number;
  samples: string[];
  suggestion?: { slug: string; name: string; score: number };
}

/**
 * The "Needs a category" queue — products an import couldn't file, grouped
 * by store and the supplier's own grouping, with a suggested home. Filing
 * a group also teaches the importer, so it doesn't come back.
 */
export default function HoldingQueue({ groups, options }: { groups: HeldGroup[]; options: SelectOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>(
    Object.fromEntries(groups.map((g) => [g.key, g.suggestion && g.suggestion.score >= 70 ? g.suggestion.slug : ""])),
  );
  const [result, setResult] = useState<Record<string, { ok?: string; error?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.count, 0);

  return (
    <section className="card mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ocean-950">📥 Needs a category</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {total} imported product{total === 1 ? "" : "s"} the seller didn&apos;t match to a category.
            File each group once — the store&apos;s next import of the same group files itself.
            Missing the right category? Add it below first, then file.
          </p>
        </div>
        <span className="rounded-full bg-mango-100 px-3 py-1 text-xs font-bold text-mango-800">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-sand-100 rounded-2xl border border-sand-200">
        {groups.map((g) => (
          <li key={g.key} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{g.grouping || "No supplier grouping"}</p>
              <p className="truncate text-xs text-slate-500">
                {g.storeName} · {g.count} product{g.count === 1 ? "" : "s"} · e.g. {g.samples.join(", ")}
              </p>
              {g.suggestion && (
                <p className="text-xs text-ocean-700">Suggested: {g.suggestion.name}</p>
              )}
              {result[g.key] && (
                <p className={`mt-1 text-xs font-semibold ${result[g.key].ok ? "text-emerald-700" : "text-coral-600"}`}>
                  {result[g.key].ok ?? result[g.key].error}
                </p>
              )}
            </div>
            <SearchableSelect
              name={`file-${g.key}`}
              defaultValue={picked[g.key]}
              onChange={(value) => setPicked((prev) => ({ ...prev, [g.key]: value }))}
              placeholder="Choose a category"
              searchPlaceholder="Type to find a category…"
              options={options}
            />
            <button
              type="button"
              disabled={pending || !picked[g.key]}
              onClick={() => {
                setBusy(g.key);
                start(async () => {
                  const res = await fileHeldProducts(g.store, g.grouping, picked[g.key]);
                  setResult((prev) => ({ ...prev, [g.key]: res }));
                  setBusy(null);
                  if (res.ok) router.refresh();
                });
              }}
              className="rounded-full bg-ocean-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-ocean-700 disabled:opacity-40"
            >
              {busy === g.key ? "Filing…" : `File ${g.count}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
