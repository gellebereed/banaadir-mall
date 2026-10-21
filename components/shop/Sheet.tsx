"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A panel that slides up from the bottom of a phone screen — filters and
 * sort on the product list. Portalled to <body> so no ancestor's
 * transform or blur can trap it, and the page behind stops scrolling
 * while it is open.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = "Close",
  full = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the scrolling body — the "Show N products" button. */
  footer?: ReactNode;
  closeLabel?: string;
  /** Full height (filters) rather than fit-to-content (sort). */
  full?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full flex-col rounded-t-3xl bg-white shadow-2xl ${full ? "h-[92vh]" : "max-h-[85vh]"}`}
      >
        <div className="flex items-center justify-between border-b border-sand-100 px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-ocean-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-sand-100"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-sand-100 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
