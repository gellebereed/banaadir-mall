import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getProducts, getStories } from "@/lib/api";
import type { ProductStory, StoryKind } from "@/lib/types";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "How to use, care for and get the most out of what you buy at Banaadir Mall.",
};

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<StoryKind, string> = {
  "how-to": "How to use it",
  benefits: "Why it's worth it",
  care: "Looking after it",
  stories: "People using it",
  compare: "How it compares",
};

const KIND_TINT: Record<StoryKind, string> = {
  "how-to": "bg-ocean-50 text-ocean-800 ring-ocean-100",
  benefits: "bg-mango-50 text-mango-800 ring-mango-100",
  care: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  stories: "bg-coral-100 text-coral-700 ring-coral-100",
  compare: "bg-slate-100 text-slate-700 ring-slate-200",
};

/**
 * The guides index.
 *
 * A marketplace's guides are usually buried inside product pages, which
 * means they are only ever found by somebody already looking at that exact
 * product. Giving them their own home turns them into a reason to visit —
 * and a shopper who arrived to read how to season a cast-iron pan is one
 * click from the pan.
 */
export default async function LearnPage() {
  const [stories, products] = await Promise.all([getStories(), getProducts()]);
  const byId = new Map(products.map((product) => [product.id, product]));

  if (stories.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="text-6xl">📖</span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ocean-950">
          Guides are on the way
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Our sellers are writing up how to get the most out of what they
          sell. Check back shortly.
        </p>
        <Link href="/products" className="btn-primary mt-6">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <section className="texture-weave bg-gradient-to-br from-ocean-950 via-ocean-800 to-ocean-600 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mango-300 ring-1 ring-inset ring-white/20">
            Guides
          </span>
          <h1 className="mt-4 max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Know what you&apos;re buying, before you buy it.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ocean-100 sm:text-base">
            Short guides from the people who actually sell these things — how
            they work, how to look after them, and what they look like in
            someone&apos;s home.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} productCount={countProducts(story, byId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function countProducts(story: ProductStory, byId: Map<string, unknown>): number {
  return story.productIds.filter((id) => byId.has(id)).length;
}

function StoryCard({ story, productCount }: { story: ProductStory; productCount: number }) {
  const cover = story.heroImage || story.poster || story.gallery?.[0];

  return (
    <Link
      href={`/learn/${story.id}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ocean-900/10"
    >
      <div className="relative aspect-[16/10] w-full bg-sand-100">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-ocean-100 to-sand-100 text-5xl">
            📖
          </div>
        )}
        {story.videoUrl && (
          <span className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sm text-ocean-900 shadow-lg">
            ▶
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ring-1 ring-inset ${KIND_TINT[story.kind]}`}
          >
            {KIND_LABEL[story.kind]}
          </span>
          {story.duration && (
            <span className="text-[10px] font-bold text-slate-400">{story.duration}</span>
          )}
        </div>

        <h2 className="mt-2 font-display text-base font-extrabold leading-snug text-ocean-950 group-hover:text-ocean-700">
          {story.title}
        </h2>
        {story.subtitle && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{story.subtitle}</p>
        )}

        <p className="mt-auto pt-3 text-[11px] font-semibold text-slate-400">
          {story.chapters.length} step{story.chapters.length === 1 ? "" : "s"}
          {productCount > 0 &&
            ` · ${productCount} product${productCount === 1 ? "" : "s"}`}
        </p>
      </div>
    </Link>
  );
}
