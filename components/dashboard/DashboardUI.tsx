import Link from "next/link";
import { RANGES, type Delta, type Ranked, type RangeKey, type SeriesPoint } from "@/lib/analytics";
import { money } from "@/lib/format";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  DASHBOARD BUILDING BLOCKS — shared by the seller and admin dashboards.
 * ─────────────────────────────────────────────────────────────────────────
 * Every piece here is a SERVER component, and the filters are ordinary
 * links rather than client state. A dashboard is read far more often than
 * it is interacted with, so the whole page arrives rendered, a filter is a
 * normal navigation, and the numbers can never drift out of sync with the
 * URL that produced them.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Filters ────────────────────────────────────────────────────────────

export interface TabDef {
  key: string;
  label: string;
  icon: string;
}

function hrefFor(basePath: string, params: Record<string, string>): string {
  // Empty values are dropped, so a page with no tabs (e.g. Commission)
  // does not carry a bare `?tab=` around in its URL.
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ""),
  ).toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** Time-range chips. The selected range drives every number on the page. */
export function RangeFilter({
  basePath,
  range,
  tab,
}: {
  basePath: string;
  range: RangeKey;
  tab: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-sand-200">
      {RANGES.map((option) => (
        <Link
          key={option.key}
          href={hrefFor(basePath, { range: option.key, tab })}
          scroll={false}
          className={
            "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
            (option.key === range
              ? "bg-ocean-700 text-white"
              : "text-slate-500 hover:bg-sand-100 hover:text-ocean-900")
          }
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

/** Section tabs for the lower half of the dashboard. */
export function TabFilter({
  basePath,
  tabs,
  active,
  range,
}: {
  basePath: string;
  tabs: TabDef[];
  active: string;
  range: RangeKey;
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={hrefFor(basePath, { range, tab: tab.key })}
          scroll={false}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition " +
            (tab.key === active
              ? "bg-ocean-950 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-sand-200 hover:bg-sand-100")
          }
        >
          <span aria-hidden>{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────

/**
 * A headline number with its change against the previous period.
 *
 * The delta is rendered from real data or not at all. It is also coloured
 * by MEANING, not by sign: a rise in cancellations is not good news, so
 * `invert` flips the colour without flipping the arrow.
 */
export function KpiCard({
  icon,
  label,
  value,
  delta,
  note,
  invert = false,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  delta?: Delta;
  note?: string;
  invert?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
        {value}
      </p>
      {delta && <DeltaLabel delta={delta} invert={invert} />}
      {!delta && note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
      {delta && note && <p className="mt-0.5 text-xs text-slate-400">{note}</p>}
    </>
  );

  return href ? (
    <Link href={href} className="card block p-5 transition hover:shadow-md">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

function DeltaLabel({ delta, invert }: { delta: Delta; invert: boolean }) {
  if (delta.pct === null) {
    return <p className="mt-1 text-xs font-medium text-slate-400">{delta.note ?? "no comparison"}</p>;
  }

  const good = invert ? delta.direction === "down" : delta.direction === "up";
  const tone =
    delta.direction === "flat"
      ? "text-slate-400"
      : good
        ? "text-emerald-600"
        : "text-coral-700";
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "▪";

  return (
    <p className={"mt-1 text-xs font-semibold " + tone}>
      {arrow} {Math.abs(delta.pct).toFixed(Math.abs(delta.pct) < 10 ? 1 : 0)}% vs previous period
    </p>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────

/**
 * Revenue over the selected range.
 *
 * Empty buckets render as a visible baseline rather than nothing, because
 * "no sales on Tuesday" and "Tuesday is missing from the chart" look
 * identical otherwise and mean very different things.
 */
export function TrendChart({
  series,
  title,
  subtitle,
}: {
  series: SeriesPoint[];
  title: string;
  subtitle?: string;
}) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const total = series.reduce((sum, point) => sum + point.value, 0);
  const best = series.reduce(
    (top, point) => (point.value > top.value ? point : top),
    series[0] ?? { value: 0, label: "—", date: "", orders: 0 },
  );

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-ocean-950">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {total > 0 && (
          <p className="text-right text-xs text-slate-500">
            Best: <strong className="text-ocean-950">{best.label}</strong> · {money(best.value)}
          </p>
        )}
      </div>

      {total === 0 ? (
        <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-xl bg-sand-50 text-center">
          <p className="text-sm font-semibold text-slate-500">No sales in this period</p>
          <p className="mt-1 text-xs text-slate-400">
            Try a longer range, or check that orders are coming through.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-40 items-end gap-1">
            {series.map((point) => (
              <div key={point.date} className="group relative flex-1">
                <div
                  className={
                    "w-full rounded-t-md transition " +
                    (point.value > 0
                      ? "bg-gradient-to-t from-ocean-700 to-ocean-400 group-hover:from-mango-600 group-hover:to-mango-400"
                      : "bg-sand-200")
                  }
                  style={{
                    height: point.value > 0 ? `${Math.max((point.value / max) * 160, 4)}px` : "3px",
                  }}
                />
                <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ocean-950 px-2 py-1 text-[10px] font-bold text-white group-hover:block">
                  {point.label} · {money(point.value)} · {point.orders} order
                  {point.orders === 1 ? "" : "s"}
                </span>
              </div>
            ))}
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

// ── Ranked lists ───────────────────────────────────────────────────────

/**
 * A leaderboard with an inline share bar, so relative size is readable
 * without comparing numbers.
 */
export function RankedList({
  title,
  rows,
  metric = "revenue",
  limit = 6,
  href,
  hrefLabel,
  emptyText = "Nothing to show for this period.",
  renderHref,
}: {
  title: string;
  rows: Ranked[];
  metric?: "revenue" | "units";
  limit?: number;
  href?: string;
  hrefLabel?: string;
  emptyText?: string;
  renderHref?: (row: Ranked) => string | undefined;
}) {
  const shown = rows.slice(0, limit);
  const max = Math.max(...shown.map((row) => (metric === "units" ? row.units : row.revenue)), 1);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-ocean-950">{title}</h3>
        {href && (
          <Link href={href} className="text-xs font-bold text-ocean-700 hover:underline">
            {hrefLabel ?? "See all"} →
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {shown.map((row, index) => {
            const value = metric === "units" ? row.units : row.revenue;
            const target = renderHref?.(row);
            const label = (
              <>
                <p className="truncate text-sm font-semibold text-slate-800">{row.label}</p>
                {row.sublabel && (
                  <p className="truncate text-xs text-slate-400">{row.sublabel}</p>
                )}
              </>
            );

            return (
              <li key={row.id}>
                <div className="flex items-center gap-3">
                  <span className="w-4 shrink-0 font-display text-sm font-extrabold text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {target ? (
                      <Link href={target} className="block hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-sm font-bold text-ocean-950">
                      {metric === "units" ? `${row.units} units` : money(row.revenue)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {metric === "units" ? money(row.revenue) : `${row.units} units`}
                    </p>
                  </div>
                </div>
                <div className="ml-7 mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-ocean-300"
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── Attention panel ────────────────────────────────────────────────────

export interface AttentionItem {
  icon: string;
  label: string;
  count: number;
  href: string;
  tone: "urgent" | "warn" | "info";
}

/**
 * Everything waiting on a human, counted and linked.
 *
 * This is the part of a dashboard people actually come back for: not what
 * happened, but what still needs doing. Items with a count of zero are
 * dropped entirely — a wall of green ticks buries the one row that matters.
 */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const live = items.filter((item) => item.count > 0);
  if (live.length === 0) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <span className="text-2xl">✅</span>
        <p className="text-sm font-semibold text-emerald-800">
          Nothing needs your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {live.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={
            "flex items-center gap-3 rounded-2xl border p-3 transition hover:shadow-sm " +
            (item.tone === "urgent"
              ? "border-coral-500/30 bg-coral-100/50 hover:bg-coral-100"
              : item.tone === "warn"
                ? "border-mango-200 bg-mango-50 hover:bg-mango-100"
                : "border-sand-200 bg-white hover:bg-sand-50")
          }
        >
          <span className="text-xl">{item.icon}</span>
          <div className="min-w-0">
            <p
              className={
                "font-display text-lg font-extrabold leading-none " +
                (item.tone === "urgent"
                  ? "text-coral-700"
                  : item.tone === "warn"
                    ? "text-mango-800"
                    : "text-ocean-950")
              }
            >
              {item.count}
            </p>
            <p className="truncate text-xs font-medium text-slate-600">{item.label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Small pieces ───────────────────────────────────────────────────────

export function MiniStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div
      className={
        "rounded-xl p-4 " +
        (tone === "good"
          ? "bg-emerald-50"
          : tone === "bad"
            ? "bg-coral-100/50"
            : tone === "warn"
              ? "bg-mango-50"
              : "bg-sand-50")
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold text-ocean-950">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** Horizontal bar breakdown, e.g. orders by status. */
export function BarBreakdown({
  title,
  rows,
  href,
  hrefLabel,
}: {
  title: string;
  rows: { label: string; count: number; value?: number }[];
  href?: string;
  hrefLabel?: string;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-ocean-950">{title}</h3>
        {href && (
          <Link href={href} className="text-xs font-bold text-ocean-700 hover:underline">
            {hrefLabel ?? "Manage"} →
          </Link>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No orders in this period.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-semibold capitalize text-slate-500">
                {row.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-ocean-400"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs font-bold text-ocean-950">
                {row.count}
                {row.value !== undefined && row.value > 0 && (
                  <span className="ml-1 font-normal text-slate-400">{money(row.value)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Explains where a number came from, when that is not obvious. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-slate-400">{children}</p>;
}
