"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE STORY PLAYER — an episode about one product.
 * ─────────────────────────────────────────────────────────────────────────
 * A photo and a spec table tell a shopper what a thing IS. They do not tell
 * them what it is like to own — how a stand mixer is cleaned, why a wool
 * suit hangs the way it does, what a duvet set actually looks like on a bed
 * in someone's house. That gap is where most online purchases stall, and
 * across a marketplace whose shoppers cannot walk into the shop and handle
 * the goods, it is the single biggest thing missing from a listing.
 *
 * ── How it is built ──────────────────────────────────────────────────────
 * Chapters, not an essay. Each has a heading, a short body and optionally
 * an image, and the reader can jump between them — because nobody reads a
 * wall of text about a kettle, but almost everybody will read the one
 * chapter that answers their actual question.
 *
 * The video is lazy. An embed iframe is ~700 KB of third-party JavaScript
 * that would load on every product page whether or not anyone pressed play;
 * on the connections this marketplace serves that is the difference between
 * a page that opens and a page that doesn't. The poster is an image until
 * the shopper chooses otherwise.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Image from "next/image";
import type { ProductStory, StoryKind } from "@/lib/types";

const KIND_META: Record<StoryKind, { label: string; glyph: string; accent: string }> = {
  "how-to": { label: "How to use it", glyph: "▶", accent: "from-ocean-700 to-ocean-900" },
  benefits: { label: "Why it's worth it", glyph: "✦", accent: "from-mango-500 to-mango-700" },
  care: { label: "Looking after it", glyph: "✿", accent: "from-emerald-600 to-emerald-800" },
  stories: { label: "People using it", glyph: "❝", accent: "from-coral-500 to-coral-700" },
  compare: { label: "How it compares", glyph: "⇄", accent: "from-slate-600 to-slate-800" },
};

export default function StoryPlayer({
  story,
  compact = false,
}: {
  story: ProductStory;
  /** Compact drops the hero, for embedding under a product. */
  compact?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  const meta = KIND_META[story.kind] ?? KIND_META["how-to"];
  const chapter = story.chapters[active];
  const embed = toEmbedUrl(story.videoUrl);

  return (
    <article className="overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-sm">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header
        className={`texture-weave relative bg-gradient-to-br px-5 py-5 sm:px-7 sm:py-6 ${meta.accent}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white ring-1 ring-inset ring-white/25">
            <span aria-hidden>{meta.glyph}</span>
            {meta.label}
          </span>
          {story.duration && (
            <span className="rounded-full bg-black/20 px-2.5 py-1 text-[10px] font-bold text-white/90">
              {story.duration}
            </span>
          )}
        </div>
        <h2 className="mt-2.5 font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">
          {story.title}
        </h2>
        {story.subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/75">
            {story.subtitle}
          </p>
        )}
      </header>

      {/* ── Video / hero ─────────────────────────────────────────── */}
      {embed ? (
        <div className="relative aspect-video w-full bg-ocean-950">
          {playing ? (
            <iframe
              src={`${embed}${embed.includes("?") ? "&" : "?"}autoplay=1`}
              title={story.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <button
              onClick={() => setPlaying(true)}
              className="group absolute inset-0 flex items-center justify-center"
              aria-label={`Play: ${story.title}`}
            >
              {(story.poster || story.heroImage) && (
                <Image
                  src={(story.poster || story.heroImage)!}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 900px"
                  className="object-cover opacity-80 transition group-hover:opacity-95"
                />
              )}
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-2xl text-ocean-900 shadow-2xl transition group-hover:scale-110">
                ▶
              </span>
            </button>
          )}
        </div>
      ) : (
        !compact &&
        story.heroImage && (
          <div className="relative aspect-[21/9] w-full bg-sand-100">
            <Image
              src={story.heroImage}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 900px"
              className="object-cover"
            />
          </div>
        )
      )}

      {/* ── Chapters ─────────────────────────────────────────────── */}
      {story.chapters.length > 0 && (
        <div className="p-5 sm:p-7">
          {story.chapters.length > 1 && (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 rail-scroll">
              {story.chapters.map((entry, index) => (
                <button
                  key={`${entry.heading}-${index}`}
                  onClick={() => setActive(index)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                    index === active
                      ? "border-ocean-700 bg-ocean-700 text-white shadow-sm"
                      : "border-sand-200 bg-white text-slate-600 hover:border-ocean-300"
                  }`}
                >
                  <span className="mr-1.5 opacity-50">{index + 1}</span>
                  {entry.heading}
                </button>
              ))}
            </div>
          )}

          {chapter && (
            <div className="grid gap-5 sm:grid-cols-[1fr] lg:grid-cols-[1.2fr_1fr]">
              <div>
                <h3 className="font-display text-lg font-extrabold text-ocean-950">
                  {chapter.heading}
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {chapter.body}
                </p>

                {story.chapters.length > 1 && (
                  <div className="mt-5 flex items-center gap-2">
                    <button
                      onClick={() => setActive((i) => Math.max(0, i - 1))}
                      disabled={active === 0}
                      className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-ocean-300 disabled:opacity-30"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() =>
                        setActive((i) => Math.min(story.chapters.length - 1, i + 1))
                      }
                      disabled={active === story.chapters.length - 1}
                      className="rounded-full bg-ocean-700 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-ocean-800 disabled:opacity-30"
                    >
                      Next step →
                    </button>
                    <span className="ml-auto text-[11px] font-semibold text-slate-400">
                      {active + 1} / {story.chapters.length}
                    </span>
                  </div>
                )}
              </div>

              {chapter.image && (
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100">
                  <Image
                    src={chapter.image}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── In use ───────────────────────────────────────────────── */}
      {story.gallery && story.gallery.length > 0 && (
        <div className="border-t border-sand-200 bg-sand-50 p-5 sm:p-7">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
            In real homes
          </p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 rail-scroll">
            {story.gallery.map((src, index) => (
              <div
                key={`${src}-${index}`}
                className="relative h-32 w-40 shrink-0 overflow-hidden rounded-2xl bg-white sm:h-40 sm:w-52"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="220px"
                  className="object-cover transition hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Turn a watch URL into an embeddable one.
 *
 * Sellers paste whatever the share button gave them — a youtu.be link, a
 * full watch URL, sometimes already an embed. Handling all three here means
 * the admin form does not have to teach anybody the difference, which is
 * the kind of small friction that stops content from being created at all.
 * Anything unrecognised is returned as-is and rendered in an iframe, which
 * covers self-hosted mp4 and Vimeo without special-casing them.
 */
function toEmbedUrl(url?: string): string | undefined {
  if (!url?.trim()) return undefined;
  const raw = url.trim();

  const youtube =
    raw.match(/youtu\.be\/([\w-]{6,})/) ??
    raw.match(/youtube\.com\/watch\?v=([\w-]{6,})/) ??
    raw.match(/youtube\.com\/embed\/([\w-]{6,})/) ??
    raw.match(/youtube\.com\/shorts\/([\w-]{6,})/);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

  const vimeo = raw.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return raw;
}
