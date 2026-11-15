"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LookCard from "@/components/looks/LookCard";
import type { LookCardData } from "@/lib/look-utils";

/**
 * The looks, side by side: swiped on a phone with the next look peeking
 * in from the edge, arrows from a tablet up, and a slim progress line
 * underneath so the shopper knows there is more to see.
 */
export default function LooksCarousel({ looks }: { looks: LookCardData[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false, progress: 0, fits: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft >= max - 4,
      progress: max > 0 ? el.scrollLeft / max : 1,
      fits: max <= 4,
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = (dir: -1 | 1) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>("[data-look]");
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: "smooth" });
  };

  const width = Math.max(1 / looks.length, 0.18);

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={measure}
        className="rail-scroll -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1"
      >
        {looks.map((look, i) => (
          <div
            key={look.id}
            data-look
            className="w-[80%] max-w-[22rem] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)] xl:w-[calc(25%-0.75rem)]"
          >
            <LookCard look={look} priority={i === 0} />
          </div>
        ))}
      </div>

      {!edge.fits && (
        <>
          <div className="mx-auto mt-5 h-[3px] w-24 overflow-hidden rounded-full bg-sand-200">
            <div
              className="h-full rounded-full bg-ocean-950 transition-[margin] duration-150"
              style={{ width: `${width * 100}%`, marginLeft: `${edge.progress * (1 - width) * 100}%` }}
            />
          </div>
          {(["prev", "next"] as const).map((side) => {
            const hidden = side === "prev" ? edge.start : edge.end;
            return (
              <button
                key={side}
                type="button"
                aria-label={side === "prev" ? "Previous look" : "Next look"}
                onClick={() => go(side === "prev" ? -1 : 1)}
                className={`absolute top-[38%] z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ocean-950 shadow-lg ring-1 ring-black/5 transition hover:scale-105 sm:flex ${
                  side === "prev" ? "-left-3" : "-right-3"
                } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                  <path
                    d={side === "prev" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
