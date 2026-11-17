"use client";

import { useState } from "react";
import PhotoPicker, { type PendingPhoto } from "./PhotoPicker";
import SortablePhotoGrid, { movePhoto } from "./SortablePhotoGrid";
import { UPLOAD_PLACEHOLDER } from "@/lib/product-utils";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  A PRODUCT'S PHOTOS — saved and just-picked, in one editable grid.
 * ─────────────────────────────────────────────────────────────────────────
 * Reorder (drag or ‹ ›), promote to main image, or remove — the controls
 * live in SortablePhotoGrid. The resulting order is
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

  function move(from: number, to: number) {
    setSlots((prev) => movePhoto(prev, from, to));
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
        <div className="mb-4">
          <SortablePhotoGrid
            photos={slots.map((slot) =>
              slot.kind === "saved"
                ? { key: slot.url, src: slot.url }
                : { key: slot.photo.id, src: slot.photo.previewUrl, isNew: true },
            )}
            onMove={move}
            onRemove={remove}
          />
        </div>
      )}

      <PhotoPicker
        name={uploadName}
        label={slots.length > 0 ? "Add more photos" : "Drag photos here or tap to upload"}
        photos={pending}
        onPhotosChange={setPending}
      />

      {slots.length > 1 && (
        <p className="mt-2 text-xs text-slate-500">
          The <b>Main</b> photo is the one shoppers see first. Tap{" "}
          <b>★ Make main</b> on any photo, or hold <b>⠿</b> and drag it to a
          new spot. Changes apply when you save.
        </p>
      )}
    </div>
  );
}
