"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DEPARTMENT MENU — the category strip, with what's underneath.
 * ─────────────────────────────────────────────────────────────────────────
 * The strip used to be a flat list of department links, so everything
 * beneath a department — the part of the catalogue a shopper is usually
 * actually after — could only be reached by landing on the department page
 * first and looking for it. On a marketplace where one supplier import can
 * create thirteen menswear categories, that is most of the catalogue hidden
 * behind an extra click.
 *
 * ── Why this opens on hover AND on click ─────────────────────────────────
 * Hover is what people expect from a shop's top nav on a desktop, and it
 * costs nothing. But hover does not exist on a phone or for anyone
 * navigating by keyboard, and a menu that only opens on hover is a menu
 * those people cannot open at all. So the trigger is a real <button> with
 * aria-expanded that toggles on click, and hover is a convenience layered
 * on top. Escape closes it, and so does moving the pointer away.
 *
 * The department itself stays reachable: the panel's first row is always
 * "All of <department>", because a dropdown that swallows its own parent
 * link is a common and infuriating regression.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";

export default function CategoryMenu({
  category,
  subcategories,
}: {
  category: Category;
  /** Sub-categories directly beneath it. */
  subcategories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A department with nothing under it is a plain link. Rendering a
  // disclosure arrow that opens an empty panel is worse than no arrow.
  const hasChildren = subcategories.length > 0;

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClickAway = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickAway);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickAway);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (!hasChildren) {
    return (
      <Link
        href={`/category/${category.slug}`}
        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-slate-600 transition hover:bg-ocean-50 hover:text-ocean-800"
      >
        {category.icon} {category.name}
      </Link>
    );
  }

  /** A short grace period, so crossing the gap to the panel doesn't close it. */
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <div
      ref={wrapper}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
          open ? "bg-ocean-50 text-ocean-800" : "text-slate-600 hover:bg-ocean-50 hover:text-ocean-800"
        }`}
      >
        {category.icon} {category.name}
        <span
          className={`text-[8px] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 pt-2"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="w-64 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-2xl shadow-ocean-950/15">
            <Link
              href={`/category/${category.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-ocean-800 transition hover:bg-ocean-50"
            >
              All of {category.name}
              <span aria-hidden>→</span>
            </Link>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {subcategories.map((child) => (
                <Link
                  key={child.slug}
                  href={`/category/${child.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 transition hover:bg-sand-50 hover:text-ocean-800"
                >
                  <span className="text-base" aria-hidden>
                    {child.icon}
                  </span>
                  <span className="truncate">{child.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
