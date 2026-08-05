"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE ACCOUNT CONTROL in the header.
 * ─────────────────────────────────────────────────────────────────────────
 * Signed out, this is a plain "Sign in" button with "Sign up" beside it.
 * Signed in, it is the avatar, and opening it gives you your account, your
 * dashboard if you have one, and — the part that was missing — sign out.
 *
 * Sign out previously existed only on the account page, so leaving a
 * session on a shared phone meant navigating to /account and hunting for a
 * button. On a device more than one person uses, the way out has to be
 * reachable from every page, which means it belongs in the header.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth-actions";
import type { Session } from "@/lib/auth";

export default function AccountMenu({
  session,
  storeName,
}: {
  session: Session | null;
  storeName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
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

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-full px-3 py-2 text-sm font-bold text-ocean-800 transition hover:bg-ocean-50"
        >
          Sign in
        </Link>
        {/* Full label on desktop; on a phone the header is already crowded
            and the sign-in page carries a "create an account" link. */}
        <Link
          href="/register"
          className="hidden rounded-full bg-ocean-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-ocean-800 sm:inline-flex"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const dashboard =
    session.role === "admin"
      ? { href: "/admin", label: "Control panel", icon: "🛡️" }
      : session.role === "seller"
        ? { href: "/vendor", label: storeName ?? "My store", icon: "🏪" }
        : null;

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account — ${session.name}`}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean-700 font-display text-sm font-extrabold text-white transition hover:bg-ocean-800"
      >
        {session.name.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-2xl shadow-ocean-950/15">
          <div className="border-b border-sand-100 bg-sand-50 px-4 py-3">
            <p className="truncate text-sm font-bold text-ocean-950">{session.name}</p>
            <p className="truncate text-xs text-slate-400">{session.email}</p>
          </div>

          <div className="py-1">
            {dashboard && (
              <Link
                href={dashboard.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
              >
                <span aria-hidden>{dashboard.icon}</span>
                {dashboard.label}
              </Link>
            )}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-sand-50"
            >
              <span aria-hidden>👤</span> My account
            </Link>
            <Link
              href="/track"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-sand-50"
            >
              <span aria-hidden>📦</span> Track an order
            </Link>
            <Link
              href="/wishlist"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-sand-50"
            >
              <span aria-hidden>♡</span> Wishlist
            </Link>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await signOut();
              } catch {
                // Ignore redirect errors from Next.js
              }
              window.location.href = "/";
            }}
            className="border-t border-sand-100"
          >
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold text-coral-600 transition hover:bg-coral-50"
            >
              <span aria-hidden>↩</span> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
