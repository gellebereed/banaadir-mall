import { shortDate } from "@/lib/format";

/**
 * Lightweight SVG bar chart for daily revenue — no chart library needed,
 * which keeps the bundle small. Swap for a real charting lib if the
 * dashboards grow more complex.
 */
export default function RevenueChart({
  series,
  title = "Revenue — last 14 days",
}: {
  series: { date: string; value: number }[];
  title?: string;
}) {
  const max = Math.max(...series.map((d) => d.value), 1);

  return (
    <div className="card p-5">
      <h3 className="font-display font-bold text-ocean-950">{title}</h3>
      <div className="mt-4 flex h-40 items-end gap-1.5">
        {series.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1 rounded-t-md bg-gradient-to-t from-ocean-700 to-ocean-400 transition hover:from-mango-600 hover:to-mango-400"
            style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
          >
            {/* tooltip */}
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ocean-950 px-2 py-1 text-[10px] font-bold text-white group-hover:block">
              {shortDate(d.date)} · ${Math.round(d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{shortDate(series[0].date)}</span>
        <span>{shortDate(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}
