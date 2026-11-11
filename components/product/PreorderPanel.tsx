"use client";

import { usePrefs } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { arrivalDate, daysUntilArrival, preorderProgress } from "@/lib/preorder";
import type { Product } from "@/lib/types";

/**
 * THE PRE-ORDER PANEL — why to reserve it today, on the product page.
 *
 * It sits where the stock line would be, because it answers the question a
 * shopper has at exactly that point: "can I have this, and when?". Every
 * line in it is a fact the shop entered or an order that exists
 * (lib/preorder.ts) — the date is the shop's date, the bar is real
 * reservations, and the early price really ends on arrival. A pre-order
 * asks somebody to pay for something they cannot hold yet; the only thing
 * that earns that is being exact about what they get and when.
 *
 * `was` is the price it returns to — passed in because it belongs to the
 * variant being looked at, not to the product.
 */
export default function PreorderPanel({ product, was }: { product: Product; was?: number }) {
  const { t, lang } = usePrefs();
  const preorder = product.preorder;
  if (!preorder) return null;

  const days = daysUntilArrival(preorder.arrivesAt);
  const date = arrivalDate(preorder.arrivesAt, lang);
  const progress = preorderProgress(product);
  const early = (preorder.earlyPct ?? 0) > 0 && was !== undefined;

  const countdown =
    days < 0 ? t("pre.anyDay") : days === 0 ? t("pre.today") : days === 1 ? t("pre.tomorrow") : t("pre.daysToGo", { n: days });

  return (
    <section
      aria-label={t("pre.eyebrow")}
      className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-950 via-ocean-900 to-ocean-800 text-white shadow-lg shadow-ocean-950/20"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-mango-300">
            {t("pre.eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold leading-tight sm:text-2xl">
            {t("pre.headline")}
          </h2>
          <p className="mt-1.5 text-sm text-white/80">
            📦 {days < 0 ? t("pre.anyDay") : t("pre.expected", { date })}
          </p>
        </div>
        {/* The days, large — the one number on the page that is a deadline. */}
        {days > 1 ? (
          <div className="shrink-0 rounded-2xl bg-white/10 px-3.5 py-2 text-center ring-1 ring-white/15">
            <p className="font-display text-3xl font-extrabold leading-none tabular-nums text-mango-300">{days}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/70">
              {t("pre.daysLabel")}
            </p>
          </div>
        ) : (
          <span className="shrink-0 rounded-full bg-mango-400 px-3 py-1.5 text-xs font-extrabold text-ocean-950">
            {countdown}
          </span>
        )}
      </div>

      {progress && (
        <div className="px-5 pt-4">
          <div
            className="h-2.5 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.reserved}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-mango-400 to-coral-400"
              style={{ width: `${Math.max(6, progress.pct)}%` }}
            />
          </div>
          <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs font-semibold">
            <span className="text-white/85">
              {t("pre.reserved", { reserved: progress.reserved, total: progress.total })}
            </span>
            {progress.left > 0 && (
              <span className="text-mango-300">
                {progress.left === 1 ? t("pre.lastLeft") : t("pre.left", { n: progress.left })}
              </span>
            )}
          </p>
        </div>
      )}

      {early && (
        <p className="mx-5 mt-4 rounded-2xl bg-mango-400 px-4 py-2.5 text-sm text-ocean-950">
          <strong className="font-extrabold">💰 {t("pre.early", { pct: preorder.earlyPct ?? 0 })}</strong>{" "}
          {t("pre.earlyEnds", { price: money(was ?? 0) })}
        </p>
      )}

      <ul className="space-y-1.5 px-5 pb-5 pt-4 text-sm text-white/90">
        {[t("pre.b.first"), t("pre.b.choice"), t("pre.b.track")].map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden className="font-bold text-mango-300">✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* The shop's own line, in its own words — set apart, not styled as ours. */}
      {preorder.note && (
        <p className="border-t border-white/10 bg-black/15 px-5 py-3 text-sm italic text-white/85">
          “{preorder.note}”
        </p>
      )}
    </section>
  );
}
