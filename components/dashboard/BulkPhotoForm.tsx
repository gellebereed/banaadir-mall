"use client";

import { useActionState } from "react";
import { bulkImportPhotos, type BulkPhotoState } from "@/app/actions";
import PhotoPicker from "./PhotoPicker";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";

const INITIAL: BulkPhotoState = {
  ok: false,
  message: "",
  matched: 0,
  uploaded: 0,
  skipped: [],
  failed: [],
};

/**
 * The bulk photo upload, with an answer.
 *
 * The previous version posted to a void action: upload forty photos, watch
 * the page reload unchanged, and there is no way to tell whether nothing
 * matched, the upload failed, or the feature is broken. Every outcome is
 * now stated, and unmatched filenames are listed so they can be renamed
 * and retried rather than guessed at.
 */
export default function BulkPhotoForm() {
  const [state, formAction] = useActionState(bulkImportPhotos, INITIAL);
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <PhotoPicker name="photos" label="Select many photos at once" />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="replace" className="h-4 w-4 accent-ocean-700" />
        Replace existing photos instead of adding to them
      </label>

      <SubmitButton className="btn-primary">Import Photos</SubmitButton>

      {state.message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            state.ok
              ? "bg-emerald-50 text-emerald-800"
              : state.matched > 0
                ? "bg-mango-50 text-mango-900"
                : "bg-coral-100 text-coral-700"
          }`}
          role="status"
        >
          <p className="font-semibold">
            {state.ok ? "✓ " : state.matched > 0 ? "⚠ " : "✕ "}
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
