import Image from "next/image";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import SectionHeader from "@/components/SectionHeader";
import StoreAvatar from "@/components/StoreAvatar";
import { shopDay } from "@/lib/campaign-utils";
import type { Campaign } from "@/lib/campaigns";
import { primaryImage } from "@/lib/product-utils";
import type { PromoTile } from "@/lib/types";

/**
 * TODAY'S CAMPAIGNS — the strip of offers under the hero.
 *
 * Two kinds of tile share it: the admin's own (artwork and words they
 * chose, /admin/banners) first, then one for each campaign actually
 * running on the marketplace (lib/campaigns.ts), so the strip is never a
 * list of last month's offers and a shop's new sale shows up here the
 * moment it starts. The admin's preview renders this same component, so
 * what they see is what shoppers get.
 */
export default function CampaignTiles({
  title,
  subtitle,
  tiles,
  campaigns,
  bare = false,
}: {
  title: string;
  subtitle?: string;
  tiles: PromoTile[];
  campaigns: Campaign[];
  /** No section padding or header — for the admin's preview. */
  bare?: boolean;
}) {
  if (tiles.length + campaigns.length === 0) return null;

  const grid = (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.id}
          href={tile.link}
          className="group relative flex h-28 items-center gap-3 overflow-hidden rounded-2xl px-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          style={{ background: `linear-gradient(120deg, ${tile.from}, ${tile.to})` }}
        >
          {tile.image && <Image src={tile.image} alt="" fill sizes="300px" className="object-cover opacity-90" />}
          <div className="relative">
            <p className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">{tile.label}</p>
            <p className="text-xs font-semibold text-ocean-900/70">{tile.sublabel}</p>
          </div>
        </Link>
      ))}
      {campaigns.map((c) => (
        <CampaignTile key={c.id} campaign={c} />
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

function CampaignTile({ campaign: c }: { campaign: Campaign }) {
  const product = c.products.find((p) => primaryImage(p));
  const sub = [c.store?.name ?? c.name, c.endsAt ? `until ${shopDay(c.endsAt)}` : ""].filter(Boolean).join(" · ");
  return (
    <Link
      href={c.path}
      className="group relative flex h-28 items-center justify-between gap-2 overflow-hidden rounded-2xl pl-4 pr-3 text-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:pl-5"
      style={{ background: `linear-gradient(120deg, ${c.from}, ${c.to})` }}
    >
      <span aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="relative min-w-0">
        {c.store && (
          <StoreAvatar store={c.store} size={20} className="mb-1 h-5 w-5 rounded-md text-[10px] ring-1 ring-white/60" />
        )}
        <p className="line-clamp-2 font-display text-lg font-extrabold leading-tight drop-shadow-sm sm:text-2xl">
          {c.headline}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-white/85 sm:text-xs">{sub}</p>
      </div>
      {product && (
        <div className="relative hidden h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white shadow-md ring-2 ring-white/70 transition duration-300 group-hover:scale-105 sm:block">
          <ProductImage product={product} sizes="80px" iconClass="text-3xl" className="h-full w-full" />
        </div>
      )}
    </Link>
  );
}
