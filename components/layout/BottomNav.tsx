"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/products", label: "Shop", icon: "🛍️" },
  { href: "/cart", label: "Cart", icon: "🛒" },
  { href: "/wishlist", label: "Saved", icon: "♡" },
  { href: "/account", label: "Account", icon: "👤" },
];

/** App-style bottom navigation, visible only on mobile. */
export default function BottomNav() {
  const pathname = usePathname();
  const { count } = useCart();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
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
              {tab.label}
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
