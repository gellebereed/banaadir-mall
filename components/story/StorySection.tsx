import Link from "next/link";
import StoryPlayer from "./StoryPlayer";
import type { ProductStory } from "@/lib/types";

/**
 * The story block on a product page.
 *
 * Placed between the buy box and the reviews on purpose. By that point the
 * shopper has decided they are interested and is looking for a reason to be
 * confident — which is exactly what a two-minute "here is how you actually
 * use it" answers, and exactly what a spec list does not.
 *
 * Renders nothing at all when the product has no story, so a catalogue
 * where only the flagship items have been written up does not end up with
 * an empty heading on every other page.
 */
export default function StorySection({ stories }: { stories: ProductStory[] }) {
  if (stories.length === 0) return null;

  const [lead, ...rest] = stories;

  return (
    <section className="band band-utility band-edge mt-8 py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600 ring-1 ring-inset ring-sand-200">
              Get the most from it
            </span>
            <h2 className="mt-2 font-display text-xl font-extrabold text-ocean-950 sm:text-2xl">
              Before you buy
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              How it works, what it is for, and what it looks like in someone
              else&apos;s home.
            </p>
          </div>
          <Link
            href="/learn"
            className="rounded-full border border-sand-300 bg-white/70 px-3.5 py-1.5 text-xs font-bold text-ocean-700 transition hover:border-ocean-400"
          >
            Browse all guides →
          </Link>
        </div>

        <StoryPlayer story={lead} compact />

        {rest.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.slice(0, 3).map((story) => (
              <Link
                key={story.id}
                href={`/learn/${story.id}`}
                className="card group flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                  {story.kind.replace("-", " ")}
                  {story.duration ? ` · ${story.duration}` : ""}
                </p>
                <h3 className="mt-1.5 font-display text-sm font-bold leading-snug text-ocean-950 group-hover:text-ocean-700">
                  {story.title}
                </h3>
                {story.subtitle && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{story.subtitle}</p>
                )}
                <span className="mt-3 text-xs font-bold text-ocean-700">Read →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
