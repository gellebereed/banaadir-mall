import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import SectionHeader from "@/components/SectionHeader";
import StoryPlayer from "@/components/story/StoryPlayer";
import { getProducts, getStories, getStory } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = await getStory((await params).id);
  return {
    title: story?.title ?? "Guide",
    description: story?.subtitle,
  };
}

/**
 * One guide, plus the products it is about.
 *
 * The products are the point of the page, not a footnote: somebody who has
 * just read how to look after a cast-iron pan is closer to buying one than
 * they will be all week, and making them go and search for it again is
 * throwing that away.
 */
export default async function StoryPage({ params }: Props) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story || !story.published) notFound();

  const [products, allStories] = await Promise.all([getProducts(), getStories()]);

  const featured = story.productIds
    .map((productId) => products.find((product) => product.id === productId))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

  const more = allStories.filter((other) => other.id !== story.id).slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-slate-400">
        <Link href="/" className="hover:text-ocean-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/learn" className="hover:text-ocean-700">
          Guides
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{story.title}</span>
      </nav>

      <StoryPlayer story={story} />

      {featured.length > 0 && (
        <section className="mt-12">
          <SectionHeader
            title={featured.length === 1 ? "The product" : "Products in this guide"}
            subtitle="Everything covered above, ready to order"
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {more.length > 0 && (
        <section className="mt-12">
          <SectionHeader title="More guides" href="/learn" />
          <div className="grid gap-3 sm:grid-cols-3">
            {more.map((other) => (
              <Link
                key={other.id}
                href={`/learn/${other.id}`}
                className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                  {other.kind.replace("-", " ")}
                </p>
                <h3 className="mt-1.5 font-display text-sm font-bold leading-snug text-ocean-950 group-hover:text-ocean-700">
                  {other.title}
                </h3>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
