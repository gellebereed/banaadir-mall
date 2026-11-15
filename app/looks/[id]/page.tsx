import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LookViewer from "@/components/looks/LookViewer";
import { getListedStores, getMarketplaceProducts, getPublicOffers, getRewardSettings } from "@/lib/api";
import { money } from "@/lib/format";
import { lookPath, lookView, type LookView } from "@/lib/look-utils";
import { getLook } from "@/lib/looks";
import { getT } from "@/lib/prefs-server";
import { inRewards } from "@/lib/rewards";
import { metaDescription, openGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<LookView | null> {
  const look = await getLook(decodeURIComponent(id));
  if (!look) return null;
  const [products, offers] = await Promise.all([getMarketplaceProducts(), getPublicOffers()]);
  return lookView(look, new Map(products.map((p) => [p.id, p])), offers);
}

/**
 * The link preview is what a shop's WhatsApp contacts see before they tap,
 * so it is the outfit photo itself — a plain file, not a generated image
 * route (see lib/seo.ts previewImages and the WhatsApp note there) — with
 * the price of the whole look in the title.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await load((await params).id);
  if (!view) return { title: "Look" };
  const { look } = view;
  const price = money(view.bundlePrice ?? view.total);
  const title = `${look.title} — the whole look ${price}`;
  const description = metaDescription(
    look.description,
    `${view.pieces.length} pieces on Banaadir Mall. Pick your sizes and add the whole outfit in one tap.`,
  );
  return {
    title: look.title,
    description,
    alternates: { canonical: lookPath(look) },
    openGraph: await openGraph({
      title,
      description,
      url: lookPath(look),
      images: [{ url: look.image, alt: look.title }],
    }),
    twitter: { card: "summary_large_image", title, description, images: [look.image] },
  };
}

export default async function LookPage({ params }: Props) {
  const view = await load((await params).id);
  if (!view) notFound();
  const [t, stores, rewards] = await Promise.all([getT(), getListedStores(), getRewardSettings()]);
  const storeNames = Object.fromEntries(stores.map((s) => [s.slug, s.name]));
  // The whole-look bonus, when the programme is on at the shops selling it.
  const rewardPct =
    (rewards.lookBonusPct ?? 0) > 0 && view.storeSlugs.some((s) => inRewards(rewards, s)) ? rewards.lookBonusPct! : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-4 md:pb-12">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href="/" className="hover:text-ocean-700">Home</Link>
        <span className="mx-1.5">›</span>
        <Link href="/looks" className="hover:text-ocean-700">{t("look.section")}</Link>
      </nav>
      <LookViewer
        look={{
          id: view.look.id,
          title: view.look.title,
          description: view.look.description,
          image: view.look.image,
          occasions: view.look.occasions,
        }}
        pieces={view.pieces}
        bundlePrice={view.bundlePrice}
        total={view.total}
        storeNames={storeNames}
        rewardPct={rewardPct}
      />
    </div>
  );
}
