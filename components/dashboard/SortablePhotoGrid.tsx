"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PHOTO ORDER — drag to reorder, one tap to make a photo the main one.
 * ─────────────────────────────────────────────────────────────────────────
 * Shared by the product's photos (PhotoManager) and each option's photos
 * (VariantEditor). The caller owns the list; this only draws it and
 * reports moves and removals.
 *
 * ── Why it changed ───────────────────────────────────────────────────────
 * The controls used to be a ← ★ → bar that only appeared on mouse hover
 * (opacity-0 until :hover). Sellers mostly edit on phones, which have no
 * hover — the buttons were there and worked when tapped, but nobody could
 * see them. Choosing which photo shoppers see first is the most important
 * thing on this screen, so every control is now always visible:
 *   • a "Main" badge on the first photo, a position number on the rest;
 *   • a "Make main" button on every other photo;
 *   • a ⠿ handle to drag a photo to any position (mouse, touch or pen);
 *   • ‹ › buttons for one-step moves (and for keyboards / screen readers).
 *
 * ── How dragging works ───────────────────────────────────────────────────
 * Pointer events, not HTML5 drag-and-drop: HTML5 DnD does not fire on
 * touch screens at all. The tile under the finger is found from the tile
 * rectangles measured when the drag starts, not by hit-testing, because
 * the dragged tile itself is under the finger. The list is reordered once,
 * on release — moving DOM nodes mid-drag can drop the pointer capture.
 * On touch only the ⠿ handle starts a drag (it has touch-action: none),
 * so swiping across the photos still scrolls the page; with a mouse the
 * whole photo can be grabbed.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type GridPhoto = {
  /** Stable identity — a URL, or a pending photo's id/placeholder. */
  key: string;
  src: string;
  /** A local blob preview (not yet uploaded) — drawn with <img>. */
  isNew?: boolean;
};

type Drag = {
  from: number;
  over: number;
  dx: number;
  dy: number;
  moved: boolean;
};

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

export default function SortablePhotoGrid({
  photos,
  onMove,
  onRemove,
  trailing,
  compact = false,
}: {
  photos: GridPhoto[];
  /** Move the photo at `from` so it ends up at index `to`. */
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  /** An extra cell after the photos, e.g. an "Add" tile. */
  trailing?: ReactNode;
  /** Smaller tiles, for the per-option photo lists. */
  compact?: boolean;
}) {
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` so pointerup and lostpointercapture — which can both
  // fire for one release — see the latest value and the move runs once.
  const live = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    live.current = d;
    setDragState(d);
  };
  const tiles = useRef<(HTMLLIElement | null)[]>([]);
  const start = useRef<{ x: number; y: number; rects: DOMRect[] } | null>(null);

  function begin(e: ReactPointerEvent<HTMLElement>, index: number) {
    if (e.button !== 0 || photos.length < 2) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; without it the drag still follows the pointer
      // while it stays over the handle.
    }
    start.current = {
      x: e.clientX,
      y: e.clientY,
      rects: tiles.current.slice(0, photos.length).map((t) => t!.getBoundingClientRect()),
    };
    setDrag({ from: index, over: index, dx: 0, dy: 0, moved: false });
  }

  function track(e: ReactPointerEvent<HTMLElement>) {
    const s = start.current;
    const d = live.current;
    if (!d || !s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const moved = d.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDrag({ ...d, dx, dy, moved, over: moved ? nearest(s.rects, e.clientX, e.clientY) : d.from });
  }

  function finish() {
    const d = live.current;
    if (!d) return;
    if (d.moved && d.over !== d.from) onMove(d.from, d.over);
    start.current = null;
    setDrag(null);
  }

  /** Handlers that start a drag from `index`; spread onto the grab area. */
  function grab(index: number, mouseOnly = false) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (mouseOnly && e.pointerType !== "mouse") return;
        begin(e, index);
      },
      onPointerMove: track,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
    };
  }

  const tile = compact ? "text-[9px]" : "text-[10px]";
  const cols = compact
    ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"
    : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

  return (
    <ul className={`grid ${cols} gap-3 ${drag?.moved ? "select-none" : ""}`}>
      {photos.map((photo, i) => {
        const main = i === 0;
        const dragging = drag?.moved && drag.from === i;
        const target = drag?.moved && drag.over === i && drag.from !== i;
        return (
          <li
            key={photo.key}
            ref={(el) => {
              tiles.current[i] = el;
            }}
            className={`relative min-w-0 ${dragging ? "z-20" : ""}`}
            style={
              dragging
                ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px) scale(1.05)` }
                : undefined
            }
          >
            <div
              {...grab(i, true)}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-sand-50 transition-shadow ${
                main
                  ? "border-mango-500 ring-2 ring-mango-200"
                  : photo.isNew
                    ? "border-dashed border-emerald-400"
                    : "border-sand-200"
              } ${dragging ? "cursor-grabbing shadow-2xl" : photos.length > 1 ? "cursor-grab" : ""} ${
                target ? "ring-4 ring-ocean-400" : ""
              }`}
            >
              {photo.isNew ? (
                // Local blob preview — next/image cannot optimise these.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full object-cover"
                />
              ) : (
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  draggable={false}
                  sizes={compact ? "120px" : "180px"}
                  className="pointer-events-none object-cover"
                />
              )}

              <div className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1">
                {main ? (
                  <span className={`rounded-md bg-mango-500 px-1.5 py-0.5 ${tile} font-bold text-white shadow`}>
                    ★ Main
                  </span>
                ) : (
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1 ${tile} font-bold text-white`}
                  >
                    {i + 1}
                  </span>
                )}
                {photo.isNew && (
                  <span className={`rounded-md bg-emerald-600 px-1.5 py-0.5 ${tile} font-bold text-white`}>
                    New
                  </span>
                )}
              </div>

              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(i)}
                aria-label={`Remove photo ${i + 1}`}
                title="Remove photo"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white transition hover:bg-coral-500"
              >
                ✕
              </button>

              {!main && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onMove(i, 0)}
                  aria-label={`Make photo ${i + 1} the main photo`}
                  className={`absolute inset-x-1 bottom-1 rounded-lg bg-white/95 py-1.5 ${tile} font-bold text-ocean-800 shadow transition hover:bg-mango-500 hover:text-white`}
                >
                  ★ Make main
                </button>
              )}

              {target && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ocean-900/40 text-xs font-bold text-white">
                  Drop here
                </span>
              )}
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onMove(i, i - 1)}
                disabled={main}
                aria-label={`Move photo ${i + 1} earlier`}
                className="flex h-8 items-center justify-center rounded-lg bg-sand-100 text-base font-bold text-slate-700 transition hover:bg-sand-200 disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                {...grab(i)}
                disabled={photos.length < 2}
                aria-label={`Drag photo ${i + 1} to reorder`}
                title="Drag to reorder"
                style={{ touchAction: "none" }}
                className={`flex h-8 items-center justify-center rounded-lg text-base font-bold transition disabled:opacity-30 ${
                  dragging
                    ? "cursor-grabbing bg-ocean-600 text-white"
                    : "cursor-grab bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
                }`}
              >
                ⠿
              </button>
              <button
                type="button"
                onClick={() => onMove(i, i + 1)}
                disabled={i === photos.length - 1}
                aria-label={`Move photo ${i + 1} later`}
                className="flex h-8 items-center justify-center rounded-lg bg-sand-100 text-base font-bold text-slate-700 transition hover:bg-sand-200 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </li>
        );
      })}
      {trailing && <li className="min-w-0">{trailing}</li>}
    </ul>
  );
}

/** Index of the tile whose centre is closest to the pointer. */
function nearest(rects: DOMRect[], x: number, y: number): number {
  let best = 0;
  let bestDist = Infinity;
  rects.forEach((r, i) => {
    const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** `list` with the item at `from` moved to index `to`. */
export function movePhoto<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}
