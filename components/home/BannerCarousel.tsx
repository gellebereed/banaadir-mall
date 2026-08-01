"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Banner } from "@/lib/types";

/**
 * Home-page banner carousel, built from the banners the admin adds in
 * /admin/marketing. Auto-advances, pauses on hover, and exposes dots plus
 * arrows for manual control.
 */
export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || banners.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(id);
  }, [paused, banners.length]);

  if (banners.length === 0) return null;
  const active = banners[Math.min(index, banners.length - 1)];

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6">
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="group relative overflow-hidden rounded-3xl"
      >
        <Link href={active.link} className="block">
          <div
            className="relative flex min-h-56 items-center sm:min-h-72"
            style={{ background: `linear-gradient(120deg, ${active.from}, ${active.to})` }}
          >
            {active.image && (
              <Image
                src={active.image}
                alt=""
                fill
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
                className="object-cover"
              />
            )}
            {/* Scrim keeps the copy readable over any artwork */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent" />

            <div className="relative max-w-lg px-6 py-10 text-white sm:px-12">
              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                {active.title}
              </h2>
              {active.subtitle && (
                <p className="mt-2 text-sm text-white/85 sm:text-base">{active.subtitle}</p>
              )}
              {active.cta && (
                <span className="mt-5 inline-block rounded-full bg-mango-500 px-6 py-2.5 text-sm font-bold shadow-lg">
                  {active.cta}
                </span>
              )}
            </div>
          </div>
        </Link>

        {banners.length > 1 && (
          <>
            <CarouselArrow
              side="left"
              onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
            />
            <CarouselArrow
              side="right"
              onClick={() => setIndex((i) => (i + 1) % banners.length)}
            />
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Show banner ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function CarouselArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous banner" : "Next banner"}
      className={`absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg text-ocean-950 opacity-0 shadow-lg transition hover:bg-white group-hover:opacity-100 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
