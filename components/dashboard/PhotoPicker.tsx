"use client";

import { useEffect, useRef, useState } from "react";
import { compressImageFiles } from "@/lib/image-compress";

/** "1.4 MB" / "870 KB" */
function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export interface PendingPhoto {
  /** Stable across re-orders, so React keys and the FileList stay in step. */
  id: string;
  file: File;
  previewUrl: string;
}

let counter = 0;
const nextId = () => `pending-${++counter}`;

/**
 * File input styled as a drop zone, with instant local previews of the
 * chosen files (no upload happens until the form is submitted).
 *
 * ── Who owns the pending files ───────────────────────────────────────────
 * When `photos` and `onPhotosChange` are supplied, the PARENT owns them —
 * that is what lets PhotoManager show newly picked photos in the same grid
 * as saved ones, and reorder or remove them before anything is uploaded.
 * Standalone (the bulk importer, the store logo) it keeps its own state and
 * behaves exactly as before.
 */
export default function PhotoPicker({
  name,
  multiple = true,
  label = "Drag photos here or tap to upload",
  hint = "JPG, PNG or WebP · up to 5 MB each",
  photos,
  onPhotosChange,
}: {
  name: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  /** Controlled mode: the pending files, owned by the parent. */
  photos?: PendingPhoto[];
  onPhotosChange?: (photos: PendingPhoto[]) => void;
}) {
  const controlled = !!onPhotosChange;
  const [own, setOwn] = useState<PendingPhoto[]>([]);
  const pending = photos ?? own;
  const setPending = onPhotosChange ?? setOwn;

  const [compressing, setCompressing] = useState(false);
  const [saved, setSaved] = useState<{ bytes: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Keep the real <input type="file"> in step with the pending list.
   *
   * The form posts the input's FileList, not our array — so removing a
   * photo from the preview grid has to remove it from the input too, or
   * the "deleted" file uploads anyway. Rebuilding the FileList through a
   * DataTransfer is the only way to do that, and it also makes the upload
   * order match the order shown on screen, which is what lets the server
   * slot each upload into the position the seller put it in.
   */
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    try {
      const dt = new DataTransfer();
      pending.forEach((p) => dt.items.add(p.file));
      input.files = dt.files;
    } catch {
      // Some browsers refuse to assign FileList; the input keeps whatever
      // the picker gave it, which is the pre-existing behaviour.
    }
  }, [pending]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (rawFiles.length === 0) return;

    setCompressing(true);
    setSaved(null);
    try {
      const { files: compressedFiles, savedBytes } = await compressImageFiles(rawFiles);
      const added = compressedFiles.map((file) => ({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      // Append rather than replace: picking a second time should ADD, the
      // way every other upload control on the web behaves.
      setPending(multiple ? [...pending, ...added] : added);
      setSaved({
        bytes: savedBytes,
        total: compressedFiles.reduce((sum, f) => sum + f.size, 0),
      });
    } finally {
      setCompressing(false);
    }
  }

  function removeOwn(id: string) {
    const target = pending.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setPending(pending.filter((p) => p.id !== id));
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sand-200 bg-sand-50 py-8 text-center transition hover:border-ocean-400 hover:bg-ocean-50/40">
        <span className="text-3xl">📸</span>
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <span className="text-xs text-slate-400">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/*"
          multiple={multiple}
          onChange={handleChange}
          className="sr-only"
        />
      </label>

      {compressing && (
        <p className="mt-2 text-xs font-bold text-ocean-700 animate-pulse">
          ⚡ Optimizing photos for ultra-fast upload...
        </p>
      )}

      {/* In controlled mode the parent draws the previews, mixed in with
          the saved photos — drawing them twice would be confusing. */}
      {!controlled && pending.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {pending.map((photo) => (
            <div key={photo.id} className="group relative h-20 w-20">
              {/* Local blob previews — next/image isn't useful for these. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt="Selected photo preview"
                className="h-20 w-20 rounded-xl border border-sand-200 object-cover"
              />
              <button
                type="button"
                onClick={() => removeOwn(photo.id)}
                aria-label="Remove this photo"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white transition hover:bg-coral-500"
              >
                ✕
              </button>
            </div>
          ))}
          <p className="w-full text-xs font-semibold text-emerald-600">
            ✓ {pending.length} photo{pending.length === 1 ? "" : "s"} ready —
            save the form to upload.
            {saved && saved.bytes > 0 && (
              <span className="ml-1 font-medium text-slate-500">
                Optimised to {fileSize(saved.total)}, saving {fileSize(saved.bytes)}.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
