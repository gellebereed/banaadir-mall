"use client";

import { useState } from "react";
import { compressImageFile } from "@/lib/image-compress";

/**
 * File input styled as a drop zone, with instant local previews of the
 * chosen files (no upload happens until the form is submitted).
 */
export default function PhotoPicker({
  name,
  multiple = true,
  label = "Drag photos here or tap to upload",
  hint = "JPG, PNG or WebP · up to 5 MB each",
}: {
  name: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (rawFiles.length === 0) return;

    setCompressing(true);
    try {
      const compressedFiles = await Promise.all(rawFiles.map((f) => compressImageFile(f)));

      try {
        const dt = new DataTransfer();
        compressedFiles.forEach((f) => dt.items.add(f));
        e.target.files = dt.files;
      } catch {
        // Fallback for browsers that restrict setting file input files
      }

      previews.forEach(URL.revokeObjectURL);
      setPreviews(compressedFiles.map((f) => URL.createObjectURL(f)));
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sand-200 bg-sand-50 py-8 text-center transition hover:border-ocean-400 hover:bg-ocean-50/40">
        <span className="text-3xl">📸</span>
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <span className="text-xs text-slate-400">{hint}</span>
        <input
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

      {previews.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {previews.map((src) => (
            // Local blob previews — next/image isn't useful for these.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt="Selected photo preview"
              className="h-20 w-20 rounded-xl border border-sand-200 object-cover"
            />
          ))}
          <p className="w-full text-xs font-semibold text-emerald-600">
            ✓ {previews.length} photo{previews.length === 1 ? "" : "s"} ready —
            save the form to upload.
          </p>
        </div>
      )}
    </div>
  );
}
