"use client";

import { useEffect } from "react";
import { useReco } from "./RecoProvider";

/**
 * Records a search that actually returned something.
 *
 * A query is the only signal where the shopper says what they want in their
 * own words, which is why its terms are weighted highest in the taste
 * vector (lib/reco/taste.ts). But a search with no results says nothing
 * about taste — it says the catalogue is missing something — and learning
 * "espresso" from a query that found no espresso machines would send the
 * recommender hunting for a product that isn't there.
 */
export default function TrackSearch({
  query,
  resultCount,
}: {
  query: string;
  resultCount: number;
}) {
  const { track, ready } = useReco();

  useEffect(() => {
    if (!ready) return;
    const clean = query.trim();
    if (clean.length < 2 || resultCount === 0) return;
    track("search", { query: clean });
  }, [query, resultCount, ready, track]);

  return null;
}
