"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkImportPhotos, type BulkPhotoState } from "@/app/actions";
import PhotoPicker from "./PhotoPicker";

/**
 * How many photos travel in one request.
 *
 * ── Why this is batched at all ───────────────────────────────────────────
 * It used to post every selected photo in a single server action. Thirty
 * photos meant one request carrying the lot and, inside it, thirty uploads
 * to storage — comfortably past the ten seconds a Netlify function is
 * given before it is killed. The result was a 500 and "an unexpected
 * response was received from the server", which tells the seller nothing
 * and loses the whole upload.
 *
 * Six per request keeps every call small and quick, and — the part that
 * matters to whoever is sitting there — it means there is honest progress
 * to show instead of a button that appears to have done nothing.
 */
const BATCH_SIZE = 6;

const EMPTY: BulkPhotoState = {
  ok: false,
  message: "",
  matched: 0,
  productIds: [],
  uploaded: 0,
  skipped: [],
  failed: [],
};

export default function BulkPhotoForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [state, setState] = useState<BulkPhotoState>(EMPTY);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const photos = data.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);
    const replace = data.get("replace") === "on";

    if (photos.length === 0) {
      setState({ ...EMPTY, message: "Choose some photos first." });
      return;
    }

    setState(EMPTY);
    setProgress({ done: 0, total: photos.length });
    setIsUploading(true);

    try {
      // Accumulated across batches, so the summary describes the whole
      // upload rather than whichever batch happened to finish last.
      const totals: BulkPhotoState = { ...EMPTY, productIds: [], skipped: [], failed: [] };
      // A product usually appears in several batches, so its identity is
      // unioned rather than its count summed. See BulkPhotoState.productIds.
      const productsTouched = new Set<string>();

      for (let offset = 0; offset < photos.length; offset += BATCH_SIZE) {
        const batch = photos.slice(offset, offset + BATCH_SIZE);
        const isFinal = offset + BATCH_SIZE >= photos.length;

        const payload = new FormData();
        for (const photo of batch) payload.append("photos", photo);
        if (replace) payload.set("replace", "on");
        if (isFinal) payload.set("final", "1");

        let result: BulkPhotoState;
        try {
          result = await bulkImportPhotos(payload);
        } catch (error) {
          // A batch that dies takes only its own photos with it; the ones
          // already stored stay stored, and we say how far we got.
          totals.message =
            `Stopped after ${totals.uploaded} photo${totals.uploaded === 1 ? "" : "s"}. ` +
            (error instanceof Error ? error.message : "The server did not respond.");
          setState({ ...totals, ok: false });
          return;
        }

        result.productIds.forEach((id) => productsTouched.add(id));
        totals.matched = productsTouched.size;
        totals.uploaded += result.uploaded;
        totals.skipped.push(...result.skipped);
        totals.failed.push(...result.failed);
        setProgress({ done: Math.min(offset + batch.length, photos.length), total: photos.length });
      }

      const parts: string[] = [];
      if (totals.uploaded > 0) {
        parts.push(
          `${totals.uploaded} photo${totals.uploaded === 1 ? "" : "s"} added to ` +
            `${totals.matched} product${totals.matched === 1 ? "" : "s"}.`,
        );
      }
      if (totals.failed.length > 0) parts.push(`${totals.failed.length} could not be saved.`);
      if (totals.skipped.length > 0) {
        parts.push(
          `${totals.skipped.length} file${totals.skipped.length === 1 ? "" : "s"} matched no product.`,
        );
      }

      setState({
        ...totals,
        ok: totals.uploaded > 0 && totals.failed.length === 0,
        message: parts.join(" ") || "Nothing to do.",
      });

      if (totals.uploaded > 0) {
        formRef.current?.reset();
        router.refresh();
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  }

  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 space-y-4">
      <PhotoPicker name="photos" label="Select many photos at once" />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="replace" className="h-4 w-4 accent-ocean-700" />
        Replace existing photos instead of adding to them
      </label>

      <button
        type="submit"
        disabled={isUploading}
        className="btn-primary disabled:opacity-60 transition-all flex items-center gap-2"
      >
        {isUploading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Importing…
          </>
        ) : state.ok && state.uploaded > 0 ? (
          "✓ Upload Successful — Select More Photos"
        ) : (
          "Import Photos"
        )}
      </button>

      {/* Live progress — the whole reason the upload is batched. */}
      {progress && (
        <div aria-live="polite">
          <div className="flex items-baseline justify-between text-xs font-semibold text-ocean-800">
            <span>
              Uploading {progress.done} of {progress.total} photos…
            </span>
            <span>{percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Keep this page open — photos already uploaded are saved as they go.
          </p>
        </div>
      )}

      {state.message && !isUploading && (
        <div
          className={`rounded-xl px-4 py-3 text-sm transition-all ${
            state.ok
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : state.uploaded > 0
                ? "bg-mango-50 text-mango-900 border border-mango-200"
                : "bg-coral-100 text-coral-700 border border-coral-200"
          }`}
          role="status"
        >
          <p className="font-semibold text-base">
            {state.ok ? "✓ " : state.uploaded > 0 ? "⚠ " : "✕ "}
            {state.message}
          </p>

          {state.failed.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-semibold">Uploaded but not saved:</p>
              <ul className="mt-1 list-disc pl-5">
                {state.failed.slice(0, 10).map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {state.skipped.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-semibold">
                Show the {state.skipped.length} unmatched file
                {state.skipped.length === 1 ? "" : "s"}
              </summary>
              <p className="mt-1">
                Rename each one after its barcode, its product code, or the
                product&apos;s page name — then import again.
              </p>
              <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5">
                {state.skipped.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
