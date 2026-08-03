"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getNewOrdersAction, markOrdersSeen } from "@/app/actions";
import { getPublicClient, isSupabaseConfigured } from "@/lib/supabase/public-client";
import { money } from "@/lib/format";
import type { Order } from "@/lib/types";

/**
 * Live "you have a new order" bell for the seller dashboard.
 *
 * A seller previously found out an order existed whenever they next
 * happened to open the orders page — the WhatsApp hand-off at checkout only
 * fires if the CUSTOMER taps it.
 *
 * Delivery is layered so the useful part always works:
 *   1. Supabase Realtime — the row arrives the moment it is inserted.
 *   2. A slow poll — covers a dropped socket, a sleeping laptop, and
 *      databases where the realtime publication wasn't enabled.
 *   3. The server-rendered count — correct on every page load regardless.
 *
 * Unread state lives in the database, not this component, so checking
 * orders on a phone doesn't leave the same badge waiting on a laptop.
 */

/** How often to re-check when realtime isn't carrying the news. */
const POLL_MS = 60_000;

/**
 * Order ids already announced, shared across every mounted instance.
 *
 * Module scope rather than a ref: React StrictMode mounts effects twice in
 * development, and this component previously appeared twice in the layout —
 * either would produce two chimes and two desktop notifications for a
 * single order. Sharing the set makes a duplicate mount harmless instead of
 * merely survivable.
 *
 * (Dashboard pages do contain a second, hidden copy of the sidebar markup.
 * That is React's Suspense streaming container — inert HTML that is never
 * hydrated — not a second component instance.)
 */
const announcedIds = new Set<string>();

export default function OrderNotifications({
  storeSlug,
  initialNewOrders,
}: {
  storeSlug: string;
  /** Server-rendered so the badge is correct before any JS runs. */
  initialNewOrders: Order[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialNewOrders);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Orders already on screen at first render are not "new" — they were
  // counted on the server and shouldn't chime on arrival.
  useEffect(() => {
    initialNewOrders.forEach((o) => announcedIds.add(o.id));
  }, [initialNewOrders]);

  const refetch = useCallback(async () => {
    try {
      const fresh = await getNewOrdersAction(storeSlug);
      setOrders(fresh);
      const unannounced = fresh.map((o) => o.id).filter((id) => !announcedIds.has(id));
      if (unannounced.length > 0) {
        // Claim them BEFORE the await-free announce, so a second mounted
        // instance racing this same fetch finds nothing left to announce.
        unannounced.forEach((id) => announcedIds.add(id));
        chime();
        notify(unannounced.length);
      }
    } catch {
      // A failed refresh must never break the dashboard around it.
    }
  }, [storeSlug]);

  // ── 1. Realtime ──────────────────────────────────────────────────────
  //
  // Render this component ONCE per page. `supabase.channel(topic)` returns
  // the EXISTING channel when one already has that topic, and
  // RealtimeChannel.subscribe() throws if called twice on the same
  // instance — so a second copy of this bell threw inside its effect and
  // took the whole dashboard down with an "Application error" screen.
  //
  // The try/catch is the belt to that braces: live updates are a
  // convenience, and nothing about them is worth breaking a seller's main
  // screen for. Losing realtime silently drops us to the poll below.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    try {
      const supabase = getPublicClient();
      const channel = supabase
        .channel(`orders:${storeSlug}`)
        .on(
          "postgres_changes",
          // Filtered server-side: a busy marketplace shouldn't push every
          // shop's orders to every shop's browser.
          { event: "INSERT", schema: "public", table: "orders", filter: `store=eq.${storeSlug}` },
          () => { if (!cancelled) void refetch(); },
        )
        .subscribe((status) => {
          if (!cancelled) setLive(status === "SUBSCRIBED");
        });

      cleanup = () => { void supabase.removeChannel(channel); };
    } catch {
      // Realtime unavailable — the poll still carries new orders, and the
      // dot on the bell already says which mode is running.
      setLive(false);
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [storeSlug, refetch]);

  // ── 2. Poll ──────────────────────────────────────────────────────────
  // Also fires when the tab is refocused: a laptop that slept misses every
  // socket message, and coming back to a stale badge is exactly when a
  // seller stops trusting it.
  useEffect(() => {
    const timer = setInterval(() => void refetch(), POLL_MS);
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch]);

  // Close the panel on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function clearAll() {
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return;
    setOrders([]);           // optimistic: the badge should vanish on tap
    setOpen(false);
    await markOrdersSeen(ids);
    router.refresh();
  }

  const count = orders.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          count > 0 ? `${count} new order${count === 1 ? "" : "s"}` : "Notifications"
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-ocean-950">
            {count > 99 ? "99+" : count}
          </span>
        )}
        {/* A quiet dot, not a label — it answers "is this live?" for anyone
            who wonders, without nagging anyone who doesn't. */}
        <span
          title={live ? "Live — new orders appear instantly" : "Checking for new orders every minute"}
          className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-ocean-950 ${
            live ? "bg-emerald-400" : "bg-slate-400"
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-sand-100 px-4 py-3">
            <p className="font-display text-sm font-extrabold text-ocean-950">
              {count > 0 ? `${count} new order${count === 1 ? "" : "s"}` : "No new orders"}
            </p>
            {count > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-bold text-ocean-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {count === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              You&apos;re all caught up. New orders appear here the moment
              they&apos;re placed.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-sand-100 overflow-y-auto">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href="/vendor/orders"
                    onClick={clearAll}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-sand-50"
                  >
                    <span className="mt-0.5 text-lg">🧾</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ocean-950">
                        {o.customer}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {o.items.reduce((s, i) => s + i.qty, 0)} item
                        {o.items.reduce((s, i) => s + i.qty, 0) === 1 ? "" : "s"} ·{" "}
                        {money(o.total)} · {o.city}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">{o.id}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A short two-tone chime via WebAudio — no asset to ship, and no autoplay
 * warning, because it only ever plays after the seller has interacted with
 * the page. Silently does nothing where audio is blocked.
 */
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") { void ctx.close(); return; }

    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio is a nicety; the badge is the actual notification.
  }
}

/**
 * A desktop notification, so an order lands even when the dashboard is in a
 * background tab. Permission is never *requested* here — asking on page
 * load is the pattern everyone denies. It is only used if already granted;
 * the button in Settings is what asks.
 */
function notify(count: number) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(`${count} new order${count === 1 ? "" : "s"} · Banaadir Mall`, {
      body: "Open your dashboard to pack and dispatch.",
      tag: "banaadir-new-orders",
    });
  } catch {
    // Not supported, or blocked — the badge still carries it.
  }
}
