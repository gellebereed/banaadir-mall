/**
 * Placeholder shown the instant a dashboard link is clicked, while the
 * server renders the real page. Without it the previous page just sits
 * there and the click feels ignored.
 */
export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-sand-200/70" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-sand-200/60" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-5">
            <div className="h-4 w-24 rounded bg-sand-200/70" />
            <div className="mt-3 h-8 w-20 rounded bg-sand-200/70" />
          </div>
        ))}
      </div>

      <div className="card mt-4 p-5">
        <div className="h-5 w-40 rounded bg-sand-200/70" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 rounded-lg bg-sand-200/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
