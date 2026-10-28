"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AnnouncementBar from "./AnnouncementBar";
import AccountMenu from "./AccountMenu";
import DepartmentStrip from "./DepartmentStrip";
import SearchBox from "./SearchBox";
import DeliveryCity from "./DeliveryCity";
import { isCheckoutPath } from "./ShopChrome";
import LiteToggle from "@/components/prefs/LiteToggle";
import { useCart } from "@/lib/cart-context";
import { categories as seedCategories } from "@/lib/data/categories";
import type { Category, MarketingSettings } from "@/lib/types";
import type { Session } from "@/lib/auth";
import { loginHref } from "@/lib/safe-next";
import { LanguageToggle, useT } from "@/components/prefs/PrefsProvider";
import type { T } from "@/lib/i18n";

/** The main call-to-action changes with who is signed in. */
function primaryAction(session: Session | null, t: T, storeName?: string) {
  if (session?.role === "admin") {
    return { href: "/admin", label: "🛡️ Control Panel" };
  }
  if (session?.role === "seller") {
    return { href: "/vendor", label: `🏪 ${storeName ?? "My Store"}` };
  }
  return { href: "/products?sort=discount", label: t("nav.dailyDeals") };
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
  delivery,
}: {
  announcement: string;
  announcementBgColor?: string;
  announcementTextColor?: string;
  announcementScroll?: boolean;
  announcementSpeed?: number;
  session: Session | null;
  storeName?: string;
  categories?: Category[];
  delivery: MarketingSettings["delivery"];
}) {
  const { count, wishlist } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();
  const action = primaryAction(session, t, storeName);

  // Checkout gets a focused header: the logo, a way back to the cart, and
  // the reassurance that it is secure — no search box or department menu
  // pulling a shopper away halfway through paying.
  if (isCheckoutPath(pathname)) {
    return (
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          {/* Not once the order is placed — the cart is empty by then. */}
          {count > 0 && (
          <Link
            href="/cart"
            aria-label={t("checkout.backToCart")}
            className="flex h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-slate-600 hover:bg-sand-100 hover:text-ocean-800"
          >
            <span aria-hidden className="text-lg leading-none">←</span>
            <span className="hidden sm:inline">{t("checkout.backToCart")}</span>
          </Link>
          )}
          <Link href="/" className="shrink-0">
            <Image
              src="/banaadir-logo.png"
              alt="Banaadir Mall"
              width={125}
              height={50}
              priority
              className="h-9 w-auto sm:h-10"
            />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 sm:text-sm">
              <span aria-hidden>🔒</span>
              <span className="hidden min-[400px]:inline">{t("cart.trust.secure")}</span>
            </span>
            <LanguageToggle />
          </div>
        </div>
      </header>
    );
  }
  /**
   * Departments only. The category list is the whole tree flattened, so
   * without this filter a menswear import puts "Socks" and "Bracelets" in
   * the main navigation beside "Electronics". Sub-categories are reached
   * from their department's page.
   */
  const allCategories = dynamicCategories ?? seedCategories;
  const categoriesList = allCategories.filter((c) => !c.parentSlug && !c.hidden);

  /**
   * Sub-categories grouped under their department, so the strip can open
   * them in a dropdown instead of burying them one page deeper.
   */
  const childrenOf = new Map<string, Category[]>();
  for (const category of allCategories) {
    if (!category.parentSlug || category.hidden) continue;
    const siblings = childrenOf.get(category.parentSlug);
    if (siblings) siblings.push(category);
    else childrenOf.set(category.parentSlug, [category]);
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
            aria-label={t("nav.openMenu")}
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

          {/* Where it's going, and how long it takes — like a shop's door sign. */}
          <DeliveryCity delivery={delivery} variant="compact" />

          {/* Search (desktop) — with suggestions as you type */}
          <div className="hidden flex-1 md:block">
            <SearchBox variant="desktop" onNavigate={() => setMenuOpen(false)} />
          </div>

          {/* Actions */}
          <nav className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/products?sort=discount"
              className="hidden items-center rounded-full bg-mango-100 px-3.5 py-2 text-sm font-bold text-mango-900 transition hover:bg-mango-200 lg:flex"
            >
              {t("nav.dailyDeals")}
            </Link>
            {/*
              "Sell on Banaadir" has moved to the footer. The header is the
              customer's tool bar, and while the marketplace is recruiting
              SHOPPERS the loudest thing in it should not be an invitation to
              become a supplier — sellers arrive deliberately and will find
              the link.
            */}
            {session?.role === "admin" && (
              <Link
                href="/admin"
                className="hidden items-center rounded-full bg-ocean-100 px-3.5 py-2 text-sm font-bold text-ocean-900 transition hover:bg-ocean-200 lg:flex"
              >
                🛡️ Control Panel
              </Link>
            )}
            {session?.role === "seller" && (
              <Link
                href="/vendor"
                className="hidden items-center rounded-full bg-ocean-100 px-3.5 py-2 text-sm font-bold text-ocean-900 transition hover:bg-ocean-200 lg:flex"
              >
                🏪 {storeName ?? "My Store"}
              </Link>
            )}
            <span className="hidden lg:block">
              <LanguageToggle />
            </span>
            <HeaderIcon href="/wishlist" label={t("nav.wishlist")} icon="♡" badge={wishlist.length} />
            <HeaderIcon href="/cart" label={t("nav.cart")} icon="🛒" badge={count} />
            <AccountMenu session={session} storeName={storeName} />
          </nav>
        </div>

        {/* Search (mobile) */}
        <div className="px-4 pb-2 md:hidden">
          <SearchBox variant="mobile" onNavigate={() => setMenuOpen(false)} />
        </div>
        <div className="px-4 pb-2 lg:hidden">
          <DeliveryCity delivery={delivery} variant="bar" />
        </div>

        {/* Category strip (desktop) */}
        <div className="hidden border-t border-sand-100 lg:block">
          {/*
            No `overflow-x-auto`: scrolling clipped anything absolutely
            positioned inside — the dropdowns and the departments panel.
            The strip keeps one line by showing only the departments that
            fit; the rest are one click away under "All departments".
          */}
          <DepartmentStrip departments={categoriesList} childrenOf={childrenOf} showSell={!session} />
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div className="border-b border-sand-200 bg-white shadow-xl lg:hidden">
          {/* On a phone the same tree becomes an accordion — a hover
              dropdown is unusable here, but the sub-categories are just as
              worth reaching. */}
          <div className="max-h-[70vh] overflow-y-auto p-3">
            {categoriesList.map((c) => {
              const kids = childrenOf.get(c.slug) ?? [];
              return (
                <details key={c.slug} className="border-b border-sand-100 last:border-0">
                  <summary
                    className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sand-100 ${
                      kids.length === 0 ? "[&::-webkit-details-marker]:hidden" : ""
                    }`}
                  >
                    <span className="text-lg">{c.icon}</span>
                    <span className="flex-1">{c.name}</span>
                    {kids.length > 0 && (
                      <span className="text-[10px] text-slate-400">{kids.length}</span>
                    )}
                  </summary>

                  <div className="pb-2 pl-10">
                    <Link
                      href={`/category/${c.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-1.5 text-xs font-bold text-ocean-700 hover:bg-ocean-50"
                    >
                      {t("nav.allOf", { name: c.name })}
                    </Link>
                    {/*
                      Groups are headings with their leaves indented under
                      them, mirroring the desktop panel. A phone showing a
                      flat run of 115 links is the same wall of text, just
                      taller.
                    */}
                    {kids.map((child) => {
                      const leaves = childrenOf.get(child.slug) ?? [];
                      return (
                        <div key={child.slug} className={leaves.length > 0 ? "mt-1" : ""}>
                          <Link
                            href={`/category/${child.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className={`block rounded-lg px-3 py-1.5 hover:bg-sand-100 ${
                              leaves.length > 0
                                ? "text-xs font-bold text-ocean-950"
                                : "text-xs text-slate-600"
                            }`}
                          >
                            {child.icon} {child.name}
                          </Link>
                          {leaves.map((leaf) => (
                            <Link
                              key={leaf.slug}
                              href={`/category/${leaf.slug}`}
                              onClick={() => setMenuOpen(false)}
                              className="block rounded-lg px-3 py-1 pl-7 text-xs text-slate-500 hover:bg-sand-100"
                            >
                              {leaf.name}
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 px-4 py-2.5 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2">
              {t("pref.language")} <LanguageToggle />
            </span>
            <LiteToggle />
          </div>
          <div className="flex gap-2 border-t border-sand-100 p-3">
            <Link href="/stores" onClick={() => setMenuOpen(false)} className="btn-secondary flex-1 !py-2 text-sm">
              {t("nav.browseStores")}
            </Link>
            {session ? (
              <Link
                href={action.href}
                onClick={() => setMenuOpen(false)}
                className="btn-primary flex-1 truncate !py-2 text-sm"
              >
                {action.label}
              </Link>
            ) : (
              <Link
                href={pathname && pathname !== "/" ? loginHref(pathname) : "/login"}
                onClick={() => setMenuOpen(false)}
                className="btn-primary flex-1 !py-2 text-sm"
              >
                {t("nav.signIn")}
              </Link>
            )}
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
