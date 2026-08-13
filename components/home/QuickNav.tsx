import Link from "next/link";
import type { Category } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  QUICK NAV — the ring of round icons under the hero.
 * ─────────────────────────────────────────────────────────────────────────
 * Ten taps that cover almost everything a returning shopper opens the app
 * to do, in the one place they will look for them.
 *
 * ── Why it mixes departments with merchandising ──────────────────────────
 * A department row answers "what do you sell". It does not answer the two
 * questions people actually arrive with — "what is new" and "what is
 * cheap today" — and those are the taps that turn an open app into a
 * basket. So the row leads with New In, Best Sellers and Deals, and the
 * departments follow. That ordering is not decoration: the first three
 * tiles are the ones a shopper who already knows the shop is aiming for.
 *
 * ── Round tiles, and why they beat the photo cards below ─────────────────
 * The department rail further down the page uses real product photography,
 * which is right for browsing and wrong for navigating: every tile looks
 * different, so the eye has to READ each one. A circle of flat colour with
 * one glyph is recognised by position and shape after two visits, which is
 * what makes a launcher feel fast. Both earn their place; they are doing
 * different jobs.
 *
 * Server component — it is ten links and no state.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface QuickLink {
  href: string;
  label: string;
  icon: string;
  /** Tile gradient. Falls back to the house sand tint. */
  from: string;
  to: string;
  /** Small corner flag, e.g. "Hot". */
  flag?: string;
}

/**
 * The three that lead, whatever the catalogue looks like.
 *
 * Each one points at a sort the shop page genuinely supports (see
 * ShopClient) rather than at a filter that quietly does nothing — a tile
 * that lands on an unsorted catalogue is worse than no tile, because it
 * teaches the shopper the controls are decorative.
 */
const MERCHANDISING: QuickLink[] = [
  {
    href: "/products?sort=new",
    label: "New In",
    icon: "✨",
    from: "#d7f2f2",
    to: "#b0e4e6",
  },
  {
    href: "/products?sort=sold",
    label: "Best Sellers",
    icon: "🔥",
    from: "#ffeecd",
    to: "#ffdb9b",
    flag: "Hot",
  },
  {
    href: "/flash",
    label: "Daily Deals",
    icon: "⚡",
    from: "#ffe4e4",
    to: "#ffc9c9",
  },
];

/** The two that close the row: everything on sale, and every shop. */
const UTILITY: QuickLink[] = [
  {
    href: "/products?sort=discount",
    label: "Big Savings",
    icon: "🏷️",
    from: "#ffeecd",
    to: "#ffc25e",
  },
  {
    href: "/stores",
    label: "All Stores",
    icon: "🏪",
    from: "#d7f2f2",
    to: "#7bcfd4",
  },
];

export default function QuickNav({ categories }: { categories: Category[] }) {
  /*
   * Top-level departments only, and only the ones that are actually shown
   * on the storefront. A supplier import can create thirty child
   * categories, and a launcher with thirty tiles is not a launcher.
   */
  const departments: QuickLink[] = categories
    .filter((category) => !category.parentSlug && !category.hidden)
    .slice(0, 5)
    .map((category) => ({
      href: `/category/${category.slug}`,
      label: category.name,
      icon: category.icon || "🛍️",
      from: category.art?.from ?? "#f4f0e8",
      to: category.art?.to ?? "#e8e1d3",
    }));

  const links = [...MERCHANDISING, ...departments, ...UTILITY];
  if (links.length === 0) return null;

  return (
    <nav
      aria-label="Shop by department"
      className="mx-auto max-w-7xl px-4 pt-6 sm:pt-8"
    >
      {/*
        Five across on a phone, exactly like the reference: ten links land
        as two clean rows. It widens to ten across on a large screen rather
        than growing the tiles, because a 96px circle on a desktop looks
        like a mistake.
      */}
      <ul className="grid grid-cols-5 gap-x-2 gap-y-5 sm:gap-x-4 lg:grid-cols-10">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group flex flex-col items-center gap-2 text-center"
            >
              <span
                className="relative flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-sm ring-1 ring-black/[0.04] transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-active:scale-95 sm:h-16 sm:w-16 sm:text-[1.75rem]"
                style={{
                  background: `linear-gradient(140deg, ${link.from}, ${link.to})`,
                }}
              >
                <span className="drop-shadow-[0_2px_3px_rgba(12,43,52,0.15)]">
                  {link.icon}
                </span>

                {link.flag && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-coral-500 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                    {link.flag}
                  </span>
                )}
              </span>

              {/*
                Two lines, then it clips. "Home & Living" has to be allowed
                to wrap or the row of ten develops one tall tile and every
                label below it stops lining up.
              */}
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-700 transition group-hover:text-ocean-700 sm:text-xs">
                {link.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
