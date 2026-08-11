import { money } from "@/lib/format";
import type { CohortRow, CustomerSeriesPoint } from "@/lib/customers";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ANALYTICS BUILDING BLOCKS
 * ─────────────────────────────────────────────────────────────────────────
 * The two charts a customer report needs that a sales report does not:
 * a split of new against returning over time, and a retention grid.
 *
 * Server components, like everything in DashboardUI — the page arrives
 * rendered and there is no client state to drift out of step with the URL.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── New vs returning ───────────────────────────────────────────────────

/**
 * One bar per bucket, split into the customers who had never bought before
 * and the ones who had.
 *
 * ── Why stacked rather than two lines ────────────────────────────────────
 * The question this chart answers is "is growth coming from new people or
 * from the same people buying more", and that is a question about
 * PROPORTION. Two separate lines make you compare heights across the gap
 * between them; one stacked bar puts the ratio on the screen directly, and
 * the total is still readable as the bar's full height.
 */
export function SplitTrendChart({
  series,
  title,
  subtitle,
  metric = "customers",
}: {
  series: CustomerSeriesPoint[];
  title: string;
  subtitle?: string;
  /** Stack customer COUNTS, or the revenue each group produced. */
  metric?: "customers" | "revenue";
}) {
  const valueOf = (point: CustomerSeriesPoint) =>
    metric === "customers"
      ? { fresh: point.newCustomers, repeat: point.returningCustomers }
      : { fresh: point.newRevenue, repeat: point.returningRevenue };

  const max = Math.max(
    ...series.map((point) => {
      const { fresh, repeat } = valueOf(point);
      return fresh + repeat;
    }),
    1,
  );
  const total = series.reduce((sum, point) => {
    const { fresh, repeat } = valueOf(point);
    return sum + fresh + repeat;
  }, 0);

  const format = (value: number) =>
    metric === "revenue" ? money(value) : String(value);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-ocean-950">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ocean-600" />
            <span className="text-slate-500">New</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-slate-500">Returning</span>
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-xl bg-sand-50 text-center">
          <p className="text-sm font-semibold text-slate-500">
            Nobody bought in this period
          </p>
          <p className="mt-1 text-xs text-slate-400">Try a longer range.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-40 items-end gap-1">
            {series.map((point) => {
              const { fresh, repeat } = valueOf(point);
              const stack = fresh + repeat;
              return (
                <div key={point.date} className="group relative flex flex-1 flex-col justify-end">
                  {/* Returning sits on top of new, so the darker block at the
                      bottom is always "people we had to go and win". */}
                  {repeat > 0 && (
                    <div
                      className="w-full rounded-t-md bg-emerald-500 transition group-hover:bg-emerald-400"
                      style={{ height: `${Math.max((repeat / max) * 150, 3)}px` }}
                    />
                  )}
                  {fresh > 0 && (
                    <div
                      className={
                        "w-full bg-ocean-600 transition group-hover:bg-ocean-500 " +
                        (repeat > 0 ? "" : "rounded-t-md")
                      }
                      style={{ height: `${Math.max((fresh / max) * 150, 3)}px` }}
                    />
                  )}
                  {stack === 0 && <div className="h-[3px] w-full rounded-sm bg-sand-200" />}

                  <span className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ocean-950 px-2 py-1 text-[10px] font-bold leading-relaxed text-white group-hover:block">
                    {point.label}
                    <br />
                    {format(fresh)} new · {format(repeat)} returning
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{series[0]?.label}</span>
            <span>{series[series.length - 1]?.label}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Retention cohorts ──────────────────────────────────────────────────

/** Colour ramp for a retention cell. Deliberately few steps: this is a
 *  heatmap to be scanned, not a gradient to be measured. */
function cellTone(value: number): string {
  if (value >= 60) return "bg-ocean-800 text-white";
  if (value >= 40) return "bg-ocean-600 text-white";
  if (value >= 25) return "bg-ocean-400 text-white";
  if (value >= 10) return "bg-ocean-200 text-ocean-900";
  if (value > 0) return "bg-ocean-100 text-ocean-800";
  return "bg-sand-100 text-slate-400";
}

/**
 * Retention by the month a customer first bought.
 *
 * ── How to read it, and why the empty cells are empty ────────────────────
 * A row is a group of people who arrived together. Left to right is what
 * happened to them since. Month 0 is always 100% — they all bought, that is
 * what put them in the row.
 *
 * Cells for months that have not happened yet are BLANK, not zero. A cohort
 * three weeks old has not failed to retain anybody at month +4; drawing a
 * cold zero there makes every recent row look like a disaster and hides the
 * one real signal in the chart, which is whether the first column is
 * getting better or worse as you read down.
 */
export function CohortGrid({
  cohorts,
  months = 6,
}: {
  cohorts: CohortRow[];
  months?: number;
}) {
  if (cohorts.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="font-display font-bold text-ocean-950">Retention by cohort</h3>
        <p className="mt-4 text-sm text-slate-400">
          Not enough order history yet — a cohort needs at least one full
          month to say anything.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-sand-200 p-5">
        <h3 className="font-display font-bold text-ocean-950">Retention by cohort</h3>
        <p className="mt-1 text-xs text-slate-500">
          Of everyone who first bought in a given month, the share who bought
          again 1, 2, 3… months later. Read down the first column to see
          whether the customers you are winning now come back more often than
          the ones you won earlier.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">First bought</th>
              <th className="px-4 py-3 text-right">Customers</th>
              {Array.from({ length: months }, (_, index) => (
                <th key={index} className="px-2 py-3 text-center">
                  {index === 0 ? "Month 0" : `+${index}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((row) => (
              <tr key={row.cohort} className="border-t border-sand-100">
                <td className="px-4 py-2 font-semibold text-slate-700">{row.label}</td>
                <td className="px-4 py-2 text-right text-slate-500">{row.size}</td>
                {row.cells.slice(0, months).map((cell, index) => (
                  <td key={index} className="px-1 py-1.5">
                    {cell === null ? (
                      <div
                        className="rounded-md bg-sand-50 py-1.5 text-center text-xs text-slate-300"
                        title="This month has not happened yet for this group"
                      >
                        ·
                      </div>
                    ) : (
                      <div
                        className={
                          "rounded-md py-1.5 text-center text-xs font-bold " + cellTone(cell)
                        }
                        title={`${Math.round((cell / 100) * row.size)} of ${row.size} came back`}
                      >
                        {Math.round(cell)}%
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Split bar ──────────────────────────────────────────────────────────

/**
 * A single bar showing how one total divides in two, with both sides
 * labelled. Used for the new-versus-returning revenue split, where the
 * ratio IS the finding and two separate numbers make you do the division.
 */
export function SplitBar({
  title,
  left,
  right,
  format = (value: number) => String(value),
}: {
  title: string;
  left: { label: string; value: number };
  right: { label: string; value: number };
  format?: (value: number) => string;
}) {
  const total = left.value + right.value;
  const leftShare = total > 0 ? (left.value / total) * 100 : 50;

  return (
    <div className="card p-5">
      <h3 className="font-display font-bold text-ocean-950">{title}</h3>

      {total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Nothing to split for this period.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-sand-100">
            <div className="bg-ocean-600" style={{ width: `${leftShare}%` }} />
            <div className="flex-1 bg-emerald-500" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-sm bg-ocean-600" />
                {left.label}
              </p>
              <p className="mt-0.5 font-display text-xl font-extrabold text-ocean-950">
                {format(left.value)}
              </p>
              <p className="text-xs text-slate-400">{Math.round(leftShare)}% of the total</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
                {right.label}
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              </p>
              <p className="mt-0.5 font-display text-xl font-extrabold text-ocean-950">
                {format(right.value)}
              </p>
              <p className="text-xs text-slate-400">
                {Math.round(100 - leftShare)}% of the total
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
