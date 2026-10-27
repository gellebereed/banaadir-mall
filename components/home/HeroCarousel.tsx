"use client";

import { usePrefs } from "@/components/prefs/PrefsProvider";
import { LITE_QUALITY } from "@/lib/lite";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { sceneBackground } from "@/lib/scenes";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE HERO — one full-bleed slide carousel.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why this replaced two components ─────────────────────────────────────
 * The storefront used to open with a dark gradient hero (headline, buttons,
 * floating product cards) and then, immediately below it, a SECOND hero: a
 * rounded banner carousel inset in the page. Two full-width statements
 * stacked on top of each other, each asking to be the first thing you read.
 * On a phone that is most of the first two screens gone before a shopper
 * has seen a single product, and neither block wins — they just make the
 * page feel like a template with a slot for everything.
 *
 * Every shopping app worth copying opens with ONE thing: a photograph,
 * edge to edge, a headline over it, one button, and dots telling you there
 * is more. So the marketplace's own pitch became the FIRST SLIDE, the
 * admin's banners became the rest, and they share one frame, one set of
 * dots and one autoplay timer.
 *
 * ── Full-bleed, deliberately ─────────────────────────────────────────────
 * No max-width, no rounded corners, no page padding. The hero touches all
 * three edges of the screen. An inset hero with a margin around it always
 * reads as a website; a hero that runs off the edges reads as an app, and
 * the difference costs nothing but a container.
 *
 * ── Cross-fade, not a filmstrip ──────────────────────────────────────────
 * Slides are stacked and cross-faded rather than translated in a row. A
 * translating filmstrip needs every image laid out at once and pulls the
 * whole page sideways the moment one is a pixel too wide — the exact class
 * of bug globals.css already has a defensive rule for. Stacked slides
 * cannot do that, and the fade is what the good apps use anyway.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface HeroSlide {
  id: string;
  href: string;
  /** Small pill above the headline. */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  /** Secondary text link beside the CTA. Brand slide only, in practice. */
  secondaryCta?: { label: string; href: string };
  image?: string;
  /** Portrait artwork for phones — a wide banner loses its sides otherwise. */
  mobileImage?: string;
  from: string;
  to: string;
  /** "contain" shows the whole artwork; "cover" fills the frame. */
  fit?: "cover" | "contain";
  /**
   * The marketplace's own slide. Gets the gradient treatment and the
   * decoration, and never renders a scrim it does not need.
   */
  brand?: boolean;
  /**
   * A live-data slide's picture side — real products, brand logos — built
   * on the server. Unlike the brand decoration it shows on phones too, as a
   * compact row above the copy.
   */
  visual?: ReactNode;
  /** Under the subtitle: the flash-deal countdown, in practice. */
  below?: ReactNode;
}

const AUTOPLAY_MS = 6000;

export default function HeroCarousel({
  slides,
  /** Rendered on the brand slide at lg and up — the floating product cards. */
  brandDecoration,
}: {
  slides: HeroSlide[];
  brandDecoration?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = slides.length;
  const { lite } = usePrefs();

  /*
   * Which slides' artwork has been asked for. Stacked slides used to all
   * load their photos up front — four banners meant four full-width images
   * competing with the first screen for a phone's bandwidth, three of them
   * invisible. Now: the slide on screen, plus (after the page has loaded)
   * the NEXT one so autoplay never fades to a blank frame, plus any slide
   * already shown. Light data mode skips the look-ahead.
   */
  const [wanted, setWanted] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => {
    setWanted((prev) => {
      const ahead = lite || count < 2 ? [] : [(index + 1) % count];
      if ([index, ...ahead].every((i) => prev.has(i))) return prev;
      return new Set([...prev, index, ...ahead]);
    });
  }, [index, count, lite]);

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  /*
   * Autoplay stops when the tab is hidden.
   *
   * Without it a phone left on the home screen burns through the whole
   * rotation in a background tab and the shopper returns to slide 4 with no
   * idea the first three existed.
   */
  // Light data mode: no autoplay — each slide's photo is only fetched
  // when the shopper actually swipes to it.
  useEffect(() => {
    if (paused || count < 2 || lite) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, count, lite]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
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
      className="group relative isolate w-full overflow-hidden bg-ocean-950"
    >
      {/*
        The frame's height is set by min-height rather than an aspect ratio.
        Aspect ratios look tidy until a long headline in a narrow column
        overflows the box — a height floor lets the copy push the frame down
        on the one phone where it needs to, and never crops it.

        On phones the floor is 80vw — exactly the 5:4 mobile banner artwork
        (1000 × 800, see README) — rather than a whole screen: a hero that
        filled the first screen left a phone visitor with no product, price
        or category to look at until they scrolled.
      */}
      <div className="relative min-h-[84vw] sm:min-h-[480px] lg:min-h-[560px]">
        {slides.map((slide, i) => (
          <HeroSlideView
            key={slide.id}
            slide={slide}
            active={i === index}
            priority={i === 0}
            loadArt={wanted.has(i)}
            decoration={slide.brand ? brandDecoration : undefined}
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <HeroArrow side="left" onClick={() => go(index - 1)} />
          <HeroArrow side="right" onClick={() => go(index + 1)} />

          {/* Dots. The active one stretches into a pill rather than merely
              brightening — position in a set is far easier to read as a
              change of SHAPE than as a change of opacity. */}
          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-2 sm:bottom-5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => go(i)}
                aria-label={`Show slide ${i + 1} of ${count}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-7 bg-mango-400 shadow-sm shadow-black/30"
                    : "w-2 bg-white/55 hover:bg-white/85"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ── One slide ──────────────────────────────────────────────────────── */

function HeroSlideView({
  slide,
  active,
  priority,
  loadArt,
  decoration,
}: {
  slide: HeroSlide;
  active: boolean;
  priority: boolean;
  loadArt: boolean;
  decoration?: ReactNode;
}) {
  const hasText = Boolean(slide.title || slide.subtitle || slide.cta);
  const contain = slide.fit === "contain";
  const hasArt = Boolean(slide.image || slide.mobileImage);
  const { lite } = usePrefs();
  // Artwork that is shown whole ("contain") is almost always a designed
  // banner with lettering on it, and 75 is where small type starts to
  // fringe. Photos that fill the frame hide it; they stay at the default.
  const quality = lite ? LITE_QUALITY : contain ? 90 : undefined;

  return (
    <div
      aria-hidden={!active}
      className={`absolute inset-0 transition-opacity duration-700 ease-out ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ background: sceneBackground(slide.from, slide.to) }}
    >
      <div className="scene-grain pointer-events-none absolute inset-0" />
      {/* Artwork. Portrait on phones when the admin supplied one. */}
      {hasArt && loadArt && <SlideArt slide={slide} quality={quality} priority={priority} />}

      {/* Brand-slide atmosphere — the soft colour blooms behind the copy. */}
      {slide.brand && (
        <>
          <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-mango-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-ocean-400/25 blur-3xl" />
        </>
      )}

      {/*
        The scrim only exists to keep TEXT legible, so it only appears when
        there is text over artwork. A banner whose artwork already carries
        its own headline — which is how most retail creative arrives — is
        shown exactly as the designer drew it.

        Vertical as well as horizontal: on a phone the copy sits at the
        bottom of the frame, and a purely left-to-right scrim leaves white
        type sitting on whatever the photograph happens to be doing there.
      */}
      {hasText && hasArt && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10 sm:bg-gradient-to-r sm:from-black/70 sm:via-black/30 sm:to-transparent" />
      )}

      <div className="relative mx-auto grid h-full max-w-7xl content-end items-end gap-3.5 px-5 pb-9 pt-5 sm:content-center sm:items-center sm:gap-8 sm:px-8 sm:pb-14 lg:grid-cols-2 lg:px-4">
        <div className={active ? "animate-fade-up" : ""}>
          {slide.eyebrow && (
            <span className="hidden items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 sm:inline-flex text-xs font-semibold text-mango-200 ring-1 ring-white/25 backdrop-blur-sm">
              {slide.eyebrow}
            </span>
          )}

          {slide.title && (
            <h2 className="max-w-xl font-display text-[1.75rem] font-extrabold leading-[1.1] text-white sm:mt-4 sm:text-5xl lg:text-6xl">
              {slide.title}
            </h2>
          )}

          {slide.subtitle && (
            // A slide with a picture side or a countdown drops its subtitle
            // on a phone — the frame there has room for one or the other.
            <p
              className={`mt-2 line-clamp-2 max-w-md text-sm text-white/85 sm:mt-3 sm:line-clamp-none sm:text-lg ${
                slide.below || slide.visual ? "hidden sm:block" : ""
              }`}
            >
              {slide.subtitle}
            </p>
          )}

          {slide.below && <div className="mt-3 sm:mt-4">{slide.below}</div>}

          {(slide.cta || slide.secondaryCta) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-6">
              {slide.cta && (
                <Link href={slide.href} className={`btn-primary !px-7 ${slide.visual ? "max-sm:!py-2.5 max-sm:text-sm" : ""}`}>
                  {slide.cta}
                </Link>
              )}
              {slide.secondaryCta && (
                <Link
                  href={slide.secondaryCta.href}
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/35 px-6 py-3 font-semibold text-white backdrop-blur-sm transition hover:bg-white hover:text-ocean-900"
                >
                  {slide.secondaryCta.label}
                </Link>
              )}
            </div>
          )}
        </div>

        {slide.visual && (
          <div className="order-first lg:order-none">{slide.visual}</div>
        )}

        {decoration && (
          <div className="relative mx-auto hidden h-[440px] w-full max-w-lg lg:block">
            {decoration}
          </div>
        )}
      </div>

      {/*
        A slide with no copy at all is still a link, so the whole frame
        becomes the target. With copy, the button is the target — a full-
        frame link would swallow taps meant for the dots and the arrows.
      */}
      {!hasText && (
        <Link href={slide.href} className="absolute inset-0 z-10" aria-label="View offer" />
      )}
    </div>
  );
}

/**
 * One slide's artwork, and only ONE download for it.
 *
 * Two <Image>s toggled with `sm:hidden` / `hidden sm:block` look like art
 * direction but are not: CSS hides an image, it does not stop the browser
 * fetching it, so every phone paid for the wide banner as well (and every
 * computer for the portrait one). A <picture> lets the browser choose
 * before it fetches. getImageProps keeps next/image's resizing and AVIF/WebP
 * negotiation for both sources.
 */
function SlideArt({
  slide,
  quality,
  priority,
}: {
  slide: HeroSlide;
  quality?: number;
  priority: boolean;
}) {
  const fit = slide.fit === "contain" ? "object-contain" : "object-cover";
  // The banner's own headline, so search engines see what the artwork says.
  const alt = slide.title ?? slide.eyebrow ?? "";
  const common = { alt, fill: true, sizes: "100vw", quality, priority } as const;

  if (slide.image && slide.mobileImage) {
    const {
      props: { srcSet: mobileSrcSet },
    } = getImageProps({ ...common, src: slide.mobileImage });
    const { props } = getImageProps({ ...common, src: slide.image });
    return (
      <picture>
        <source media="(max-width: 639px)" srcSet={mobileSrcSet} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...props} alt={alt} className={fit} />
      </picture>
    );
  }

  const src = slide.image ?? slide.mobileImage!;
  return <Image {...common} src={src} className={fit} />;
}

function HeroArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={`absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl text-ocean-950 shadow-lg backdrop-blur transition hover:bg-white sm:flex
        opacity-0 group-hover:opacity-100 focus-visible:opacity-100
        ${side === "left" ? "left-4" : "right-4"}`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
