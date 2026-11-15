import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import LookCard from "@/components/looks/LookCard";
import { LOOK_OCCASIONS, type LookCardData } from "@/lib/look-utils";
import type { T } from "@/lib/i18n";

/**
 * The home page's "Shop the look" row: occasion chips, then the looks as
 * tall cards — swiped through on a phone like a stories row, a grid from
 * a laptop up. Each chip opens /looks already filtered.
 */
export default function LooksRail({ looks, t }: { looks: LookCardData[]; t: T }) {
  if (looks.length === 0) return null;
  const present = LOOK_OCCASIONS.filter((o) => looks.some((l) => l.occasions.includes(o.key)));
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader title={t("look.section")} subtitle={t("look.section.sub")} href="/looks" linkLabel={t("look.all")} />
      {present.length > 1 && (
        <div className="rail-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {present.map((o) => (
            <Link
              key={o.key}
              href={`/looks?o=${o.key}`}
              className="shrink-0 rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-ocean-900 hover:border-ocean-300 hover:bg-ocean-50"
            >
              {o.emoji} {o.label}
            </Link>
          ))}
        </div>
      )}
      <div className="rail-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
        {looks.slice(0, 8).map((look) => (
          <div key={look.id} className="w-[72%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
            <LookCard look={look} t={t} />
          </div>
        ))}
      </div>
    </section>
  );
}
