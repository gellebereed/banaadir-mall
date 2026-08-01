"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarItem {
  href: string;
  icon: string;
  label: string;
  /** Match this item only on the exact path (for the section root). */
  exact?: boolean;
  /** Count shown as a red badge — e.g. pending approvals needing action. */
  badge?: number;
}

/**
 * Shared navigation for the admin panel and the seller dashboard —
 * dark sidebar on desktop, horizontal tab bar on mobile.
 *
 * Dashboard pages render on the server, so a click always waits for a
 * round-trip. Without feedback that reads as "the button didn't work" and
 * people click repeatedly, so each link shows a spinner while its page is
 * loading (useLinkStatus) and the segment's loading.tsx paints instantly.
 */
export default function DashboardSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto rail-scroll lg:flex-col lg:gap-1.5">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              active
                ? "bg-ocean-800 text-white shadow-md"
                : "text-ocean-100/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <NavIcon icon={item.icon} />
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1.5 text-[10px] font-extrabold text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
      <Link
        href="/"
        className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-ocean-100/70 transition hover:bg-white/10 hover:text-white lg:mt-auto"
      >
        <NavIcon icon="🏝️" /> Back to Shop
      </Link>
    </nav>
  );
}

/** Swaps the icon for a spinner while this link's page is loading. */
function NavIcon({ icon }: { icon: string }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        aria-label="Loading"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
      />
    );
  }
  return <span className="shrink-0">{icon}</span>;
}
