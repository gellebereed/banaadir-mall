"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";
import { parseShopTime } from "@/lib/shop-time";

/** "2d 3h", "4h 12m", "9m" — coarse on purpose; a card isn't a stopwatch. */
function short(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * A product's own flash end, when its shop chose one earlier than the
 * campaign's — so a shopper knows THIS price goes sooner than the rest.
 * Renders nothing until mounted (no hydration mismatch) and once ended.
 */
export default function FlashEndsChip({ endsAt, className = "" }: { endsAt: string; className?: string }) {
  const t = useT();
  const [left, setLeft] = useState<number | null>(null);
  const target = parseShopTime(endsAt);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [target]);

  if (left === null || left <= 0) return null;
  return (
    <span className={`rounded-full bg-coral-600/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm ${className}`}>
      ⚡ {t("flash.endsIn", { time: short(left) })}
    </span>
  );
}
