"use client";

import { useEffect, useRef, useState } from "react";
import { suggestProductDetails } from "@/app/vendor/products/suggest-actions";
import type { ClassifyResult } from "@/lib/product-classify";
import type { AttributeSets } from "@/lib/taxonomy-attributes";
import type { SelectOption } from "@/components/dashboard/SearchableSelect";

/**
 * "✨ Suggest" — the category and attributes this product most likely has,
 * from its name, description and (with AI on) its cover photo. Nothing is
 * applied until the seller taps Use / Apply.
 */
export default function SuggestDetails({
  name,
  description,
  category,
  photoSrc,
  categories,
  sets,
  ai,
  autoRunWhenNamed,
  onUseCategory,
  onApplyAttributes,
}: {
  name: string;
  description: string;
  /** Currently chosen category; when set, only attributes are suggested. */
  category: string;
  photoSrc: string | null;
  categories: SelectOption[];
  sets: AttributeSets;
  /** Whether Claude answers (ANTHROPIC_API_KEY is set) — else word matching. */
  ai: boolean;
  /** New products: suggest once by itself when the name is typed and no category is chosen. */
  autoRunWhenNamed?: boolean;
  onUseCategory: (slug: string) => void;
  onApplyAttributes: (values: Record<string, string[]>) => void;
}) {
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState({ category: false, attributes: false });
  const autoRan = useRef(false);

  async function run() {
    setBusy(true);
    setApplied({ category: false, attributes: false });
    try {
      const image = ai ? await photoForAi(photoSrc) : undefined;
      setResult(await suggestProductDetails({ name, description, category: category || undefined, image }));
    } catch {
      setResult({ attributes: {}, source: "words", error: "Suggestions are unavailable right now — try again." });
    } finally {
      setBusy(false);
    }
  }

  // Once, on a new product, as soon as there is a name to go on — debounced
  // so it fires when the seller pauses, not on every keystroke.
  useEffect(() => {
    if (!autoRunWhenNamed || autoRan.current || category || name.trim().length < 4) return;
    const timer = setTimeout(() => {
      autoRan.current = true;
      void run();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunWhenNamed, name, category]);

  const suggestedCategory = result?.category
    ? categories.find((c) => c.value === result.category!.slug)
    : undefined;
  const attrRows = Object.entries(result?.attributes ?? {})
    .map(([handle, keys]) => {
      const def = sets.defs[handle];
      if (!def) return null;
      return { handle, name: def.name, values: keys.map((k) => def.values.find((v) => v.key === k)?.name ?? k) };
    })
    .filter((r): r is { handle: string; name: string; values: string[] } => r !== null);
  const nothing = result && !result.error && !suggestedCategory && attrRows.length === 0;

  return (
    <div className="rounded-2xl border border-ocean-100 bg-gradient-to-br from-ocean-50 to-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold text-ocean-950">✨ Suggested details</p>
          <p className="text-xs text-slate-500">
            {ai
              ? "AI reads the name, description and cover photo."
              : "Matched from the name and description."}{" "}
            You choose what to use.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy || name.trim().length < 3}
          className="btn-secondary !px-3 !py-1.5 text-xs"
        >
          {busy ? "Thinking…" : result ? "Suggest again" : category ? "Suggest attributes" : "Suggest category & attributes"}
        </button>
      </div>

      {result?.error && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{result.error}</p>
      )}
      {nothing && (
        <p className="mt-3 text-xs text-slate-500">
          {result.note ??
            `No confident suggestion — ${category ? "add a few words to the description" : "choose the category yourself"}.`}
        </p>
      )}

      {suggestedCategory && suggestedCategory.value !== category && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-sand-200">
          <p className="text-sm">
            <span className="text-slate-500">Category: </span>
            <strong className="text-ocean-950">
              {suggestedCategory.icon} {suggestedCategory.label}
            </strong>
            {result?.category?.reason && <span className="block text-xs text-slate-400">{result.category.reason}</span>}
          </p>
          <button
            type="button"
            disabled={applied.category}
            onClick={() => {
              onUseCategory(suggestedCategory.value);
              setApplied((a) => ({ ...a, category: true }));
            }}
            className="btn-primary !px-3 !py-1.5 text-xs"
          >
            {applied.category ? "✓ Used" : "Use"}
          </button>
        </div>
      )}

      {attrRows.length > 0 && (
        <div className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-sand-200">
          <ul className="space-y-0.5 text-sm">
            {attrRows.map((r) => (
              <li key={r.handle}>
                <span className="text-slate-500">{r.name}: </span>
                <strong className="text-ocean-950">{r.values.join(", ")}</strong>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={applied.attributes}
            onClick={() => {
              // Using the category too, if it was suggested and not yet used:
              // these attributes belong to it.
              if (suggestedCategory && suggestedCategory.value !== category && !applied.category) {
                onUseCategory(suggestedCategory.value);
              }
              onApplyAttributes(result!.attributes);
              setApplied({ category: true, attributes: true });
            }}
            className="btn-primary mt-2 !px-3 !py-1.5 text-xs"
          >
            {applied.attributes ? "✓ Applied — check them below" : "Apply attributes"}
          </button>
        </div>
      )}

      {ai && result?.category && applied.category && (
        <p className="mt-2 text-xs text-slate-500">
          Category set — tap <strong>Suggest again</strong> for attributes read from the photo too.
        </p>
      )}
    </div>
  );
}

/**
 * The cover photo, small enough to send: a stored photo on another host
 * goes as its URL (the AI fetches it); a just-picked or same-site photo is
 * redrawn at 640px as JPEG — a phone photo is several MB, and a category
 * decision needs nowhere near that.
 */
async function photoForAi(src: string | null): Promise<string | undefined> {
  if (!src) return undefined;
  try {
    const url = new URL(src, window.location.href);
    if (url.protocol === "https:" && url.origin !== window.location.origin) return url.href;
    const img = new Image();
    img.src = url.href;
    await img.decode();
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    return undefined;
  }
}
