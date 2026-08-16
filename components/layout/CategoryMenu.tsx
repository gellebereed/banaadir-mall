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

/**
 * Leaves listed under a group before it collapses into "+N more".
 *
 * Long enough that most groups show everything, short enough that Bed &
 * Bath's twenty-one entries do not make its column three times the height
 * of the ones beside it.
 */
const MAX_LEAVES = 8;

export default function CategoryMenu({
  category,
  subcategories,
  grandchildrenOf,
}: {
  category: Category;
  /** Sub-categories directly beneath it. */
  subcategories: Category[];
  /** parent slug → its children, so a group can list what is inside it. */
  grandchildrenOf?: Map<string, Category[]>;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A department with nothing under it is a plain link. Rendering a
  // disclosure arrow that opens an empty panel is worse than no arrow.
  const hasChildren = subcategories.length > 0;

  /*
   * Three levels or two?
   *
   * A department whose children have children of their own gets the wide
   * grouped panel. One whose children are all leaves keeps the simple
   * list — a four-column grid holding three links looks broken.
   */
  const grouped =
    !!grandchildrenOf &&
    subcategories.some((child) => (grandchildrenOf.get(child.slug)?.length ?? 0) > 0);

  /*
   * ── Real groups, and everything else ─────────────────────────────────
   *
   * A supplier import files each of its own groupings straight under the
   * department, so Home & Living ends up with "Tableware" and "Cookware" —
   * genuine groups with a dozen things inside them — sitting beside
   * "Bedding Duvet Cover Set Singles", which is one shelf.
   *
   * Rendering both the same way is what makes the menu look broken: every
   * childless entry takes a whole grid cell to display one bold heading and
   * nothing underneath it, and fourteen of them push the real groups off
   * the bottom of the panel. The eye reads a wall of headings and finds no
   * structure, which is the exact opposite of what a menu is for.
   *
   * So they are separated. Groups get the columns; the loose ones are
   * collected into a single compact block at the end, where they read as
   * what they are — a list of shelves — rather than as fourteen empty
   * departments.
   *
   * The real fix is in the DATA, and it belongs to whoever runs the shop:
   * "Bedding Duvet Cover Set Singles" wants to be a child of "Bed & Bath".
   * The importer now files new arrivals correctly (see lib/import/
   * categories.ts) and /admin/categories can re-parent the ones already
   * there. Until somebody does that, this at least renders it sensibly.
   */
  const realGroups = subcategories.filter(
    (child) => (grandchildrenOf?.get(child.slug)?.length ?? 0) > 0,
  );
  const looseLeaves = subcategories.filter(
    (child) => (grandchildrenOf?.get(child.slug)?.length ?? 0) === 0,
  );

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
      /*
       * A grouped panel is NOT positioned against its own button — it spans
       * the nav row, which is the positioned ancestor. Anchoring a
       * 72rem-wide panel to a button near the right-hand end would push
       * most of it off the side of the screen.
       */
      className={grouped ? "" : "relative"}
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
          className={`absolute top-full z-50 pt-2 ${grouped ? "inset-x-4" : "left-0"}`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div
            className={`overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-2xl shadow-ocean-950/15 ${
              grouped ? "w-full" : "w-72"
            }`}
          >
            <Link
              href={`/category/${category.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 border-b border-sand-100 bg-sand-50 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-ocean-800 transition hover:bg-ocean-50"
            >
              All of {category.name}
              <span aria-hidden>→</span>
            </Link>

            {grouped ? (
              /*
               * ── The grouped panel ──────────────────────────────────────
               * Each column is a group with its own leaves listed beneath
               * it — the shape every large retailer's menu has, because a
               * shopper scans headings, not a hundred-item list.
               *
               * The alternative, which this replaces, was one 264px column
               * holding every descendant of the department. With 115 of
               * them under Home & Living that is a scrolling wall with no
               * structure at all: nothing to scan, nothing to skip, and the
               * thing you want is somewhere in the middle of it.
               */
              <div className="max-h-[75vh] overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
                  {realGroups.map((group) => {
                    const leaves = grandchildrenOf?.get(group.slug) ?? [];
                    return (
                      <div key={group.slug} className="min-w-0">
                        <Link
                          href={`/category/${group.slug}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 text-sm font-extrabold text-ocean-950 hover:text-ocean-700"
                        >
                          <span aria-hidden>{group.icon}</span>
                          <span className="truncate">{group.name}</span>
                        </Link>

                        <ul className="mt-2 space-y-1">
                          {leaves.slice(0, MAX_LEAVES).map((leaf) => (
                            <li key={leaf.slug}>
                              <Link
                                href={`/category/${leaf.slug}`}
                                onClick={() => setOpen(false)}
                                className="block truncate text-[13px] text-slate-500 transition hover:text-ocean-700"
                              >
                                {leaf.name}
                              </Link>
                            </li>
                          ))}
                          {leaves.length > MAX_LEAVES && (
                            <li>
                              <Link
                                href={`/category/${group.slug}`}
                                onClick={() => setOpen(false)}
                                className="block text-[13px] font-bold text-ocean-700 hover:underline"
                              >
                                +{leaves.length - MAX_LEAVES} more →
                              </Link>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {/* Everything that is one shelf rather than a group of them.
                    Chips, not headings — they are the same KIND of thing as
                    the grey links inside the columns above, so they are
                    styled to match rather than competing with the headings. */}
                {looseLeaves.length > 0 && (
                  <div className={realGroups.length > 0 ? "mt-6 border-t border-sand-100 pt-5" : ""}>
                    {realGroups.length > 0 && (
                      <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                        More in {category.name}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-2 gap-y-2">
                      {looseLeaves.map((leaf) => (
                        <Link
                          key={leaf.slug}
                          href={`/category/${leaf.slug}`}
                          onClick={() => setOpen(false)}
                          className="max-w-[15rem] truncate rounded-full border border-sand-200 px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-ocean-400 hover:bg-ocean-50 hover:text-ocean-800"
                        >
                          {leaf.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* A department with only leaves — still a grid, not a list. */
              <div className="max-h-[70vh] overflow-y-auto py-1">
                {subcategories.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/category/${child.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-5 py-2 text-sm text-slate-600 transition hover:bg-sand-50 hover:text-ocean-800"
                  >
                    <span className="text-base" aria-hidden>
                      {child.icon}
                    </span>
                    <span className="truncate">{child.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
