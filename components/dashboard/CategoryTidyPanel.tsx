"use client";

import { useActionState, useMemo, useState } from "react";
import { applyCategoryTidy, type TidyState } from "@/app/admin/categories/tidy-actions";
import { REVIEW_BELOW, type TidyProposal } from "@/lib/category-tidy";

const EMPTY: TidyState = { ok: false, message: "", details: [] };

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TIDY UP — review what it found, tick what you agree with.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Confident suggestions arrive ticked; unsure ones do not ──────────────
 * The tool is only worth opening if the default selection can be applied
 * without reading all thirty rows, and it is only trustworthy if the rows
 * that DO need reading are obvious. So anything the matcher is sure about
 * is pre-ticked, anything below the threshold is listed unticked with its
 * confidence on show, and nothing is hidden — a suggestion nobody sees is
 * one nobody ever corrects.
 *
 * ── Merges are marked, because merges delete ─────────────────────────────
 * Re-parenting moves a category and is undoable from this same screen.
 * Merging moves the products and then removes the empty category, which is
 * not. They are visually distinct and the product count is on the row, so
 * nobody discovers what a merge meant afterwards.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function CategoryTidyPanel({
  proposals,
}: {
  proposals: TidyProposal[];
}) {
  const [state, formAction, pending] = useActionState<TidyState, FormData>(
    applyCategoryTidy,
    EMPTY,
  );

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(proposals.filter((p) => p.confidence >= REVIEW_BELOW).map((p) => p.slug)),
  );
  const [open, setOpen] = useState(false);

  const byRoot = useMemo(() => {
    const groups = new Map<string, TidyProposal[]>();
    for (const proposal of proposals) {
      const list = groups.get(proposal.rootName) ?? [];
      list.push(proposal);
      groups.set(proposal.rootName, list);
    }
    return [...groups.entries()];
  }, [proposals]);

  const decisions = proposals
    .filter((proposal) => picked.has(proposal.slug))
    .map((proposal) => ({
      slug: proposal.slug,
      action: proposal.action,
      targetSlug: proposal.targetSlug,
    }));

  const mergeCount = decisions.filter((d) => d.action === "merge").length;
  const productsAffected = proposals
    .filter((p) => picked.has(p.slug) && p.action === "merge")
    .reduce((total, p) => total + p.products, 0);

  function toggle(slug: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // ── Already tidy ──────────────────────────────────────────────────
  if (proposals.length === 0) {
    return (
      <div className="card mb-5 flex items-center gap-3 p-4">
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-display font-bold text-ocean-950">
            Nothing to tidy up
          </p>
          <p className="text-sm text-slate-500">
            Every category is either a group or sits inside one.
          </p>
        </div>
      </div>
    );
  }

  // ── The receipt, after applying ───────────────────────────────────
  if (state.details.length > 0) {
    return (
      <div className="card mb-5 p-5">
        <p
          className={`font-display font-bold ${
            state.ok ? "text-emerald-700" : "text-mango-800"
          }`}
        >
          {state.ok ? "✓ " : "⚠ "}
          {state.message}
        </p>
        <ul className="mt-3 space-y-1">
          {state.details.map((line) => (
            <li key={line} className="text-sm text-slate-600">
              {line}
            </li>
          ))}
        </ul>
        <button
          onClick={() => window.location.reload()}
          className="btn-secondary mt-4 !py-2 text-sm"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-sand-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mango-100 text-2xl">
          🧹
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-ocean-950">
            {proposals.length} categor{proposals.length === 1 ? "y" : "ies"} look
            misfiled
          </p>
          <p className="text-sm text-slate-500">
            Imports file their own groupings straight under a department. These
            look like they belong one level down — or are duplicates of shelves
            you already have.
          </p>
        </div>
        <span className="shrink-0 text-slate-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form action={formAction} className="border-t border-sand-200">
          <input type="hidden" name="decisionsJson" value={JSON.stringify(decisions)} />

          <div className="max-h-[28rem] overflow-y-auto">
            {byRoot.map(([rootName, rows]) => (
              <div key={rootName}>
                <p className="sticky top-0 z-10 bg-sand-100 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  {rootName}
                </p>

                {rows.map((proposal) => {
                  const checked = picked.has(proposal.slug);
                  const unsure = proposal.confidence < REVIEW_BELOW;

                  return (
                    <label
                      key={proposal.slug}
                      className={`flex cursor-pointer items-start gap-3 border-b border-sand-100 px-4 py-3 transition ${
                        checked ? "bg-ocean-50/40" : "hover:bg-sand-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(proposal.slug)}
                        className="mt-1 h-4 w-4 shrink-0 accent-ocean-700"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-semibold text-slate-800">
                            {proposal.name}
                          </span>
                          <span aria-hidden className="text-slate-400">
                            →
                          </span>
                          <span className="font-semibold text-ocean-800">
                            {proposal.targetName}
                          </span>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              proposal.action === "merge"
                                ? "bg-coral-100 text-coral-700"
                                : "bg-ocean-100 text-ocean-800"
                            }`}
                          >
                            {proposal.action === "merge" ? "merge" : "move into"}
                          </span>

                          {unsure && (
                            <span className="rounded-full bg-mango-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-mango-800">
                              {proposal.confidence}% — check this
                            </span>
                          )}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500">{proposal.reason}</p>

                        {proposal.action === "merge" && (
                          <p className="mt-1 text-xs font-semibold text-coral-700">
                            {proposal.products > 0
                              ? `${proposal.products} product${proposal.products === 1 ? "" : "s"} move across, then “${proposal.name}” is removed.`
                              : `“${proposal.name}” is empty and will be removed.`}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 bg-sand-50 p-4">
            <button
              type="submit"
              disabled={pending || decisions.length === 0}
              className="btn-primary !py-2.5 text-sm disabled:opacity-50"
            >
              {pending
                ? "Tidying…"
                : `Apply ${decisions.length} change${decisions.length === 1 ? "" : "s"}`}
            </button>

            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-xs font-bold text-slate-500 hover:text-ocean-700"
            >
              Untick all
            </button>

            {mergeCount > 0 && (
              <p className="text-xs text-coral-700">
                ⚠ {mergeCount} merge{mergeCount === 1 ? "" : "s"} will remove{" "}
                {mergeCount === 1 ? "a category" : "those categories"}
                {productsAffected > 0 && ` and move ${productsAffected} products`}. Moving
                a category is undoable here; a merge is not.
              </p>
            )}

            {state.message && !state.ok && (
              <p className="text-xs font-semibold text-coral-700">{state.message}</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
