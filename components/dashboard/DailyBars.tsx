"use client";

import { useState } from "react";

/**
 * One series, one bar per day. Thin bars with rounded tops on a recessive
 * grid; hovering (or focusing) a day shows its numbers. The whole column is
 * the hit target, not just the bar, so a zero day can still be read.
 */
export default function DailyBars({
  data,
  label,
  format = (n) => String(n),
}: {
  data: { date: string; value: number; detail?: string }[];
  /** What a bar counts, for the tooltip and screen readers ("orders"). */
  label: string;
  format?: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const shown = active === null ? null : data[active];

  return (
    <div className="relative">
      {/* Tooltip */}
      <div className="h-6 text-xs text-slate-600" aria-live="polite">
        {shown ? (
          <span>
            <strong className="text-ocean-950">{day(shown.date)}</strong> — {format(shown.value)} {label}
            {shown.detail ? ` · ${shown.detail}` : ""}
          </span>
        ) : (
          <span className="text-slate-400">Hover a day to see its numbers</span>
        )}
      </div>

      <div className="relative h-36">
        {/* Recessive grid: the top value and the middle. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-sand-200" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-sand-100" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-white pl-1 text-[10px] text-slate-400">
          {format(max)}
        </span>

        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-sand-300">
          {data.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${day(d.date)}: ${format(d.value)} ${label}`}
              className="group flex h-full flex-1 items-end focus:outline-none"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${
                  active === i ? "bg-ocean-800" : "bg-ocean-600 group-focus-visible:bg-ocean-800"
                }`}
                style={{ height: d.value > 0 ? `${Math.max(4, (d.value / max) * 100)}%` : "0%" }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{day(data[0]?.date ?? "")}</span>
        <span>{day(data[Math.floor(data.length / 2)]?.date ?? "")}</span>
        <span>{day(data[data.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}
