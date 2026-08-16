"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The three screens of the counter, in the order the day happens.
 *
 * Big touch targets and plain words. Whoever uses this is standing up,
 * probably holding something, and has not read a manual.
 */
const TABS = [
  { href: "/vendor/pos", label: "Sell", icon: "💵", exact: true },
  { href: "/vendor/pos/pantry", label: "Pantry", icon: "🛒" },
  { href: "/vendor/pos/recipes", label: "Recipes", icon: "🥐" },
];

export default function PosTabs({ canManageSettings }: { canManageSettings: boolean }) {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex gap-2">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                active
                  ? "bg-ocean-950 text-white shadow-sm"
                  : "bg-white text-slate-600 ring-1 ring-sand-200 hover:bg-sand-100"
              }`}
            >
              <span aria-hidden className="text-base">
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {canManageSettings && (
        <Link
          href="/vendor/pos/settings"
          className="text-xs font-bold text-slate-400 transition hover:text-ocean-700"
        >
          ⚙️ Counter settings
        </Link>
      )}
    </div>
  );
}
