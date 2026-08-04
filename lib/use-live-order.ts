"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrderParcelsAction, type OrderParcel } from "@/app/actions";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  LIVE ORDER STATUS — keeps a customer's tracking view current.
 * ─────────────────────────────────────────────────────────────────────────
 * When a seller marks a parcel "shipped", the customer looking at their
 * order should see it without pressing reload. This polls for that.
 *
 * ── Why polling and not something cleverer ───────────────────────────────
 * Realtime sockets would be the obvious answer, and they are the wrong
 * trade here. Status changes a handful of times over a couple of days, the
 * app deploys to serverless functions where a held-open connection is
 * expensive and awkward, and the audience is on mobile data in Mogadishu.
 * A request every twenty seconds, only while someone is actually looking,
 * costs less than a socket that idles for two days.
 *
 * Three rules keep that cheap:
 *   · nothing polls while the tab is hidden — a backgrounded phone browser
 *     must not spend someone's data allowance;
 *   · returning to the tab refetches immediately, so the first thing you
 *     see on coming back is current rather than twenty seconds stale;
 *   · polling STOPS once every parcel is delivered or cancelled. A finished
 *     order cannot change again, and an order page left open on a shop
 *     counter would otherwise poll forever.
 * ─────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_INTERVAL = 20_000;

/** Statuses after which nothing more will happen. */
const TERMINAL = new Set(["delivered", "cancelled"]);

export interface LiveOrderState {
  parcels: OrderParcel[];
  /** True while the first load is in flight. */
  loading: boolean;
  /** Parcel ids whose status changed on the most recent poll. */
  justChanged: string[];
  /** When we last heard from the server. */
  lastCheckedAt: number | null;
  /** False once every parcel has reached a terminal status. */
  live: boolean;
  refresh: () => void;
}

function signature(parcels: OrderParcel[]): string {
  return parcels
    .map((p) => `${p.order.id}:${p.order.status}:${p.order.delivery?.courier?.phone ?? ""}`)
    .join("|");
}

export function useLiveOrder(
  orderId: string | undefined,
  initial: OrderParcel[] = [],
  intervalMs = DEFAULT_INTERVAL,
): LiveOrderState {
  const [parcels, setParcels] = useState<OrderParcel[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [justChanged, setJustChanged] = useState<string[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  // Held in refs so the polling effect doesn't restart on every update,
  // which would reset the interval and effectively poll far too often.
  const previous = useRef(signature(initial));
  const inFlight = useRef(false);
  const parcelsRef = useRef(parcels);

  const settled =
    parcels.length > 0 && parcels.every((p) => TERMINAL.has(p.order.status));

  const check = useCallback(async () => {
    if (!orderId || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await getOrderParcelsAction(orderId);
      if (next.length === 0) return;

      const nextSignature = signature(next);
      if (nextSignature !== previous.current) {
        const before = new Map(
          parcelsRef.current.map((p) => [p.order.id, p.order.status] as const),
        );
        setJustChanged(
          next
            .filter((p) => before.has(p.order.id) && before.get(p.order.id) !== p.order.status)
            .map((p) => p.order.id),
        );
        previous.current = nextSignature;
        setParcels(next);
      }
      setLastCheckedAt(Date.now());
    } catch {
      // A failed poll is not worth surfacing: the view already shows the
      // last known state, and the next tick will try again.
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [orderId]);

  // Mirror of `parcels` for use inside `check` without making it a dependency.
  useEffect(() => {
    parcelsRef.current = parcels;
  }, [parcels]);

  useEffect(() => {
    if (!orderId) return;
    if (parcelsRef.current.length === 0) void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /**
   * Adopt parcels the caller fetched itself.
   *
   * The tracking page looks an order up by number before it knows the id,
   * so its first parcels arrive from that lookup rather than from here.
   * Seeding avoids a visible empty state between the two. Guarded on being
   * empty, so this never fights the polled data afterwards.
   */
  useEffect(() => {
    if (initial.length === 0 || parcelsRef.current.length > 0) return;
    parcelsRef.current = initial;
    previous.current = signature(initial);
    setParcels(initial);
    setLoading(false);
  }, [initial]);

  useEffect(() => {
    if (!orderId || settled) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void check();
    };

    const timer = window.setInterval(tick, intervalMs);

    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [orderId, intervalMs, settled, check]);

  // Clear the highlight after it has been seen, so a status change flashes
  // once rather than staying marked "new" for the rest of the session.
  useEffect(() => {
    if (justChanged.length === 0) return;
    const timer = window.setTimeout(() => setJustChanged([]), 8000);
    return () => window.clearTimeout(timer);
  }, [justChanged]);

  return {
    parcels,
    loading,
    justChanged,
    lastCheckedAt,
    live: !settled,
    refresh: () => void check(),
  };
}
