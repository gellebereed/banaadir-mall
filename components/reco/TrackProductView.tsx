"use client";

import { useEffect, useRef } from "react";
import { useReco } from "./RecoProvider";

/**
 * Records that a product page was opened, and how long it held attention.
 *
 * Dwell is the cheapest honest signal a shop has. A click says "the photo
 * worked"; ninety seconds on the page says "I was reading the fabric
 * composition and working out whether it fits". Treating those as the same
 * interaction is why so many recommenders chase whatever a shopper
 * accidentally tapped.
 *
 * Time spent on a hidden tab does not count — a page left open in the
 * background for an hour would otherwise outweigh a real purchase (the
 * decay model in lib/reco/taste.ts caps dwell for the same reason, but
 * measuring it correctly here is better than clamping it later).
 */
export default function TrackProductView({ productId }: { productId: string }) {
  const { track, ready } = useReco();

  const visibleSince = useRef<number>(0);
  const accumulated = useRef(0);

  useEffect(() => {
    if (!ready) return;

    track("view", { id: productId });

    visibleSince.current = document.visibilityState === "visible" ? Date.now() : 0;
    accumulated.current = 0;

    const pause = () => {
      if (visibleSince.current > 0) {
        accumulated.current += (Date.now() - visibleSince.current) / 1000;
        visibleSince.current = 0;
      }
    };

    const resume = () => {
      if (visibleSince.current === 0) visibleSince.current = Date.now();
    };

    const onVisibility = () => (document.visibilityState === "visible" ? resume() : pause());

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      pause();
      const seconds = Math.round(accumulated.current);
      if (seconds >= 5) track("dwell", { id: productId, seconds });
    };
  }, [productId, ready, track]);

  return null;
}
