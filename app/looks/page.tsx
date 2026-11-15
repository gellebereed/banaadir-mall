import type { Metadata } from "next";
import Link from "next/link";
import LookCard from "@/components/looks/LookCard";
import { isOccasion, LOOK_OCCASIONS } from "@/lib/look-utils";
import { getLookFeed } from "@/lib/looks";
import { getT } from "@/lib/prefs-server";
import { metaDescription, openGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Whole outfits from the shops of Banaadir Mall — for Eid, weddings, the office, school and Jimce. Pick your sizes and add the whole look in one tap.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shop the look",
    description: metaDescription(DESCRIPTION),
    alternates: { canonical: "/looks" },
    openGraph: await openGraph({ title: "Shop the look — Banaadir Mall", description: DESCRIPTION, url: "/looks" }),
  };
}

/** Every look, filterable by occasion (?o=eid). */
export default async function LooksPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const [{ o }, t, feed] = await Promise.all([searchParams, getT(), getLookFeed()]);
  const occasion = isOccasion(o) ? o : undefined;
  const looks = occasion ? feed.cards.filter((l) => l.occasions.includes(occasion)) : feed.cards;
  const present = LOOK_OCCASIONS.filter((x) => feed.cards.some((l) => l.occasions.includes(x.key)));

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-ocean-900 text-white" : "border border-sand-200 bg-white text-ocean-900 hover:bg-ocean-50"
    }`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold text-ocean-950 sm:text-4xl">{t("look.section")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("look.section.sub")}</p>

      {present.length > 0 && (
        <nav aria-label="Occasions" className="rail-scroll -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href="/looks" className={chip(!occasion)} aria-current={!occasion ? "page" : undefined}>
            {t("look.filter.all")}
          </Link>
          {present.map((x) => (
            <Link
              key={x.key}
              href={`/looks?o=${x.key}`}
              className={chip(occasion === x.key)}
              aria-current={occasion === x.key ? "page" : undefined}
            >
              {x.emoji} {x.label}
            </Link>
          ))}
        </nav>
      )}

      {looks.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-4xl">👗</p>
          <p className="mt-2 text-sm text-slate-500">{t("look.empty")}</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {looks.map((look, i) => (
            <LookCard key={look.id} look={look} t={t} priority={i < 2} />
          ))}
        </div>
      )}
    </div>
  );
}
