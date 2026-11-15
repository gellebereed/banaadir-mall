"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { lookPath, type LookCardData } from "@/lib/look-utils";

/**
 * One look in a feed (the home row and /looks). The photo is the whole
 * card: every piece has a breathing "+" on it, and tapping one opens that
 * piece right here — name, shop, price, a link to it — without leaving
 * the feed. The outfit's total is deliberately not on the card; it waits
 * on the look page, where sizes are picked. Under the photo: the name and
 * one button to the full outfit. Nothing is laid over the photo's bottom,
 * so the dots on trousers and shoes stay visible.
 */
export default function LookCard({ look, priority = false }: { look: LookCardData; priority?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const spot = open === null ? undefined : look.spots[open];

  // A tap anywhere else (another card, the page) closes the popup.
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // The popup sits on the far side of its dot, so the dot stays in view.
  const below = spot ? spot.y < 50 : false;

  return (
    <article ref={root} className="group">
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-sand-100 shadow-sm ring-1 ring-black/5"
        onClick={() => setOpen(null)}
      >
        <Image
          src={look.image}
          alt={look.title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 80vw, (max-width: 1024px) 45vw, 25vw"
          className="object-cover transition duration-700 group-hover:scale-[1.02]"
        />
        {/* A whisper of shade so white dots read on a light photo. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />

        {look.soldOut > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {t("look.soldOut", { n: look.soldOut })}
          </span>
        )}

        {look.spots.map((s, i) => {
          const active = open === i;
          return (
            <button
              key={s.productId}
              type="button"
              aria-label={s.name}
              aria-expanded={active}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(active ? null : i);
              }}
              className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              {!active && (
                <span
                  aria-hidden
                  className="animate-hotspot absolute h-7 w-7 rounded-full bg-white/70"
                  style={{ animationDelay: `${i * 0.45}s` }}
                />
              )}
              <span
                aria-hidden
                className={`relative flex h-7 w-7 items-center justify-center rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-[5px] transition duration-200 ${
                  active ? "scale-110 bg-white text-ocean-950 ring-white/50" : "bg-ocean-950/90 text-white ring-white/45"
                } ${s.available ? "" : "opacity-60"}`}
              >
                <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-45" : ""}`}>
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          );
        })}

        {spot && (
          <Link
            key={spot.productId}
            href={`/product/${spot.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="animate-spot-in absolute inset-x-3 z-20 flex items-center gap-3 rounded-2xl bg-white/95 p-2 pr-3 shadow-xl ring-1 ring-black/5 backdrop-blur"
            style={below ? { top: `calc(${spot.y}% + 26px)` } : { bottom: `calc(${100 - spot.y}% + 26px)` }}
          >
            {spot.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={spot.image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-sand-100 object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">{spot.icon}</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-snug text-ocean-950">{spot.name}</span>
              <span className="block truncate text-[11px] text-slate-500">{spot.store}</span>
              <span className={`block text-sm font-bold ${spot.available ? "text-ocean-950" : "text-coral-600"}`}>
                {spot.available ? money(spot.price) : t("look.unavailable")}
              </span>
            </span>
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden>
              <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </div>

      <div className="px-1 pt-3">
        <h3 className="truncate font-display text-base font-extrabold text-ocean-950">{look.title}</h3>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {t("look.by", { stores: look.stores.join(" · ") })} · {t("look.pieces", { n: look.pieces })}
        </p>
        <Link
          href={lookPath(look)}
          className="mt-3 flex items-center justify-center gap-2 rounded-full bg-ocean-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ocean-900 active:scale-[0.98]"
        >
          {t("look.viewOutfit")}
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
            <path d="M4 10h11m-4-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </article>
  );
}
