"use client";

import { useState, useTransition } from "react";
import { setMarketplaceOptIn } from "@/app/actions";

/**
 * Join or leave one marketplace-wide deal (the promo code or the site-wide
 * campaign). The discount is paid by the shop, so it is the shop's call —
 * nothing applies to its items until it says yes here.
 */
export default function MarketplaceOptIn({
  kind,
  joined,
  title,
  detail,
  available,
}: {
  kind: "promo" | "campaign";
  joined: boolean;
  title: string;
  detail: string;
  /** False when the admin has nothing running to join. */
  available: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className={`rounded-2xl border p-4 ${joined ? "border-emerald-300 bg-emerald-50/60" : "border-sand-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ocean-950">
            {title}
            {joined && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Joined</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
        </div>
        {available && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await setMarketplaceOptIn(kind, !joined);
                setMessage({ ok: result.ok, text: result.message });
              })
            }
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-60 ${
              joined
                ? "bg-sand-100 text-slate-600 hover:bg-sand-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {pending ? "Saving…" : joined ? "Leave" : "Join"}
          </button>
        )}
      </div>
      {message && (
        <p className={`mt-2 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-coral-600"}`}>{message.text}</p>
      )}
    </div>
  );
}
