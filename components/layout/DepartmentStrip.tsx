"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CategoryMenu from "./CategoryMenu";
import type { Category } from "@/lib/types";

/** Subcategories listed under each department in the panel before "View all". */
const PER_DEPARTMENT = 6;

/**
 * The desktop category strip.
 *
 * It used to list every department and wrap: at ten departments it ran to
 * two lines, and every new one pushed the page down further. Now the strip
 * keeps ONE line — as many departments as fit, measured — and "All
 * departments" opens a panel with every department and its subcategories,
 * which is how large marketplaces stay navigable at hundreds of categories.
 */
export default function DepartmentStrip({
  departments,
  childrenOf,
  showSell,
}: {
  departments: Category[];
  childrenOf: Map<string, Category[]>;
  showSell: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Until measured, a conservative guess — avoids a two-line flash.
  const [fit, setFit] = useState(Math.min(departments.length, 6));
  const row = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const fixed = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Count how many department links fit beside the fixed items.
  useLayoutEffect(() => {
    const compute = () => {
      if (!row.current || !measure.current || !fixed.current) return;
      const available = row.current.clientWidth - fixed.current.offsetWidth - 32;
      let used = 0;
      let count = 0;
      for (const child of Array.from(measure.current.children) as HTMLElement[]) {
        used += child.offsetWidth + 4;
        if (used > available) break;
        count++;
      }
      setFit(count);
    };
    compute();
    const observer = new ResizeObserver(compute);
    if (row.current) observer.observe(row.current);
    return () => observer.disconnect();
  }, [departments]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const linkClass = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold";

  return (
    <div ref={panel} className="relative mx-auto max-w-7xl px-4">
      {/* Invisible copy of the department links, for measuring their widths. */}
      <div ref={measure} aria-hidden className="pointer-events-none invisible absolute flex whitespace-nowrap">
        {departments.map((c) => (
          <span key={c.slug} className={`${linkClass} pr-6`}>
            {c.icon} {c.name}
          </span>
        ))}
      </div>

      <div ref={row} className="flex items-center gap-1 py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${linkClass} flex items-center gap-1.5 ${open ? "bg-ocean-800 text-white" : "bg-ocean-50 text-ocean-900 hover:bg-ocean-100"}`}
        >
          <span aria-hidden>☰</span> All departments
        </button>
        {departments.slice(0, fit).map((c) => (
          <CategoryMenu key={c.slug} category={c} subcategories={childrenOf.get(c.slug) ?? []} grandchildrenOf={childrenOf} />
        ))}
        <div ref={fixed} className="ml-auto flex items-center gap-1">
          <Link href="/products" className={`${linkClass} text-ocean-800 hover:bg-ocean-50`}>
            All Products
          </Link>
          <Link href="/stores" className={`${linkClass} text-mango-600 hover:bg-mango-50`}>
            ✦ All Stores
          </Link>
          {showSell && (
            <Link href="/sell" className={`${linkClass} font-bold text-emerald-700 hover:bg-emerald-50`}>
              🏪 Sell on Banaadir
            </Link>
          )}
        </div>
      </div>

      {open && (
        <div className="absolute inset-x-4 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-2xl border border-sand-200 bg-white p-6 shadow-2xl">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((d) => {
              const subs = childrenOf.get(d.slug) ?? [];
              return (
                <div key={d.slug} className="min-w-0">
                  <Link
                    href={`/category/${d.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 font-display font-bold text-ocean-950 hover:text-ocean-700"
                  >
                    <span className="text-lg">{d.icon}</span> {d.name}
                  </Link>
                  {subs.length > 0 && (
                    <ul className="mt-2 space-y-1.5 pl-7 text-sm">
                      {subs.slice(0, PER_DEPARTMENT).map((s) => (
                        <li key={s.slug}>
                          <Link
                            href={`/category/${s.slug}`}
                            onClick={() => setOpen(false)}
                            className="text-slate-600 hover:text-ocean-700"
                          >
                            {s.name}
                          </Link>
                        </li>
                      ))}
                      {subs.length > PER_DEPARTMENT && (
                        <li>
                          <Link
                            href={`/category/${d.slug}`}
                            onClick={() => setOpen(false)}
                            className="font-semibold text-ocean-700 hover:underline"
                          >
                            View all {subs.length} →
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
