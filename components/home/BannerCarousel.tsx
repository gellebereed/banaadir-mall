"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Banner } from "@/lib/types";

/**
 * Home-page banner carousel, built from the banners the admin adds in
 * /admin/marketing.
 *
 * A banner does NOT need text. Artwork usually already contains the
 * headline (that's how Trendyol, Karaca and most retailers ship them), so
 * when title/subtitle/CTA are all empty we render the image alone — no
 * darkening scrim, nothing overlapping the design — and the whole banner
 * stays a link. The scrim only appears when there is text to keep legible.
 */
export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = banners.length;
  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;
  const active = banners[Math.min(index, count - 1)];
  const hasText = Boolean(active.title || active.subtitle || active.cta);
  // "contain" shows the whole artwork (nothing cropped); "cover" fills the
  // frame. Sellers upload all sorts of ratios, so this is per banner.
  const contain = active.fit === "contain";

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6">
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          setPaused(true);
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          setPaused(false);
          if (start === null) return;
          const delta = e.changedTouches[0].clientX - start;
          if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
        }}
        className="group relative overflow-hidden rounded-3xl bg-sand-100 shadow-sm"
      >
        <Link href={active.link} className="block" aria-label={active.title || "View offer"}>
          <div
            className={`relative w-full ${
              contain ? "aspect-[16/7]" : "aspect-[5/4] sm:aspect-[16/6]"
            }`}
            style={
              active.image && contain
                ? undefined
                : { background: `linear-gradient(120deg, ${active.from}, ${active.to})` }
            }
          >
            {/* Portrait artwork on phones, wide artwork from `sm` up. Falls
                back to the wide image when no mobile version was supplied. */}
            {active.mobileImage && (
              <Image
                src={active.mobileImage}
                alt={active.title || ""}
                fill
                sizes="100vw"
                priority
                className={`sm:hidden ${contain ? "object-contain" : "object-cover"}`}
              />
            )}
            {active.image && (
              <Image
                src={active.image}
                alt={active.title || ""}
                fill
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
                className={`${active.mobileImage ? "hidden sm:block" : ""} ${
                  contain ? "object-contain" : "object-cover"
                }`}
              />
            )}

            {/* Only darken the artwork when copy has to sit on top of it. */}
            {hasText && (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
                <div className="absolute inset-y-0 left-0 flex max-w-lg flex-col justify-center px-6 text-white sm:px-12">
                  {active.title && (
                    <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-4xl">
                      {active.title}
                    </h2>
                  )}
                  {active.subtitle && (
                    <p className="mt-2 text-sm text-white/85 sm:text-base">{active.subtitle}</p>
                  )}
                  {active.cta && (
                    <span className="mt-5 inline-block w-fit rounded-full bg-mango-500 px-6 py-2.5 text-sm font-bold shadow-lg">
                      {active.cta}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </Link>

        {count > 1 && (
          <>
            <CarouselArrow side="left" onClick={() => go(index - 1)} />
            <CarouselArrow side="right" onClick={() => go(index + 1)} />

            {/* Dots sit in their own bar so they never cover the artwork. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
              <div className="pointer-events-auto flex gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur-sm">
                {banners.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => go(i)}
                    aria-label={`Show banner ${i + 1} of ${count}`}
                    aria-current={i === index}
                    className={`h-2 rounded-full transition-all ${
                      i === index ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white/90"
                    }`}
                  />
                ))}
              </div>
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
      className={`absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-ocean-950 shadow-lg transition hover:bg-white
        opacity-0 group-hover:opacity-100 focus-visible:opacity-100
        max-sm:opacity-100 ${side === "left" ? "left-3" : "right-3"}`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
