"use client";

import Image from "next/image";
import { useState } from "react";
import PhotoPicker, { type PendingPhoto } from "./PhotoPicker";
import { UPLOAD_PLACEHOLDER } from "@/lib/product-utils";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  A PRODUCT'S PHOTOS — saved and just-picked, in one editable grid.
 * ─────────────────────────────────────────────────────────────────────────
 * Reorder, promote to main image, or remove. The resulting order is
 * submitted as JSON in a hidden field.
 *
 * ── Why newly picked photos are in the same grid ─────────────────────────
 * They used to sit in a separate strip below, as read-only thumbnails. So a
 * photo you had just chosen could not be removed if you picked the wrong
 * one, could not be moved in front of the others, and could not be made the
 * main image — you had to save, wait for the upload, then come back and
 * edit. Choosing a cover photo, which is the most common reason to open
 * this screen at all, took two round trips.
 *
 * Now both kinds are one list. A pending photo is written into
 * `imagesJson` as a placeholder, and the server swaps in each uploaded URL
 * in order — so where you put a photo before saving is where it lands.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Slot =
  | { kind: "saved"; url: string }
  | { kind: "pending"; photo: PendingPhoto };

export default function PhotoManager({
  initial,
  name = "imagesJson",
  uploadName = "photos",
}: {
  initial: string[];
  name?: string;
  uploadName?: string;
}) {
  const [slots, setSlots] = useState<Slot[]>(
    initial.map((url) => ({ kind: "saved", url })),
  );

  const pending = slots.flatMap((s) => (s.kind === "pending" ? [s.photo] : []));

  /**
   * What the server receives: saved URLs in place, and a placeholder for
   * each pending file. The Nth placeholder takes the Nth uploaded file,
   * and PhotoPicker keeps the FileList in this same order.
   */
  const serialised = JSON.stringify(
    slots.map((s) => (s.kind === "saved" ? s.url : UPLOAD_PLACEHOLDER)),
  );

  /** Replace the pending set while leaving saved photos where they are. */
  function setPending(next: PendingPhoto[]) {
    setSlots((prev) => {
      const kept = prev.filter(
        (s) => s.kind === "saved" || next.some((p) => p.id === s.photo.id),
      );
      const known = new Set(
        kept.flatMap((s) => (s.kind === "pending" ? [s.photo.id] : [])),
      );
      const added = next
        .filter((p) => !known.has(p.id))
        .map((photo): Slot => ({ kind: "pending", photo }));
      return [...kept, ...added];
    });
  }

  function move(index: number, delta: number) {
    setSlots((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makeMain(index: number) {
    setSlots((prev) => {
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      return [picked, ...next];
    });
  }

  function remove(index: number) {
    setSlots((prev) => {
      const target = prev[index];
      if (target?.kind === "pending") URL.revokeObjectURL(target.photo.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <div>
      {/* The authoritative photo list + order for the server action. */}
      <input type="hidden" name={name} value={serialised} />

      {slots.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {slots.map((slot, i) => {
            const key = slot.kind === "saved" ? slot.url : slot.photo.id;
            return (
              <div
                key={key}
                className={`group relative h-28 w-28 overflow-hidden rounded-xl border-2 ${
                  i === 0 ? "border-ocean-600" : "border-sand-200"
                }`}
              >
                {slot.kind === "saved" ? (
                  <Image src={slot.url} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  // Local blob preview — next/image cannot optimise these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.photo.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}

                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-ocean-800/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    Main
                  </span>
                )}

                {slot.kind === "pending" && (
                  <span className="absolute bottom-8 left-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    New
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
                    disabled={i === slots.length - 1}
                    aria-label="Move photo right"
                    className="flex-1 py-1 hover:bg-white/20 disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PhotoPicker
        name={uploadName}
        label={slots.length > 0 ? "Add more photos" : "Drag photos here or tap to upload"}
        photos={pending}
        onPhotosChange={setPending}
      />

      {slots.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Hover a photo to reorder (← →), make it the main image (★) or remove
          it (✕) — including ones you have just added. Changes apply when you
          save.
        </p>
      )}
    </div>
  );
}
