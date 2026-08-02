"use client";

import { useRef } from "react";
import Link from "next/link";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/lib/types";

export default function FlashDealsRail({
  deals,
  name,
  endsAt,
}: {
  deals: Product[];
  name: string;
  endsAt: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: "left" | "right") {
    if (!scrollRef.current) return;
    const distance = 320;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <div className="rounded-3xl bg-gradient-to-r from-coral-500/15 via-mango-100 to-sand-100 p-4 sm:p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-ocean-950 sm:text-3xl">
              ⚡ {name}
            </h2>
            <CountdownTimer endsAt={endsAt || undefined} />
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/flash"
              className="text-sm font-semibold text-coral-600 hover:text-coral-700 transition mr-2"
            >
              See all deals →
            </Link>

            {/* Desktop Navigation Scroll Buttons */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scroll("left")}
                aria-label="Scroll left"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-sand-300 bg-white text-slate-700 shadow-xs transition hover:bg-ocean-50 hover:text-ocean-900 active:scale-95"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => scroll("right")}
                aria-label="Scroll right"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-sand-300 bg-white text-slate-700 shadow-xs transition hover:bg-ocean-50 hover:text-ocean-900 active:scale-95"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Container with Custom Styled Scrollbar */}
        <div
          ref={scrollRef}
          className="flex snap-x items-stretch gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth scrollbar-thin scrollbar-thumb-ocean-300 scrollbar-track-transparent"
        >
          {deals.map((p) => (
            <div key={p.id} className="flex h-full w-44 shrink-0 flex-col snap-start sm:w-56">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
