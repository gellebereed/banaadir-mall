/**
 * Loading skeletons, rendered by the route-level loading.tsx files.
 *
 * Why these exist (IMPORTANT for perceived speed):
 * Next.js shows a route's loading.tsx INSTANTLY when the user clicks a
 * link, while the real page renders. Without them a click appears to "do
 * nothing" for a moment — which is exactly the sluggish feeling we want
 * to avoid. Keep a loading.tsx next to every page that isn't trivial.
 *
 * Note: in `npm run dev` pages also COMPILE on first visit, which adds
 * seconds that production doesn't have. Always judge speed with
 * `npm run preview` (build + start), not the dev server.
 */

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-sand-200/70 ${className}`} />;
}

/** Grid of product-card placeholders (products / category / search). */
export function ProductGridSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Shimmer className="h-9 w-56" />
      <Shimmer className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card overflow-hidden">
            <Shimmer className="aspect-square w-full !rounded-none" />
            <div className="space-y-2 p-3.5">
              <Shimmer className="h-4 w-full" />
              <Shimmer className="h-4 w-2/3" />
              <Shimmer className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Product detail placeholder. */
export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Shimmer className="h-4 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Shimmer className="aspect-square w-full !rounded-3xl" />
        <div className="space-y-4">
          <Shimmer className="h-8 w-3/4" />
          <Shimmer className="h-4 w-40" />
          <Shimmer className="h-10 w-32" />
          <Shimmer className="h-20 w-full" />
          <Shimmer className="h-12 w-full !rounded-full" />
          <Shimmer className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Generic centered spinner for everything else. */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-sand-200 border-t-ocean-700" />
      <p className="text-sm font-semibold text-slate-400">Loading…</p>
    </div>
  );
}
