"use client";

import { useMemo, useState, useTransition } from "react";
import {
  linkStandard,
  proposeStandard,
  type StandardOption,
  type StandardProposal,
} from "@/app/admin/categories/standard-actions";
import StandardPicker from "@/components/dashboard/StandardPicker";

export interface LinkerRow {
  slug: string;
  name: string;
  icon: string;
  depth: number;
  products: number;
  linked: StandardOption | null;
}

/** Proposals at or above this are offered for one-click bulk approval. */
const CONFIDENT = 85;
/** Categories per proposal request — each must finish inside the host's ~10s function limit. */
const BATCH = 5;

type Filter = "unlinked" | "linked" | "all";

export default function StandardLinker({ rows, aiAvailable }: { rows: LinkerRow[]; aiAvailable: boolean }) {
  const [linked, setLinked] = useState<Record<string, StandardOption | null>>(() =>
    Object.fromEntries(rows.map((r) => [r.slug, r.linked])),
  );
  const [proposals, setProposals] = useState<Record<string, StandardProposal>>({});
  const [changing, setChanging] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => !r.linked) ? "unlinked" : "all"));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const unlinked = rows.filter((r) => !linked[r.slug]);
  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "linked" ? Boolean(linked[r.slug]) : !linked[r.slug],
  );
  const confident = unlinked.filter((r) => {
    const p = proposals[r.slug];
    return p?.standardId && p.confidence >= CONFIDENT;
  });

  /**
   * Categories that mean the same standard thing. Not always wrong (a
   * "Sale" shelf may overlap a department) but usually two names for one
   * category — the merge tool on /admin/categories is the fix.
   */
  const shared = useMemo(() => {
    const by = new Map<string, { path: string; names: string[] }>();
    for (const r of rows) {
      const l = linked[r.slug];
      if (!l) continue;
      const entry = by.get(l.id) ?? { path: l.path, names: [] };
      entry.names.push(r.name);
      by.set(l.id, entry);
    }
    return [...by.values()].filter((e) => e.names.length > 1);
  }, [rows, linked]);

  async function suggest() {
    const slugs = unlinked.map((r) => r.slug);
    if (slugs.length === 0) return;
    setMessage(null);
    setProgress({ done: 0, total: slugs.length });
    let aiError: string | undefined;
    for (let i = 0; i < slugs.length; i += BATCH) {
      const batch = slugs.slice(i, i + BATCH);
      try {
        const result = await proposeStandard(batch);
        if (result.error) aiError = result.error;
        setProposals((prev) => {
          const next = { ...prev };
          for (const p of result.proposals) next[p.slug] = p;
          return next;
        });
      } catch {
        aiError = "Some suggestions could not be fetched — try again.";
      }
      setProgress({ done: Math.min(i + BATCH, slugs.length), total: slugs.length });
    }
    setProgress(null);
    if (aiError) setMessage({ tone: "error", text: `${aiError} Word-matching suggestions are shown instead.` });
  }

  function save(links: { slug: string; standardId: string | null; path?: string }[]) {
    startSaving(async () => {
      const result = await linkStandard(links.map(({ slug, standardId }) => ({ slug, standardId })));
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setLinked((prev) => {
        const next = { ...prev };
        for (const l of links) next[l.slug] = l.standardId ? { id: l.standardId, path: l.path ?? "" } : null;
        return next;
      });
      setProposals((prev) => {
        const next = { ...prev };
        for (const l of links) delete next[l.slug];
        return next;
      });
      setChanging(null);
      setMessage({ tone: "ok", text: result.ok ?? "Saved." });
    });
  }

  const dismiss = (slug: string) =>
    setProposals((prev) => ({
      ...prev,
      [slug]: { slug, standardId: null, confidence: 0, source: prev[slug]?.source ?? "words", reason: "Dismissed — pick one with Change" },
    }));

  return (
    <div className="space-y-6">
      {!aiAvailable && (
        <div className="card border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-900">
          <strong>AI suggestions are off.</strong> Suggestions below come from word matching,
          which is good at finding candidates but weaker at choosing between them. Add{" "}
          <code className="rounded bg-white px-1">DASHSCOPE_API_KEY</code> (Alibaba Cloud) to the site&apos;s
          environment variables (Netlify → Site configuration → Environment variables) and
          redeploy to have AI choose instead. You approve every link either way.
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-display text-lg font-extrabold text-ocean-950">
            {rows.length - unlinked.length} of {rows.length} linked
          </p>
          <p className="text-sm text-slate-500">
            {unlinked.length > 0
              ? "Get suggestions, check them, approve."
              : "All categories are linked. New ones are linked when they are created."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unlinked.length > 0 && (
            <button type="button" onClick={suggest} disabled={Boolean(progress) || saving} className="btn-primary">
              {progress
                ? `Suggesting… ${progress.done}/${progress.total}`
                : `${aiAvailable ? "✨ " : ""}Suggest links for ${unlinked.length}`}
            </button>
          )}
          {confident.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                save(
                  confident.map((r) => ({
                    slug: r.slug,
                    standardId: proposals[r.slug].standardId,
                    path: proposals[r.slug].path,
                  })),
                )
              }
              className="btn-secondary"
            >
              Approve {confident.length} at ≥{CONFIDENT}%
            </button>
          )}
        </div>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            message.tone === "error" ? "bg-coral-100 text-coral-600" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {shared.length > 0 && (
        <div className="card p-5">
          <p className="font-display font-extrabold text-ocean-950">Possible duplicates</p>
          <p className="mt-0.5 text-sm text-slate-500">
            These categories mean the same standard thing. If they really are one category,
            merge them with the tidy-up tool on the Categories page.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {shared.map((s) => (
              <li key={s.path}>
                <span className="font-semibold text-ocean-950">{s.names.join(", ")}</span>
                <span className="text-slate-400"> → {s.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 text-sm">
        {(["unlinked", "linked", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 font-semibold capitalize ${
              filter === f ? "bg-ocean-900 text-white" : "bg-white text-slate-600 ring-1 ring-sand-200"
            }`}
          >
            {f}{" "}
            <span className="opacity-60">
              {f === "all" ? rows.length : f === "linked" ? rows.length - unlinked.length : unlinked.length}
            </span>
          </button>
        ))}
      </div>

      <div className="card divide-y divide-sand-100">
        {visible.length === 0 && <p className="p-6 text-sm text-slate-400">Nothing here.</p>}
        {visible.map((r) => {
          const current = linked[r.slug];
          const proposal = !current ? proposals[r.slug] : undefined;
          return (
            <div key={r.slug} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 sm:w-1/3" style={{ paddingLeft: `${r.depth * 16}px` }}>
                <p className="font-semibold text-ocean-950">
                  {r.icon} {r.name}
                </p>
                <p className="text-xs text-slate-400">
                  {r.products} product{r.products === 1 ? "" : "s"}
                </p>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                {changing === r.slug ? (
                  <div className="space-y-2">
                    <StandardPicker
                      name={`standard-${r.slug}`}
                      autoFocus
                      onChange={(option) => {
                        if (option) save([{ slug: r.slug, standardId: option.id, path: option.path }]);
                      }}
                    />
                    <button type="button" onClick={() => setChanging(null)} className="text-xs font-semibold text-slate-500 underline">
                      Cancel
                    </button>
                  </div>
                ) : current ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-emerald-800">✓ {current.path}</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setChanging(r.slug)} className="btn-secondary !px-3 !py-1.5 text-xs">
                        Change
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => save([{ slug: r.slug, standardId: null }])}
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-sand-100"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                ) : proposal ? (
                  <div className="rounded-xl bg-sand-50 p-3">
                    {proposal.standardId ? (
                      <p className="text-sm font-semibold text-ocean-950">{proposal.path}</p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-500">No good match suggested</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {proposal.standardId && (
                        <span
                          className={`mr-1.5 rounded-full px-1.5 py-0.5 font-bold ${
                            proposal.confidence >= CONFIDENT
                              ? "bg-emerald-100 text-emerald-700"
                              : proposal.confidence >= 60
                                ? "bg-amber-100 text-amber-700"
                                : "bg-coral-100 text-coral-600"
                          }`}
                        >
                          {proposal.confidence}%
                        </span>
                      )}
                      {proposal.source === "ai" ? "AI" : "Word match"}
                      {proposal.reason && ` · ${proposal.reason}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proposal.standardId && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => save([{ slug: r.slug, standardId: proposal.standardId, path: proposal.path }])}
                          className="btn-primary !px-3 !py-1.5 text-xs"
                        >
                          Approve
                        </button>
                      )}
                      <button type="button" onClick={() => setChanging(r.slug)} className="btn-secondary !px-3 !py-1.5 text-xs">
                        Change
                      </button>
                      {proposal.standardId && (
                        <button
                          type="button"
                          onClick={() => dismiss(r.slug)}
                          className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-sand-100"
                        >
                          None fits
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-amber-700">Not linked</p>
                    <button type="button" onClick={() => setChanging(r.slug)} className="btn-secondary !px-3 !py-1.5 text-xs">
                      Choose
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
