"use client";

import { useEffect, useState } from "react";

/**
 * Flash-deal countdown. Counts down to the admin's chosen end time
 * (/admin/flash), or to midnight when none is set. Renders a placeholder
 * until mounted to avoid a hydration mismatch.
 */
export default function CountdownTimer({ endsAt }: { endsAt?: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let target: Date;
      if (endsAt) {
        target = new Date(endsAt);
        if (Number.isNaN(target.getTime())) target = midnightAfter(now);
      } else {
        target = midnightAfter(now);
      }
      setLeft(Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  /** Next midnight — the default deadline when no end time is set. */
  function midnightAfter(now: Date): Date {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight;
  }

  const days = left === null ? 0 : Math.floor(left / 86400);

  const parts =
    left === null
      ? ["--", "--", "--"]
      : [
          String(Math.floor((left % 86400) / 3600)).padStart(2, "0"),
          String(Math.floor((left % 3600) / 60)).padStart(2, "0"),
          String(left % 60).padStart(2, "0"),
        ];

  return (
    <div className="flex items-center gap-1.5" aria-label="Deal ends in">
      <span className="text-xs font-medium text-coral-600">Ends in</span>
      {days > 0 && (
        <span className="rounded-md bg-coral-500 px-1.5 py-0.5 font-mono text-xs font-bold text-white">
          {days}d
        </span>
      )}
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="rounded-md bg-ocean-950 px-1.5 py-0.5 font-mono text-xs font-bold text-white tabular-nums">
            {p}
          </span>
          {i < 2 && <span className="text-xs font-bold text-ocean-950">:</span>}
        </span>
      ))}
    </div>
  );
}
