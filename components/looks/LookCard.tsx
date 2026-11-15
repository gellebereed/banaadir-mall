import Image from "next/image";
import Link from "next/link";
import { money } from "@/lib/format";
import { lookPath, type LookCardData } from "@/lib/look-utils";
import type { T } from "@/lib/i18n";

/**
 * One look in a feed: the outfit photo with its dots, and underneath what
 * the whole outfit costs. Tall (4:5) on purpose — it is a photo of a
 * person, and a square crop cuts off the shoes.
 */
export default function LookCard({ look, t, priority = false }: { look: LookCardData; t: T; priority?: boolean }) {
  const saving = look.bundlePrice !== undefined ? look.total - look.bundlePrice : 0;
  return (
    <Link
      href={lookPath(look)}
      className="group relative block overflow-hidden rounded-3xl bg-ocean-950 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[4/5]">
        <Image
          src={look.image}
          alt={look.title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 72vw, (max-width: 1024px) 40vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        {look.dots.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-sm font-bold leading-none text-ocean-950 shadow-md ring-4 ring-white/30"
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          >
            +
          </span>
        ))}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {saving > 0 && (
            <span className="rounded-full bg-coral-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
              {t("look.save", { amount: money(saving) })}
            </span>
          )}
          {look.soldOut > 0 && (
            <span className="rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              {t("look.soldOut", { n: look.soldOut })}
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-16 text-white">
          <p className="font-display text-lg font-extrabold leading-tight">{look.title}</p>
          <p className="mt-0.5 truncate text-xs text-white/75">{t("look.by", { stores: look.stores.join(" · ") })}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex -space-x-2">
              {look.thumbs.map((p, i) =>
                p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={p.image} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm ring-2 ring-white">
                    {p.icon}
                  </span>
                ),
              )}
            </div>
            <p className="text-right text-sm font-bold">
              <span className="block text-[11px] font-medium text-white/70">{t("look.pieces", { n: look.pieces })}</span>
              {look.bundlePrice !== undefined ? (
                <>
                  <span className="mr-1 text-xs font-medium text-white/60 line-through">{money(look.total)}</span>
                  {money(look.bundlePrice)}
                </>
              ) : (
                money(look.total)
              )}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
