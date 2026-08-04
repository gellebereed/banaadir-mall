"use client";

/**
 * A page's worth of shelves, fetched once and rendered in order.
 *
 * Rendered client-side on purpose. The shelves depend on the shopper's own
 * device history, so server-rendering them would either mean holding a
 * profile per user on the server or making every page uncacheable for
 * everyone. This way the page itself stays exactly as cacheable as it was,
 * and the personal layer arrives a moment later.
 *
 * Nothing is reserved for a shelf that might not exist: a first-time
 * visitor's page has no "Pick up where you left off" row and no gap where
 * one would have been.
 */

import type { ShelfSlot } from "@/lib/types";
import { useRecommendations } from "./RecoProvider";
import RecoShelf from "./RecoShelf";

export default function RecoStack({
  surface,
  seedId,
  useCartLines,
  items,
  excludeIds,
  slot,
  only,
  exclude,
  max,
  enabled = true,
}: {
  surface: Parameters<typeof useRecommendations>[0]["surface"];
  seedId?: string;
  /** Send the live basket — needed for basket-completion shelves. */
  useCartLines?: boolean;
  /** An explicit basket, overriding the live cart. See UseRecoInput.items. */
  items?: Parameters<typeof useRecommendations>[0]["items"];
  /** Products the page already shows, so the shelves don't repeat them. */
  excludeIds?: string[];
  /**
   * Render only the shelves the engine assigned to this position.
   *
   * Several RecoStacks with the same surface share ONE server call (the
   * fetch layer de-duplicates by key), so scattering them down the page
   * costs nothing — the filtering is local. That is what lets the
   * personalised rows be interleaved with the marketplace's own sections
   * instead of arriving as one undifferentiated block.
   */
  slot?: ShelfSlot;
  /** Render only these shelf ids, in the engine's order. */
  only?: string[];
  /** Render everything except these — the counterpart to `only`. */
  exclude?: string[];
  max?: number;
  enabled?: boolean;
}) {
  const { data, loading } = useRecommendations({
    surface,
    seedId,
    useCartLines,
    items,
    excludeIds,
    enabled,
  });

  let shelves = data.shelves;
  if (slot) shelves = shelves.filter((shelf) => shelf.slot === slot);
  if (only) shelves = shelves.filter((shelf) => only.includes(shelf.id));
  if (exclude) shelves = shelves.filter((shelf) => !exclude.includes(shelf.id));
  if (max !== undefined) shelves = shelves.slice(0, max);

  if (shelves.length === 0) {
    // A single placeholder while the first answer is in flight. Repeating
    // it per unknown shelf would reserve space for rows that may never
    // exist and make the page jump when they don't.
    return loading && enabled ? <ShelfSkeleton /> : null;
  }

  return (
    <>
      {shelves.map((shelf) => (
        <RecoShelf key={shelf.id} shelf={shelf} />
      ))}
    </>
  );
}

function ShelfSkeleton() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12" aria-hidden>
      <div className="mb-5 h-7 w-56 animate-pulse rounded-lg bg-sand-100" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-44 shrink-0 sm:w-52">
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-sand-100" />
            <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-sand-100" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-sand-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
