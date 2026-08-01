/** Star rating display, e.g. ★★★★☆ 4.8 (412). */
export default function Rating({
  value,
  count,
  className = "",
}: {
  value: number;
  count?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <span aria-hidden className="text-mango-400">
        {"★".repeat(Math.round(value))}
        <span className="text-sand-200">{"★".repeat(5 - Math.round(value))}</span>
      </span>
      <span className="font-medium text-slate-700">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-slate-400">({count.toLocaleString()})</span>
      )}
    </span>
  );
}
