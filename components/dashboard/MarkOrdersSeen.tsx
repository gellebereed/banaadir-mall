"use client";

import { useEffect, useRef } from "react";
import { markOrdersSeen } from "@/app/actions";

/**
 * Clears the unread badge for the parcels listed on this page.
 *
 * Renders nothing. It runs AFTER paint, so the "New" tags on the rows are
 * still visible on the visit that clears them — a badge that empties before
 * the seller can see which order was new teaches them to distrust it.
 *
 * The ref guard matters: React runs effects twice in development Strict
 * Mode, and without it every page view fires two writes.
 */
export default function MarkOrdersSeen({ orderIds }: { orderIds: string[] }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || orderIds.length === 0) return;
    done.current = true;
    // Deliberately not awaited: this is bookkeeping, and it must never
    // delay or block the page the seller came here to use.
    void markOrdersSeen(orderIds);
  }, [orderIds]);

  return null;
}
