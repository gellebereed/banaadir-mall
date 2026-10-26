import SectionHeader from "@/components/SectionHeader";
import { shopDay } from "@/lib/campaign-utils";
import type { Campaign } from "@/lib/campaigns";
import { primaryImage } from "@/lib/product-utils";
import { parseShopTime } from "@/lib/shop-time";
import type { PromoTile } from "@/lib/types";
import CampaignCard, { type CardPhoto } from "./CampaignCard";

/** Words the cards need, in the shopper's language. English by default. */
export interface TileLabels {
  until: (date: string) => string;
  endsSoon: string;
  popular: string;
}

const ENGLISH: TileLabels = {
  until: (date) => `Until ${date}`,
  endsSoon: "⏰ Ends soon",
  popular: "🔥 Popular campaign",
};

/**
 * TODAY'S CAMPAIGNS — the strip of offers under the hero.
 *
 * Two kinds of card share it: the admin's own tiles (artwork and words
 * they chose, /admin/banners) first, then one for each campaign actually
 * running on the marketplace (lib/campaigns.ts), so the strip is never a
 * list of last month's offers and a shop's new sale shows up here the
 * moment it starts. Every card is a CampaignCard — products, the shop's
 * logo, its dates, the offer — so the strip reads as one designed thing.
 *
 * Three across on a computer; on a phone, one swipeable row with the next
 * card peeking in, which says "there is more" without a word. The admin's
 * preview renders this same component, so what they see is what shoppers
 * get.
 */
export default function CampaignTiles({
  title,
  subtitle,
  tiles,
  campaigns,
  labels = ENGLISH,
  bare = false,
  now = Date.now(),
}: {
  title: string;
  subtitle?: string;
  tiles: PromoTile[];
  campaigns: Campaign[];
  labels?: TileLabels;
  /** No section padding or header — for the admin's preview. */
  bare?: boolean;
  now?: number;
}) {
  if (tiles.length + campaigns.length === 0) return null;

  // The single strongest running offer gets the "popular" ribbon — one, so
  // it still means something.
  const popular = [...campaigns].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.products.length - a.products.length)[0]?.id;

  const cards = [
    ...tiles.map((tile) => (
      <CampaignCard
        key={tile.id}
        href={tile.link}
        from={tile.from}
        to={tile.to}
        headline={tile.label}
        sub={tile.sublabel}
        date={tile.endsAt ? labels.until(shopDay(tile.endsAt)) : undefined}
        photos={tile.image ? [{ kind: "image", src: tile.image }] : []}
      />
    )),
    ...campaigns.map((c) => {
      const endsSoon = c.endsAt ? parseShopTime(c.endsAt) - now < 48 * 3600_000 : false;
      return (
        <CampaignCard
          key={c.id}
          href={c.path}
          from={c.from}
          to={c.to}
          brand={c.store ? { logo: c.store.logo, name: c.store.name } : { logo: "/banaadir-bag.png", name: "Banaadir Mall" }}
          date={dateRange(c, labels)}
          headline={c.headline}
          sub={c.store ? c.name : c.kind === "sale" ? `${c.stores.length} shops · ${c.name}` : c.name}
          photos={photosOf(c)}
          ribbon={endsSoon ? labels.endsSoon : c.id === popular ? labels.popular : undefined}
        />
      );
    }),
  ];

  const grid = (
    <div className="rail-scroll -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
      {cards.map((card, i) => (
        <div key={i} className="w-[86%] shrink-0 snap-start sm:w-auto">
          {card}
        </div>
      ))}
    </div>
  );

  if (bare) return grid;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10">
      <SectionHeader title={title} subtitle={subtitle} />
      {grid}
    </section>
  );
}

/** Photos first, then the products' own artwork. */
function photosOf(c: Campaign): CardPhoto[] {
  return [...c.products]
    .sort((a, b) => Number(Boolean(primaryImage(b))) - Number(Boolean(primaryImage(a))))
    .slice(0, 2)
    .map((product) => ({ kind: "product", product }));
}

/** "26 Oct – 31 Oct" when both ends are known, "Until 31 Oct" otherwise. */
function dateRange(c: Campaign, labels: TileLabels): string | undefined {
  if (!c.endsAt) return undefined;
  const end = shopDay(c.endsAt);
  return c.startsAt ? `${shopDay(c.startsAt)} – ${end}` : labels.until(end);
}
