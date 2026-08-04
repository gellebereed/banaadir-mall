"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHAT WE KNOW ABOUT YOU, AND THE BUTTON THAT DELETES IT.
 * ─────────────────────────────────────────────────────────────────────────
 * Personalisation without a way to see and undo it is surveillance the
 * shopper happens to benefit from. This panel is the other half of the
 * bargain: the actual counts, where they are stored, and one button that
 * clears them for real.
 *
 * It is also, unglamorously, a conversion feature. A shopper who has seen
 * that the history lives on their own device and can be wiped in one click
 * stops treating the recommendations as something being done to them — and
 * a shopper who trusts the shelves reads the shelves.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import { useReco } from "./RecoProvider";

export default function RecoControls() {
  const { profile, ready, reset } = useReco();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  const counts = useMemo(() => {
    const tally = { viewed: 0, saved: 0, basket: 0, bought: 0, searches: 0 };
    const seen = new Set<string>();
    for (const event of profile.events) {
      switch (event.k) {
        case "view":
          if (event.id && !seen.has(event.id)) {
            seen.add(event.id);
            tally.viewed++;
          }
          break;
        case "wish":
          tally.saved++;
          break;
        case "cart":
          tally.basket++;
          break;
        case "buy":
          tally.bought++;
          break;
        case "search":
          tally.searches++;
          break;
        default:
          break;
      }
    }
    return tally;
  }, [profile.events]);

  if (!ready) return null;

  const empty = profile.events.length === 0 && profile.muted.length === 0;

  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-bold text-ocean-950">
        Your recommendations
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Everything below is stored in this browser, on this device. It is sent
        to us only while a page is loading its suggestions, and never saved on
        our side.
      </p>

      {empty ? (
        <p className="mt-4 rounded-xl bg-sand-50 p-4 text-sm text-slate-500">
          Nothing recorded yet. Browse a few products and the shelves will
          start explaining themselves.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Products viewed" value={counts.viewed} />
            <Stat label="Saved" value={counts.saved} />
            <Stat label="Added to basket" value={counts.basket} />
            <Stat label="Bought" value={counts.bought} />
            <Stat label="Searches" value={counts.searches} />
          </dl>

          {profile.muted.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              {profile.muted.length} product{profile.muted.length === 1 ? "" : "s"} hidden
              because you said you weren&apos;t interested.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {confirming ? (
              <>
                <button
                  onClick={() => {
                    reset();
                    setConfirming(false);
                    setCleared(true);
                  }}
                  className="rounded-full bg-coral-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-coral-600"
                >
                  Yes, forget everything
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-ocean-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-full border border-sand-300 px-4 py-2 text-xs font-bold text-slate-600 transition hover:border-coral-400 hover:text-coral-600"
              >
                Reset my recommendations
              </button>
            )}
            <span className="text-xs text-slate-400">
              Your orders and wishlist are kept — only the browsing history
              behind the suggestions is cleared.
            </span>
          </div>
        </>
      )}

      {cleared && (
        <p className="mt-3 text-xs font-semibold text-emerald-600">
          ✓ Cleared. The shelves will start again from scratch.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-sand-50 p-3">
      <dd className="font-display text-xl font-extrabold text-ocean-950">{value}</dd>
      <dt className="text-[11px] leading-tight text-slate-500">{label}</dt>
    </div>
  );
}
