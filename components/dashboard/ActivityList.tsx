import type { ActivityEntry } from "@/lib/ledger-types";

/** Grouped by day, newest first. Server component — no interactivity. */
export default function ActivityList({
  entries,
  storeNames,
}: {
  entries: ActivityEntry[];
  /** When given, each line also says which store it happened in. */
  storeNames?: Record<string, string>;
}) {
  if (entries.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        Nothing recorded yet. Changes to products, orders, the team, settings and payouts appear
        here as they happen.
      </div>
    );
  }

  const days = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const day = e.at.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), e]);
  }

  return (
    <div className="space-y-5">
      {[...days].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">
            {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h2>
          <ul className="card divide-y divide-sand-100">
            {list.map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="w-12 shrink-0 pt-0.5 font-mono text-[11px] text-slate-400">
                  {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800">{e.summary}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.actorName || e.actorEmail || "System"}
                    {e.actorEmail && e.actorName ? ` · ${e.actorEmail}` : ""}
                    {storeNames && e.store !== "platform" ? ` · ${storeNames[e.store] ?? e.store}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
