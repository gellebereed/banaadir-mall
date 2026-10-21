"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fileHeldProducts, suggestHeldCategory } from "@/app/admin/categories/holding-actions";
import SearchableSelect, { type SelectOption } from "@/components/dashboard/SearchableSelect";

export interface HeldGroup {
  key: string;
  store: string;
  storeName: string;
  grouping: string;
  count: number;
  samples: string[];
  suggestion?: {
    slug: string;
    name: string;
    score: number;
    /** "name": the grouping's name matches a category; "products": its products do. */
    source: "name" | "products";
  };
}

type Note = { tone: "ok" | "error" | "ai"; text: string };

/**
 * The "Needs a category" queue — products an import couldn't file, grouped
 * by store and the supplier's own grouping, with a suggested home. Filing
 * a group also teaches the importer, so it doesn't come back.
 *
 * Suggestions only ever pre-select; filing is always the admin's click —
 * one group at a time, or "File all chosen" once they've looked down the list.
 */
export default function HoldingQueue({
  groups,
  options,
  ai = false,
}: {
  groups: HeldGroup[];
  options: SelectOption[];
  /** Whether "✨ Ask AI" is offered (ANTHROPIC_API_KEY set). */
  ai?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Only the strong kind of suggestion is pre-selected.
  const [picked, setPicked] = useState<Record<string, string>>(
    Object.fromEntries(
      groups.map((g) => [g.key, g.suggestion?.source === "name" && g.suggestion.score >= 70 ? g.suggestion.slug : ""]),
    ),
  );
  /** Bumped to re-mount a row's dropdown when its value is set from outside. */
  const [version, setVersion] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.count, 0);
  const chosen = groups.filter((g) => picked[g.key]);
  const note = (key: string, value: Note) => setNotes((prev) => ({ ...prev, [key]: value }));

  const choose = (key: string, slug: string) => {
    setPicked((prev) => ({ ...prev, [key]: slug }));
    setVersion((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  async function askAi(g: HeldGroup) {
    const res = await suggestHeldCategory(g.store, g.grouping);
    if (res.slug) {
      choose(g.key, res.slug);
      note(g.key, { tone: "ai", text: `✨ ${res.name}${res.reason ? ` — ${res.reason}` : ""}` });
    }
    if (res.error) note(g.key, { tone: "error", text: res.error });
  }

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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ai && (progress || groups.some((g) => !picked[g.key])) && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                // One group per request: each stays well inside the host's time limit.
                const todo = groups.filter((g) => !picked[g.key]);
                for (const [i, g] of todo.entries()) {
                  setProgress(`Asking AI… ${i + 1}/${todo.length}`);
                  await askAi(g);
                }
                setProgress(null);
              })
            }
            className="btn-secondary !py-2 text-xs"
          >
            {progress ?? `✨ Ask AI for the ${groups.filter((g) => !picked[g.key]).length} without a choice`}
          </button>
        )}
        {chosen.length > 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                let filed = 0;
                for (const [i, g] of chosen.entries()) {
                  setProgress(`Filing… ${i + 1}/${chosen.length}`);
                  const res = await fileHeldProducts(g.store, g.grouping, picked[g.key]);
                  note(g.key, res.ok ? { tone: "ok", text: res.ok } : { tone: "error", text: res.error ?? "Failed" });
                  if (res.ok) filed++;
                }
                setProgress(null);
                if (filed) router.refresh();
              })
            }
            className="rounded-full bg-ocean-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-ocean-700 disabled:opacity-40"
          >
            File all {chosen.length} chosen groups
          </button>
        )}
        {!ai && (
          <p className="text-xs text-slate-400">
            Suggestions come from names; with ANTHROPIC_API_KEY set, AI can read the products and photos too.
          </p>
        )}
      </div>

      <ul className="mt-4 divide-y divide-sand-100 rounded-2xl border border-sand-200">
        {groups.map((g) => {
          const n = notes[g.key];
          const offered = g.suggestion && picked[g.key] !== g.suggestion.slug ? g.suggestion : undefined;
          return (
            <li key={g.key} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{g.grouping || "No supplier grouping"}</p>
                <p className="truncate text-xs text-slate-500">
                  {g.storeName} · {g.count} product{g.count === 1 ? "" : "s"} · e.g. {g.samples.slice(0, 3).join(", ")}
                </p>
                {offered && (
                  <p className="text-xs text-ocean-700">
                    Suggested: {offered.name}{" "}
                    <span className="text-slate-400">
                      ({offered.source === "name" ? "matches the group's name" : "from its products"})
                    </span>{" "}
                    <button
                      type="button"
                      onClick={() => choose(g.key, offered.slug)}
                      className="font-bold underline"
                    >
                      Use
                    </button>
                  </p>
                )}
                {n && (
                  <p
                    className={`mt-1 text-xs font-semibold ${
                      n.tone === "ok" ? "text-emerald-700" : n.tone === "error" ? "text-coral-600" : "text-ocean-800"
                    }`}
                  >
                    {n.text}
                  </p>
                )}
              </div>
              <SearchableSelect
                key={`${g.key}-${version[g.key] ?? 0}`}
                name={`file-${g.key}`}
                defaultValue={picked[g.key]}
                onChange={(value) => setPicked((prev) => ({ ...prev, [g.key]: value }))}
                placeholder="Choose a category"
                searchPlaceholder="Type to find a category…"
                options={options}
              />
              <div className="flex gap-2">
                {ai && (
                  <button
                    type="button"
                    disabled={pending}
                    title="Ask AI to read this group's products and photo"
                    onClick={() => {
                      setBusy(`ai-${g.key}`);
                      start(async () => {
                        await askAi(g);
                        setBusy(null);
                      });
                    }}
                    className="rounded-full border border-ocean-200 px-3 py-2.5 text-xs font-bold text-ocean-800 hover:bg-ocean-50 disabled:opacity-40"
                  >
                    {busy === `ai-${g.key}` ? "…" : "✨"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending || !picked[g.key]}
                  onClick={() => {
                    setBusy(g.key);
                    start(async () => {
                      const res = await fileHeldProducts(g.store, g.grouping, picked[g.key]);
                      note(g.key, res.ok ? { tone: "ok", text: res.ok } : { tone: "error", text: res.error ?? "Failed" });
                      setBusy(null);
                      if (res.ok) router.refresh();
                    });
                  }}
                  className="rounded-full bg-ocean-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-ocean-700 disabled:opacity-40"
                >
                  {busy === g.key ? "Filing…" : `File ${g.count}`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
