"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Compass,
  ExternalLink,
  FolderTree,
  History,
  Layers,
  Images,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MoreHorizontal,
  Package,
  ScanBarcode,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  UserCog,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/auth-actions";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DASHBOARD SHELL — the frame around every seller and admin page.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why the dashboards got their own frame ───────────────────────────────
 * They used to sit inside the SHOP: the promo ticker, the product search,
 * the category bar, Daily Deals and the cart took the top ~180px of every
 * dashboard screen, and on a phone the shopper's Home/Shop/Cart bar sat
 * over the bottom of it. The navigation itself was a dark box that, on a
 * phone, became a sideways-scrolling strip with half its items off screen.
 *
 * Now:
 *   top bar     store (or switcher) · View store · new-order bell · account
 *   desktop     a light sidebar with every section, always in view
 *   phone       a bottom tab bar for the 4 places used all day, and "More"
 *               for the rest — the pattern every seller app on their phone
 *               already uses
 *
 * The shop's own header, footer and tab bar hide themselves on these
 * routes — see components/layout/ShopChrome.tsx.
 *
 * The bell is passed in ONCE and rendered once. Rendering it twice
 * subscribes to the same realtime channel twice, which throws (see the
 * note in app/vendor/layout.tsx).
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ShellIcon =
  | "dashboard"
  | "products"
  | "photos"
  | "pos"
  | "orders"
  | "promotions"
  | "flash"
  | "team"
  | "settings"
  | "account"
  | "analytics"
  | "stores"
  | "categories"
  | "marketing"
  | "discovery"
  | "commission"
  | "accounts"
  | "payouts"
  | "activity"
  | "collections";

const ICONS: Record<ShellIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  photos: Images,
  pos: ScanBarcode,
  orders: ClipboardList,
  promotions: Tag,
  flash: Zap,
  team: Users,
  settings: Settings,
  account: UserCog,
  analytics: BarChart3,
  stores: Store,
  categories: FolderTree,
  marketing: Megaphone,
  discovery: Compass,
  commission: Landmark,
  accounts: KeyRound,
  payouts: Wallet,
  activity: History,
  collections: Layers,
};

export interface ShellItem {
  href: string;
  icon: ShellIcon;
  label: string;
  /** Match this item only on the exact path (for the section root). */
  exact?: boolean;
  /** Count shown as a badge — e.g. orders or approvals waiting. */
  badge?: number;
  /** Shown in the phone's bottom tab bar (keep to four). */
  tab?: boolean;
}

function isActive(pathname: string, item: ShellItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function DashboardShell({
  brand,
  subtitle,
  bell,
  items,
  viewStoreHref,
  user,
  notice,
  children,
}: {
  /** Store name, or the store switcher. Rendered on the dark top bar. */
  brand: React.ReactNode;
  subtitle?: string;
  /** The new-order bell (seller) — rendered exactly once. */
  bell?: React.ReactNode;
  items: ShellItem[];
  viewStoreHref?: string;
  user: { name: string; email: string; role: string };
  /** A banner above the page (e.g. "switch to your own email"). */
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  // Navigating closes the drawer.
  useEffect(() => setDrawer(false), [pathname]);

  // Escape closes it, and the page behind must not scroll while it's open.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [drawer]);

  const tabs = items.filter((i) => i.tab).slice(0, 4);
  const moreActive = !tabs.some((t) => isActive(pathname, t));

  return (
    <div className="min-h-screen bg-sand-50">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-ocean-950 text-white">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ocean-100 transition hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="hidden shrink-0 items-center gap-2 sm:flex" title="Banaadir Mall">
            <Image src="/banaadir-bag.png" alt="Banaadir Mall" width={28} height={28} className="h-7 w-7" />
          </Link>
          <span className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 max-w-xs items-center">{brand}</div>
            {subtitle && <p className="truncate text-[10px] leading-tight text-ocean-300">{subtitle}</p>}
          </div>
          {viewStoreHref && (
            <Link
              href={viewStoreHref}
              target="_blank"
              className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-ocean-100 transition hover:bg-white/10 sm:flex"
            >
              View store <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {bell}
          <AccountMenu user={user} />
        </div>
      </header>

      <div className="flex">
        {/* ── Desktop sidebar ───────────────────────────────────────── */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-sand-200 bg-white px-3 py-4 lg:flex">
          <NavList items={items} pathname={pathname} />
          <ShopLink />
        </aside>

        {/* ── Page ──────────────────────────────────────────────────── */}
        {/* A div, not <main>: the root layout's <main> already wraps this. */}
        <div className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7">
          <div className="mx-auto max-w-6xl">
            {notice}
            {children}
          </div>
        </div>
      </div>

      {/* ── Phone: bottom tab bar ──────────────────────────────────── */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
                  active ? "text-ocean-800" : "text-slate-400"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="absolute left-1/2 top-1 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[9px] text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
              moreActive ? "text-ocean-800" : "text-slate-400"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* ── Phone: drawer ──────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-ocean-950/50 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col overflow-y-auto bg-white px-3 pb-6 pt-3 shadow-2xl animate-fade-up">
            <div className="mb-3 flex items-center justify-between px-2">
              <div className="min-w-0">
                <p className="truncate font-display font-extrabold text-ocean-950">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-sand-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList items={items} pathname={pathname} />
            {viewStoreHref && (
              <Link
                href={viewStoreHref}
                target="_blank"
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-sand-50"
              >
                <ExternalLink className="h-[18px] w-[18px] text-slate-400" /> View store
              </Link>
            )}
            <ShopLink />
            <SignOutRow />
          </div>
        </div>
      )}
    </div>
  );
}

function NavList({ items, pathname }: { items: ShellItem[]; pathname: string }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-ocean-50 font-bold text-ocean-900"
                : "font-semibold text-slate-600 hover:bg-sand-50 hover:text-ocean-900"
            }`}
          >
            <NavIcon Icon={Icon} active={active} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1.5 text-[10px] font-extrabold text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** The icon, swapped for a spinner while its page loads — instant feedback. */
function NavIcon({ Icon, active }: { Icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        aria-label="Loading"
        className="h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-ocean-200 border-t-ocean-700"
      />
    );
  }
  return (
    <Icon
      className={`h-[18px] w-[18px] shrink-0 ${active ? "text-ocean-700" : "text-slate-400 group-hover:text-ocean-700"}`}
      strokeWidth={active ? 2.4 : 2}
    />
  );
}

function ShopLink() {
  return (
    <Link
      href="/"
      className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 pt-4 text-sm font-semibold text-slate-500 transition hover:bg-sand-50 hover:text-ocean-900"
    >
      <ShoppingBag className="h-[18px] w-[18px] text-slate-400" /> Back to the shop
    </Link>
  );
}

async function doSignOut() {
  try {
    await signOut();
  } catch {
    // The action redirects; a full reload is what we want either way.
  }
  window.location.href = "/";
}

function SignOutRow() {
  return (
    <button
      type="button"
      onClick={doSignOut}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 transition hover:bg-coral-100/50 hover:text-coral-700"
    >
      <LogOut className="h-[18px] w-[18px] text-slate-400" /> Sign out
    </button>
  );
}

function AccountMenu({ user }: { user: { name: string; email: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-mango-500 text-sm font-extrabold text-white ring-2 ring-white/10 transition hover:bg-mango-600"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-sand-200 bg-white text-slate-700 shadow-2xl">
          <div className="border-b border-sand-100 px-4 py-3">
            <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-1 text-[11px] font-semibold text-ocean-700">{user.role}</p>
          </div>
          <div className="py-1 text-sm">
            <Link href="/account/security" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-sand-50">
              <UserCog className="h-4 w-4 text-slate-400" /> Password &amp; email
            </Link>
            <Link href="/" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-sand-50">
              <ShoppingBag className="h-4 w-4 text-slate-400" /> Back to the shop
            </Link>
            <button
              type="button"
              onClick={doSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-coral-100/40 hover:text-coral-700"
            >
              <LogOut className="h-4 w-4 text-slate-400" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
