"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setMarketplaceOptIn } from "@/app/actions";

export interface MarketplaceInvite {
  kind: "promo" | "campaign";
  title: string;
  detail: string;
}

/**
 * "Banaadir Mall invites you to the Eid Mega Sale" — on the shop's
 * dashboard, where it will be seen, instead of waiting to be found on the
 * Promotions page. The shop pays for its own discount, so it answers:
 * Join, or No thanks (which stops the asking until the deal changes).
 */
export default function MarketplaceInvites({ invites }: { invites: MarketplaceInvite[] }) {
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if (invites.length === 0) return null;

  return (
    <div className="mt-5 space-y-3">
      {invites.map((invite) => {
        const reply = answered[invite.kind];
        return (
          <div
            key={invite.kind}
            className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-ocean-800 to-ocean-700 p-4 text-white shadow-sm sm:p-5"
          >
            <span className="text-3xl" aria-hidden>🏬</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-mango-300">Invitation from Banaadir Mall</p>
              <p className="font-display text-lg font-extrabold">{invite.title}</p>
              <p className="text-sm text-ocean-100">{reply ?? invite.detail}</p>
            </div>
            {!reply && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setMarketplaceOptIn(invite.kind, true);
                      setAnswered((a) => ({ ...a, [invite.kind]: r.message }));
                    })
                  }
                  className="rounded-full bg-mango-500 px-5 py-2 text-sm font-bold text-white hover:bg-mango-600 disabled:opacity-60"
                >
                  Join
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setMarketplaceOptIn(invite.kind, false);
                      setAnswered((a) => ({ ...a, [invite.kind]: r.message }));
                    })
                  }
                  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20 disabled:opacity-60"
                >
                  No thanks
                </button>
                <Link href="/vendor/promotions" className="self-center text-xs font-semibold text-ocean-100 underline">
                  Details
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
