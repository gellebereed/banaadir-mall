"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchStore } from "@/app/auth-actions";

export interface SwitchableStore {
  slug: string;
  name: string;
  icon: string;
  logo?: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHICH SHOP AM I IN
 * ─────────────────────────────────────────────────────────────────────────
 * One person can be on more than one store's team — see Session.stores.
 * Before this, the second invitation was effectively dead: they signed in,
 * landed in whichever store was read first, and had no route to the other
 * one short of a different browser.
 *
 * Rendered ONLY when there is somewhere to switch to. A dropdown offering a
 * single choice is a control that teaches people to ignore controls, so a
 * one-store account sees the plain store name exactly as it did before.
 *
 * ── Why the store name is a button and not a link ────────────────────────
 * Switching rewrites the session cookie: the target store is re-checked
 * against the team table server-side and the permissions are rebuilt from
 * the row for THAT store (switchStore). A link could not do that, and a
 * client-side switch would mean the browser deciding what someone is
 * allowed to open.
 */
export default function StoreSwitcher({
  current,
  stores,
}: {
  current: SwitchableStore | undefined;
  /** Every store this account may open, this one included. */
  stores: SwitchableStore[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape, so the panel never strands itself open over the
  // navigation it is sitting on top of.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(slug: string) {
    if (slug === current?.slug) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await switchStore(slug);
      } catch (err) {
        // A redirect is how success leaves this function — it is not a
        // failure and must be re-thrown for Next.js to act on.
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
        setError((err as Error)?.message || "Could not switch store.");
        setOpen(false);
      }
    });
  }

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/10 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 truncate font-display text-sm font-extrabold text-white">
          {current?.name ?? "My Store"}
        </span>
        <span className="shrink-0 text-[10px] text-ocean-300" aria-hidden>
          {pending ? "…" : "▾"}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Switch store"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-ocean-800 bg-ocean-900 p-1 shadow-xl"
        >
          {stores.map((store) => {
            const active = store.slug === current?.slug;
            return (
              <li key={store.slug}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(store.slug)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                    active ? "bg-ocean-700" : "hover:bg-ocean-800"
                  }`}
                >
                  {store.logo ? (
                    <Image
                      src={store.logo}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="shrink-0 text-sm">{store.icon || "🏪"}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
                    {store.name}
                  </span>
                  {active && <span className="shrink-0 text-[10px] text-ocean-200">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="mt-1 text-[10px] font-semibold text-coral-300" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
