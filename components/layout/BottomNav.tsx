"use client";

import { useT } from "@/components/prefs/PrefsProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-context";

const TABS = [
  { href: "/", label: "tab.home", icon: "🏠" },
  { href: "/products", label: "tab.shop", icon: "🛍️" },
  { href: "/cart", label: "tab.cart", icon: "🛒" },
  { href: "/wishlist", label: "tab.saved", icon: "♡" },
  { href: "/account", label: "tab.account", icon: "👤" },
] as const;

/** App-style bottom navigation, visible only on mobile. */
export default function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  const { count } = useCart();
  /*
   * The tab that was just tapped, lit before its page arrives. The bar used
   * to follow the address alone, which only changes once the server has
   * answered — so for a second or two after a tap nothing moved, and the
   * tap looked like it hadn't registered. Cleared as soon as the address
   * changes (wherever it lands, /login included), so the bar goes back to
   * following the page that is actually showing.
   */
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);

  return (
    // pb-[env(safe-area-inset-bottom)]: on a notched phone the bottom strip
    // of the screen belongs to the home indicator, and a bar drawn to
    // `bottom: 0` puts its labels underneath it.
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = tapped
            ? tab.href === tapped
            : tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setTapped(tab.href)}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-transform active:scale-90 ${
                active ? "text-ocean-700" : "text-slate-400"
              }`}
            >
              <span className="relative text-xl leading-none">
                {tab.icon}
                {tab.href === "/cart" && count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[9px] font-bold text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              {t(tab.label)}
              {active && (
                <span className="absolute -top-px h-0.5 w-8 rounded-full bg-ocean-700" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
