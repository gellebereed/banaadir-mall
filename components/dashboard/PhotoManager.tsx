"use client";

import Image from "next/image";
import { useState } from "react";
import PhotoPicker from "./PhotoPicker";

/**
 * Manages a product's existing photos: reorder, promote to main image, or
 * remove. The resulting order is submitted as JSON in a hidden field, and
 * newly picked files are appended by the server action after upload.
 */
export default function PhotoManager({
  initial,
  name = "imagesJson",
  uploadName = "photos",
}: {
  initial: string[];
  name?: string;
  uploadName?: string;
}) {
  const [images, setImages] = useState<string[]>(initial);

  function move(index: number, delta: number) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makeMain(index: number) {
    setImages((prev) => {
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      return [picked, ...next];
    });
  }

  function remove(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* The authoritative photo list + order for the server action. */}
      <input type="hidden" name={name} value={JSON.stringify(images)} />

      {images.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {images.map((src, i) => (
            <div
              key={src}
              className={`group relative h-28 w-28 overflow-hidden rounded-xl border-2 ${
                i === 0 ? "border-ocean-600" : "border-sand-200"
              }`}
            >
              <Image src={src} alt="" fill sizes="112px" className="object-cover" />

              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-ocean-800/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  Main
                </span>
              )}

              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove photo"
                title="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white transition hover:bg-coral-500"
              >
                ✕
              </button>

              {/* Reorder / promote controls */}
              <div className="absolute inset-x-0 bottom-0 flex items-stretch bg-black/60 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move photo left"
                  className="flex-1 py-1 hover:bg-white/20 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => makeMain(i)}
                  disabled={i === 0}
                  aria-label="Make main photo"
                  title="Make main photo"
                  className="flex-1 py-1 hover:bg-white/20 disabled:opacity-30"
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label="Move photo right"
                  className="flex-1 py-1 hover:bg-white/20 disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PhotoPicker
        name={uploadName}
        label={images.length > 0 ? "Add more photos" : "Drag photos here or tap to upload"}
      />

      {images.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Hover a photo to reorder (← →), make it the main image (★) or remove
          it (✕). Changes apply when you save.
        </p>
      )}
    </div>
  );
}
