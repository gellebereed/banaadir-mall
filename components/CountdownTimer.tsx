"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";
import { parseShopTime } from "@/lib/shop-time";

/**
 * Flash-deal countdown to the admin's end time (/admin/flash). Renders
 * nothing when there is no end time — it used to count to midnight and
 * start again every night, an "ending soon" that never ended. Renders a
 * placeholder until mounted to avoid a hydration mismatch.
 */
export default function CountdownTimer({ endsAt }: { endsAt?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  const t = useT();

  const target = endsAt ? parseShopTime(endsAt) : NaN;

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;
  if (left === 0) {
    return <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{t("section.ended")}</span>;
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
      <span className="text-xs font-medium text-coral-600">{t("section.endsIn")}</span>
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
