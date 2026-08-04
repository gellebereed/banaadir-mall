"use client";

import { JOURNEY_STEPS, parcelJourney, stampLabel } from "@/lib/delivery";
import type { Order } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ORDER PROGRESS — where this parcel has got to, at a glance.
 * ─────────────────────────────────────────────────────────────────────────
 * A horizontal rail: placed → packed → on the way → delivered, with the
 * completed portion filled and the current step marked. It reads in about a
 * second, which is what the question deserves — "where is my order" should
 * not require reading a list.
 *
 * ── Why it is per PARCEL, not per order ──────────────────────────────────
 * An order spanning three shops is three parcels, each dispatched by a
 * different shop on a different day. A single bar across the whole order
 * would have to pick one status to show, and whichever it picked would be
 * wrong for the other two. So each shop's items get their own rail, which
 * is also exactly how the seller updates them.
 *
 * Cancelled sits outside the path entirely — it is not a stage of delivery,
 * so it replaces the rail rather than colouring it.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function OrderProgress({
  order,
  /** Briefly highlights the rail when the status has just changed. */
  highlight = false,
  compact = false,
}: {
  order: Pick<Order, "status" | "timeline" | "date">;
  highlight?: boolean;
  compact?: boolean;
}) {
  if (order.status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-coral-100/60 px-3 py-2 text-xs font-semibold text-coral-700">
        <span>✕</span>
        <span>This parcel was cancelled. The rest of the order is unaffected.</span>
      </div>
    );
  }

  const journey = parcelJourney(order);
  const currentIndex = journey.findIndex((step) => step.current);
  const lastIndex = JOURNEY_STEPS.length - 1;

  // The fill stops at the CURRENT step rather than running to the end, so a
  // parcel that has shipped never looks delivered.
  const fillPercent = lastIndex > 0 ? (Math.max(0, currentIndex) / lastIndex) * 100 : 0;

  return (
    <div
      className={
        "rounded-2xl border p-3 transition-colors duration-700 " +
        (highlight ? "border-mango-300 bg-mango-50" : "border-sand-200 bg-white")
      }
    >
      <div className="relative">
        {/* Rail. Positioned to run through the centre of the dots. */}
        <div
          className="absolute left-0 right-0 h-1 rounded-full bg-sand-200"
          style={{ top: compact ? 11 : 15 }}
        />
        <div
          className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-ocean-600 to-ocean-400 transition-[width] duration-700"
          style={{ top: compact ? 11 : 15, width: `${fillPercent}%` }}
        />

        <ol className="relative flex justify-between">
          {journey.map((step) => (
            <li
              key={step.status}
              className="flex min-w-0 flex-1 flex-col items-center text-center"
            >
              <span
                className={
                  "flex items-center justify-center rounded-full ring-4 ring-white transition " +
                  (compact ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-sm") +
                  " " +
                  (step.reached
                    ? "bg-ocean-700 text-white shadow-sm shadow-ocean-700/30"
                    : "bg-sand-200 text-slate-400")
                }
              >
                {step.reached && !step.current ? "✓" : step.icon}
              </span>

              <span
                className={
                  "mt-1.5 w-full truncate px-0.5 text-[10px] font-bold leading-tight sm:text-[11px] " +
                  (step.current
                    ? "text-ocean-950"
                    : step.reached
                      ? "text-ocean-700"
                      : "text-slate-400")
                }
              >
                {step.label}
              </span>

              {!compact && (
                <span className="mt-0.5 h-3 text-[10px] leading-none text-slate-400">
                  {step.reached && step.at ? stampLabel(step.at) : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* What is happening right now, spelled out — the icons alone say
          where it is, not what that means for the customer. */}
      <p className="mt-2 text-center text-[11px] text-slate-500">
        {journey[Math.max(0, currentIndex)]?.text}
      </p>
    </div>
  );
}

/**
 * A small "updating automatically" note.
 *
 * Worth saying out loud: a customer who does not know the page refreshes
 * itself will reload it anyway, and one who reloads and sees no change
 * assumes the page is broken rather than that the shop has not acted yet.
 */
export function LiveIndicator({
  live,
  lastCheckedAt,
  onRefresh,
}: {
  live: boolean;
  lastCheckedAt: number | null;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
      {live ? (
        <>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span>
            Updating automatically
            {lastCheckedAt
              ? ` · checked ${new Date(lastCheckedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </span>
        </>
      ) : (
        <span>This order is complete — nothing left to update.</span>
      )}
      {onRefresh && live && (
        <button
          type="button"
          onClick={onRefresh}
          className="font-semibold text-ocean-700 underline hover:text-ocean-900"
        >
          Check now
        </button>
      )}
    </div>
  );
}
