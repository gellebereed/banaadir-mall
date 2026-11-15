import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import LooksCarousel from "@/components/looks/LooksCarousel";
import { LOOK_OCCASIONS, type LookCardData } from "@/lib/look-utils";
import type { T } from "@/lib/i18n";

/**
 * The home page's "Shop the look" row: occasion chips, then the looks in
 * a carousel. Each card's "+" dots open the piece right on the home page
 * (components/looks/LookCard.tsx). Each chip opens /looks already filtered.
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
      <LooksCarousel looks={looks.slice(0, 10)} />
    </section>
  );
}
