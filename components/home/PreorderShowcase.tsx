"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductImage from "@/components/ProductImage";
import { usePrefs } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { arrivalDate, arrivalTime, daysUntilArrival, preorderProgress } from "@/lib/preorder";
import { displayPrice, hasPriceRange, totalStock } from "@/lib/product-utils";
import type { Product } from "@/lib/types";

/**
 * THE HOME PAGE'S PRE-ORDER SHOWCASE.
 *
 * It used to be a plain product row under a "📦 Coming Soon" heading — the
 * same white cards as Trending, with a small "Pre-order" chip. The owner's
 * verdict was fair: nothing in it said "this is a chance, and it closes".
 * A shopper scrolled past it as if it were one more row of shirts.
 *
 * So it is now a stage of its own, dark like the pre-order panel on the
 * product page (components/product/PreorderPanel.tsx) so the two read as
 * one programme, with the three things that make a pre-order worth acting
 * on today said out loud:
 *
 *   TIME     a live countdown to the shop's arrival date — and, when the
 *            shop set an early price, that is the moment the price goes
 *            back up, so the clock is labelled as such
 *   SCARCITY the pieces actually left to reserve (stock), and "N of M
 *            reserved" only when real orders exist
 *   GAIN     the early price beside the price it returns to
 *
 * Every number is a fact from lib/preorder.ts — the line that file draws.
 * Nothing is invented to create urgency: no fake "12 people viewing", no
 * timer that restarts. If a product has no early price, no saving is shown.
 */
export default function PreorderShowcase({
  products,
  total,
  storeNames,
}: {
  /** The products to show, soonest arrival first. */
  products: Product[];
  /** How many pre-orders are open across the marketplace (for the link). */
  total: number;
  /** Store slug → display name. */
  storeNames: Record<string, string>;
}) {
  const { t, lang } = usePrefs();
  if (products.length === 0) return null;

  // The clock counts to the soonest arrival among what is shown.
  const soonest = products[0].preorder?.arrivesAt ?? "";
  const anyEarly = products.some((p) => (p.preorder?.earlyPct ?? 0) > 0);
  const maxEarly = Math.max(0, ...products.map((p) => p.preorder?.earlyPct ?? 0));
  const piecesLeft = products.reduce((n, p) => n + totalStock(p), 0);
  const overdue = soonest ? daysUntilArrival(soonest) < 0 : true;

  return (
    <section aria-labelledby="preorder-showcase-title" className="mx-auto max-w-7xl px-4 pt-10 sm:pt-14">
      <div className="relative isolate overflow-hidden rounded-[28px] bg-ocean-950 text-white shadow-xl shadow-ocean-950/25">
        {/* Light: two soft glows and a faint dot grid — depth without a photo to load. */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-mango-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 -z-10 h-80 w-80 rounded-full bg-coral-500/25 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />

        <div className="p-4 sm:p-7">
          {/* ── Heading + clock ─────────────────────────────────────── */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-mango-400/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-mango-300 ring-1 ring-mango-300/30">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mango-300 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-mango-300" />
                </span>
                {t("pre.home.eyebrow")}
              </p>
              <h2
                id="preorder-showcase-title"
                className="mt-3 font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl"
              >
                {t("pre.section")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-base">{t("pre.home.sub")}</p>

              <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                {soonest && (
                  <li className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                    📦 {overdue ? t("pre.anyDay") : t("pre.arrives", { date: arrivalDate(soonest, lang) })}
                  </li>
                )}
                {piecesLeft > 0 && (
                  <li className="rounded-full bg-coral-500/20 px-3 py-1.5 text-coral-100 ring-1 ring-coral-400/40">
                    🔥 {t("pre.home.pieces", { n: piecesLeft })}
                  </li>
                )}
                {maxEarly > 0 && (
                  <li className="rounded-full bg-mango-400 px-3 py-1.5 text-ocean-950">
                    💰 {t("pre.home.upTo", { pct: maxEarly })}
                  </li>
                )}
              </ul>
            </div>

            {soonest && !overdue && (
              <ArrivalClock arrivesAt={soonest} label={anyEarly ? t("pre.home.earlyEndsIn") : t("pre.home.landsIn")} />
            )}
          </div>

          {/* ── The products ────────────────────────────────────────── */}
          {/* A swipeable row on a phone (up to eight); a grid of three or
              four from tablet up, where there is no swipe to find the rest
              — "See everything coming soon" below leads to them instead. */}
          <div className="rail-scroll -mx-4 mt-6 flex snap-x items-stretch gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4">
            {products.map((p, i) => (
              <div
                key={p.id}
                className={`flex w-[46%] shrink-0 snap-start md:w-auto ${i >= 4 ? "md:hidden" : i === 3 ? "md:hidden lg:flex" : ""}`}
              >
                <PreorderTile product={p} storeName={storeNames[p.store]} />
              </div>
            ))}
          </div>

          {/* ── How it works + the way to the rest ──────────────────── */}
          <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold text-white/80 sm:text-sm">
              {[t("pre.home.step1"), t("pre.home.step2"), t("pre.home.step3")].map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="hidden text-white/30 sm:inline">→</span>}
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mango-400 text-[11px] font-extrabold text-ocean-950">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Link
              href="/preorder"
              className="inline-flex items-center justify-center gap-1 self-start rounded-full bg-white px-4 py-2 text-sm font-bold text-ocean-950 transition hover:bg-mango-300 sm:self-auto"
            >
              {t("pre.page.all")}
              {total > products.length && <span className="text-slate-500">({total})</span>}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── The clock ────────────────────────────────────────────────────── */

/**
 * Days, hours, minutes, seconds to the end of the arrival day in Mogadishu
 * (arrivalTime in lib/preorder.ts — the same moment the product page counts
 * to). Dashes until mounted, so the server and the phone render the same
 * thing and there is no hydration mismatch.
 */
export function ArrivalClock({ arrivesAt, label }: { arrivesAt: string; label: string }) {
  const { t } = usePrefs();
  const target = arrivalTime(arrivesAt);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!Number.isFinite(target)) return null;

  const units: [string, string][] =
    left === null
      ? [["--", t("pre.home.d")], ["--", t("pre.home.h")], ["--", t("pre.home.m")], ["--", t("pre.home.s")]]
      : [
          [String(Math.floor(left / 86400)), t("pre.home.d")],
          [String(Math.floor((left % 86400) / 3600)).padStart(2, "0"), t("pre.home.h")],
          [String(Math.floor((left % 3600) / 60)).padStart(2, "0"), t("pre.home.m")],
          [String(left % 60).padStart(2, "0"), t("pre.home.s")],
        ];

  return (
    <div className="shrink-0" role="timer" aria-label={label}>
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/60">{label}</p>
      <div className="flex gap-1.5 sm:gap-2">
        {units.map(([value, unit], i) => (
          <div
            key={i}
            className={`flex min-w-[3.6rem] flex-1 flex-col items-center rounded-2xl px-2 py-2 ring-1 sm:min-w-[4.5rem] sm:py-2.5 ${
              i === 0 ? "bg-mango-400 text-ocean-950 ring-mango-300" : "bg-white/10 ring-white/15"
            }`}
          >
            <span className="font-display text-2xl font-extrabold leading-none tabular-nums sm:text-4xl">{value}</span>
            <span className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${i === 0 ? "text-ocean-950/70" : "text-white/60"}`}>
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── One product ──────────────────────────────────────────────────── */

/**
 * A pre-order card built for this stage rather than the general
 * ProductCard: the arrival, the pieces left and the early saving are the
 * card's whole message, so they are large, and the one action is "Pre-order
 * now" — products here nearly always have sizes, which are chosen on the
 * product page.
 */
export function PreorderTile({
  product,
  storeName,
  onLight = false,
}: {
  product: Product;
  storeName?: string;
  /** On the page's light background rather than the dark stage: a softer shadow. */
  onLight?: boolean;
}) {
  const { t, lang } = usePrefs();
  const preorder = product.preorder;
  const price = displayPrice(product);
  const showFrom = hasPriceRange(product);
  const was = product.compareAt && product.compareAt > price ? product.compareAt : undefined;
  const earlyPct = preorder?.earlyPct ?? 0;
  const left = totalStock(product);
  const progress = preorderProgress(product);
  const href = `/product/${product.slug}`;
  const overdue = preorder ? daysUntilArrival(preorder.arrivesAt) < 0 : false;

  return (
    <Link
      href={href}
      className={`group flex w-full flex-col overflow-hidden rounded-2xl bg-white text-ocean-950 ring-1 transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${
        onLight ? "shadow-md shadow-ocean-950/10 ring-sand-200" : "shadow-lg shadow-black/20 ring-white/10"
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <ProductImage
          product={product}
          className="h-full w-full transition duration-500 group-hover:scale-[1.04]"
          sizes="(max-width: 768px) 46vw, (max-width: 1024px) 33vw, 25vw"
        />
        {/* Darken the foot of the photo so the arrival line reads on any picture. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

        <span className="absolute left-2 top-2 rounded-full bg-ocean-950/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-mango-300 ring-1 ring-mango-300/40 backdrop-blur-sm sm:text-[11px]">
          {t("pre.eyebrow")}
        </span>
        {earlyPct > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-coral-500 px-2 py-1 text-[11px] font-extrabold text-white shadow-md sm:text-xs">
            −{earlyPct}%
          </span>
        )}
        {preorder && (
          <span className="absolute bottom-2 left-2 right-2 truncate text-[11px] font-bold text-white drop-shadow sm:text-xs">
            📦 {overdue ? t("pre.anyDay") : t("pre.arrives", { date: arrivalDate(preorder.arrivesAt, lang) })}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3.5">
        {storeName && (
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px]">{storeName}</p>
        )}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight sm:text-sm">{product.name}</h3>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
          {showFrom && <span className="text-[11px] text-slate-400">{t("product.from")}</span>}
          <span className="font-display text-lg font-extrabold sm:text-xl">{money(price)}</span>
          {was && <span className="text-xs text-slate-400 line-through">{money(was)}</span>}
        </div>
        {was ? (
          <p className="text-[11px] font-bold text-emerald-600 sm:text-xs">
            {earlyPct > 0 ? `${t("pre.home.earlyTag")} · ` : ""}
            {t("pre.home.save", { amount: money(was - price) })}
          </p>
        ) : null}

        {/* Scarcity: real reservations when there are any, else the pieces left. */}
        <div className="mt-auto pt-2.5">
          {progress ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-mango-400 to-coral-500"
                  style={{ width: `${Math.max(8, progress.pct)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] font-bold text-coral-600">
                {t("pre.cardReserved", { n: progress.reserved })} ·{" "}
                {progress.left === 1 ? t("pre.lastLeft") : t("pre.home.onlyLeft", { n: progress.left })}
              </p>
            </>
          ) : left > 0 ? (
            <p className={`text-[11px] font-bold ${left <= 10 ? "text-coral-600" : "text-ocean-700"}`}>
              {left <= 10 ? `🔥 ${t("pre.home.onlyLeft", { n: left })}` : t("pre.home.open", { n: left })}
            </p>
          ) : (
            <p className="text-[11px] font-bold text-slate-400">{t("pre.fullyReserved")}</p>
          )}

          <span className="relative mt-2 flex h-9 items-center justify-center overflow-hidden rounded-full bg-mango-500 text-xs font-extrabold text-ocean-950 transition group-hover:bg-mango-400 sm:h-10 sm:text-sm">
            <span aria-hidden className="animate-pre-shine absolute inset-y-0 left-0 w-1/3 bg-white/40" />
            <span className="relative">{t("pre.cta")} →</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
