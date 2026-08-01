/** KPI tile used on the vendor and admin dashboards. */
export default function StatCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  /** e.g. "+12% vs last month" — rendered in green. */
  trend?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand-100 text-lg">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
        {value}
      </p>
      {trend && <p className="mt-1 text-xs font-semibold text-emerald-600">{trend}</p>}
    </div>
  );
}
