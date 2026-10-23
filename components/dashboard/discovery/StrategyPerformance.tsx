import { updateAutoTune } from "@/app/actions";
import type { StrategyStats } from "@/lib/reco/metrics";
import { MIN_TOTAL_IMPRESSIONS, type Tuning } from "@/lib/reco/tuning";

const NAMES: Record<string, string> = {
  "bought-together": "Bought together",
  similar: "Similar products",
  completes: "Completes the look",
  "seed-store": "Same shop",
  taste: "Shopper's taste",
  continue: "Continue browsing",
  saved: "Like saved items",
  wished: "Still on wishlist",
  basket: "Basket matches",
  "saved-basket": "Saved → basket",
  "price-drop": "Price drops",
  "new-from-stores": "New from followed shops",
  rising: "Rising",
  popular: "Popular",
  discover: "Discovery slot",
  coviewed: "Viewed together",
  pins: "Admin pushes",
};

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/**
 * The same funnel as the shelf table, split by the strategy that picked
 * each card — and the weight multiplier auto-tuning gives it as a result.
 */
export default function StrategyPerformance({
  rows,
  tuning,
  autoTune,
}: {
  rows: StrategyStats[] | null;
  tuning: Tuning;
  autoTune: boolean;
}) {
  const sorted = [...(rows ?? [])].sort((a, b) => b.impressions - a.impressions);
  const progress = Math.min(100, Math.round((tuning.totalImpressions / MIN_TOTAL_IMPRESSIONS) * 100));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="max-w-2xl">
          <p className="font-display text-lg font-extrabold text-ocean-950">Which strategies earn their place</p>
          <p className="mt-1 text-sm text-slate-500">
            Each card on a shelf was picked by one strategy. With auto-tuning on, strategies whose picks get
            tapped, basketed and bought more often get a little more weight (up to ×1.6), weaker ones a little
            less (down to ×0.6). Admin pushes and the discovery slot are never tuned. Last 30 days.
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-600">
            {!autoTune
              ? "Auto-tuning is off — every strategy uses its standard weight."
              : tuning.active
                ? `Active — based on ${tuning.totalImpressions.toLocaleString()} cards shown. Updates every 10 minutes.`
                : `Collecting data: ${tuning.totalImpressions.toLocaleString()} of ${MIN_TOTAL_IMPRESSIONS.toLocaleString()} cards shown (${progress}%). Nothing changes until then.`}
          </p>
        </div>
        <form action={updateAutoTune} className="flex items-center gap-3 rounded-xl bg-sand-50 px-4 py-3 text-sm">
          <label className="flex items-center gap-2 font-semibold text-slate-700">
            <input type="checkbox" name="autoTune" defaultChecked={autoTune} className="h-4 w-4 accent-ocean-700" />
            Auto-tune weights
          </label>
          <button type="submit" className="btn-secondary !px-3 !py-1 text-xs">
            Save
          </button>
        </form>
      </div>

      {sorted.length === 0 ? (
        <p className="border-t border-sand-100 p-8 text-center text-sm text-slate-400">
          No strategy data yet. It starts collecting as soon as shoppers see shelves
          {rows === null ? " — after supabase/migration-reco-learning.sql has been run" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-sand-100">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Strategy</th>
                <th className="px-4 py-2.5 text-right">Cards shown</th>
                <th className="px-4 py-2.5 text-right">Tapped</th>
                <th className="px-4 py-2.5 text-right">Basket</th>
                <th className="px-4 py-2.5 text-right">Bought</th>
                <th className="px-4 py-2.5 text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {sorted.map((r) => {
                const m = autoTune ? (tuning.multipliers.get(r.via) ?? 1) : 1;
                return (
                  <tr key={r.via}>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{NAMES[r.via] ?? r.via}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.clicks} <span className="text-xs text-slate-400">{pct(r.clicks, r.impressions)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.carts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.orders}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                        m > 1 ? "text-emerald-700" : m < 1 ? "text-coral-600" : "text-slate-400"
                      }`}
                    >
                      ×{m.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
