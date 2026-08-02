"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AnnouncementBar from "./AnnouncementBar";
import { useCart } from "@/lib/cart-context";
import { categories as seedCategories } from "@/lib/data/categories";
import type { Category } from "@/lib/types";
import type { Session } from "@/lib/auth";

/** The main call-to-action changes with who is signed in. */
function primaryAction(session: Session | null, storeName?: string) {
  if (session?.role === "admin") {
    return { href: "/admin", label: "🛡️ Control Panel" };
  }
  if (session?.role === "seller") {
    return { href: "/vendor", label: `🏪 ${storeName ?? "My Store"}` };
  }
  return { href: "/sell", label: "Sell on Banaadir" };
}

export default function Header({
  announcement,
  announcementBgColor,
  announcementTextColor,
  announcementScroll = true,
  announcementSpeed = 25,
  session,
  storeName,
  categories: dynamicCategories,
}: {
  announcement: string;
  announcementBgColor?: string;
  announcementTextColor?: string;
  announcementScroll?: boolean;
  announcementSpeed?: number;
  session: Session | null;
  storeName?: string;
  categories?: Category[];
}) {
  const router = useRouter();
  const { count, wishlist } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const action = primaryAction(session, storeName);
  const categoriesList = dynamicCategories && dynamicCategories.length > 0 ? dynamicCategories : seedCategories;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setMenuOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="sticky top-0 z-40">
      {/* Announcement bar */}
      <AnnouncementBar
        announcement={announcement}
        bgColor={announcementBgColor}
        textColor={announcementTextColor}
        autoScroll={announcementScroll}
        speed={announcementSpeed}
      />

      {/* Main bar */}
      <div className="border-b border-sand-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5">
          {/* Mobile menu toggle */}
          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-sand-100 lg:hidden"
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          {/* Logo (Assets are copied into /public — see README) */}
          <Link href="/" className="shrink-0">
            <Image
              src="/banaadir-logo.png"
              alt="Banaadir Mall"
              width={125}
              height={50}
              priority
              className="h-10 w-auto sm:h-11"
            />
          </Link>

          {/* Search (desktop) */}
          <form onSubmit={submitSearch} className="hidden flex-1 md:block">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Search products, brands and stores…"
                className="w-full rounded-full border-2 border-ocean-700/20 bg-sand-50 py-2.5 pl-5 pr-28 text-sm outline-none transition focus:border-ocean-600 focus:bg-white"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 rounded-full bg-ocean-700 px-5 text-sm font-semibold text-white transition hover:bg-mango-500"
              >
                Search
              </button>
            </div>
          </form>

          {/* Actions */}
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href={action.href}
              className="hidden max-w-52 items-center truncate rounded-full bg-mango-100 px-4 py-2 text-sm font-bold text-mango-800 transition hover:bg-mango-200 lg:flex"
            >
              {action.label}
            </Link>
            {session ? (
              <Link
                href="/account"
                aria-label={`Account — ${session.name}`}
                title={session.name}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean-700 font-display text-sm font-extrabold text-white transition hover:bg-ocean-800"
              >
                {session.name.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <HeaderIcon href="/login" label="Sign in" icon="👤" />
            )}
            <HeaderIcon href="/wishlist" label="Wishlist" icon="♡" badge={wishlist.length} />
            <HeaderIcon href="/cart" label="Cart" icon="🛒" badge={count} />
          </nav>
        </div>

        {/* Search (mobile) */}
        <form onSubmit={submitSearch} className="px-4 pb-3 md:hidden">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search Banaadir Mall…"
              className="w-full rounded-full border-2 border-ocean-700/20 bg-sand-50 py-2.5 pl-4 pr-12 text-sm outline-none focus:border-ocean-600 focus:bg-white"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1 bottom-1 flex w-10 items-center justify-center rounded-full bg-ocean-700 text-white"
            >
              🔍
            </button>
          </div>
        </form>

        {/* Category strip (desktop) */}
        <div className="hidden border-t border-sand-100 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1 rail-scroll">
            <Link
              href="/products"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
            >
              All Products
            </Link>
            {categoriesList.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-slate-600 hover:bg-ocean-50 hover:text-ocean-800"
              >
                {c.icon} {c.name}
              </Link>
            ))}
            <Link
              href="/stores"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-mango-600 hover:bg-mango-50"
            >
              ✦ All Stores
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div className="border-b border-sand-200 bg-white shadow-xl lg:hidden">
          <div className="grid grid-cols-2 gap-1 p-3">
            {categoriesList.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-sand-100"
              >
                <span className="text-lg">{c.icon}</span> {c.name}
              </Link>
            ))}
          </div>
          <div className="flex gap-2 border-t border-sand-100 p-3">
            <Link href="/stores" onClick={() => setMenuOpen(false)} className="btn-secondary flex-1 !py-2 text-sm">
              Browse Stores
            </Link>
            <Link
              href={action.href}
              onClick={() => setMenuOpen(false)}
              className="btn-primary flex-1 truncate !py-2 text-sm"
            >
              {action.label}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/** Icon button with an optional count badge (cart / wishlist). */
function HeaderIcon({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-sand-100"
    >
      <span aria-hidden>{icon}</span>
      {badge !== undefined && badge > 0 && (
        <span
          /* Re-keying on the number remounts the span, which replays the
             pop animation every time the count changes. */
          key={badge}
          className="animate-badge-pop absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
