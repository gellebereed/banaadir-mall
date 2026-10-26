import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import type { Product } from "@/lib/types";

/**
 * ONE CAMPAIGN CARD — the "Today's Campaigns" format.
 *
 * Built after the campaign cards of the big marketplace apps (Trendyol's
 * above all), because the earlier tile — a gradient with a percentage on
 * it — read as a placeholder: no product, no brand, nothing to tell one
 * shop's sale from another's. What makes those cards work, and what this
 * copies:
 *
 *   • the PRODUCTS, large, in white frames — the thing actually on sale;
 *   • the BRAND, as its own logo in a white tab that hangs from the top
 *     edge, so a shopper scanning the strip finds the shops they know;
 *   • the DATES, in a small dark chip under the logo;
 *   • the OFFER, short and huge, on a single strong colour.
 *
 * No server imports: the admin's tile editor renders this same card as its
 * live preview, in the browser.
 */

export type CardPhoto =
  | { kind: "product"; product: Pick<Product, "art" | "icon" | "name" | "images"> & Partial<Pick<Product, "variants" | "defaultVariantId">> }
  | { kind: "image"; src: string };

export default function CampaignCard({
  href,
  from,
  to,
  brand,
  date,
  headline,
  sub,
  photos,
  ribbon,
  linkable = true,
}: {
  href: string;
  from: string;
  to: string;
  /** The tab at the top: a logo, or a name set as a wordmark. */
  brand?: { logo?: string; name: string };
  /** "26 Oct – 31 Oct", "Until 31 Oct". */
  date?: string;
  headline: string;
  sub?: string;
  /** Up to two; the card adapts to one or none. */
  photos: CardPhoto[];
  /** A strip along the bottom of the offer panel: "🔥 Popular campaign". */
  ribbon?: string;
  /** False in the admin preview, where a click must not navigate away. */
  linkable?: boolean;
}) {
  // The words sit on the right of a 135° gradient — on `to`.
  const light = isLight(to);
  const ink = light ? "text-ocean-950" : "text-white";
  const shown = photos.slice(0, 2);

  const body = (
    <div
      className="relative flex h-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {/* Products */}
      {shown.length > 0 && (
        <div className="flex shrink-0 gap-2 p-2.5 @min-[23rem]:gap-2.5 @min-[23rem]:p-3">
          {shown.map((photo, i) => (
            <div
              key={i}
              className={`relative aspect-[4/5] h-full overflow-hidden rounded-xl bg-white ring-[3px] ring-white/90 ${
                // Two photos only where the card is wide enough to keep
                // the offer readable beside them (a container query: the
                // card is narrow on phones AND in a three-across row).
                i === 1 ? "hidden @min-[28rem]:block" : ""
              }`}
            >
              {photo.kind === "product" ? (
                <ProductImage
                  product={photo.product}
                  sizes="(max-width: 640px) 30vw, 140px"
                  iconClass="text-4xl"
                  className="h-full w-full transition duration-500 group-hover:scale-105"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- admin artwork and local previews
                <img src={photo.src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Offer */}
      <div className={`relative flex min-w-0 flex-1 flex-col items-center px-3 text-center ${ink}`}>
        {brand && (
          <div className="flex flex-col items-center">
            <div className="flex h-11 min-w-[6rem] max-w-full items-center justify-center rounded-b-lg bg-white px-3 shadow-sm @min-[24rem]:h-12 @min-[24rem]:min-w-[7rem]">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- store logos come from many hosts
                <img src={brand.logo} alt={brand.name} className="max-h-7 max-w-[6.5rem] object-contain @min-[24rem]:max-h-9" />
              ) : (
                <span className="truncate font-display text-base font-extrabold tracking-tight text-ocean-950 sm:text-lg">
                  {brand.name}
                </span>
              )}
            </div>
            {date && (
              <span className="-mt-px rounded-b-md bg-black/45 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm sm:text-[11px]">
                {date}
              </span>
            )}
          </div>
        )}
        {!brand && date && (
          <span className="mt-3 rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-bold text-white sm:text-[11px]">{date}</span>
        )}

        <div className="flex flex-1 flex-col items-center justify-center py-3">
          <p
            className={`line-clamp-3 font-display text-[1.35rem] font-extrabold leading-[1.05] tracking-tight @min-[24rem]:text-[1.7rem] ${
              light ? "" : "drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
            }`}
          >
            {headline}
          </p>
          {sub && (
            <p className={`mt-1 line-clamp-2 text-[11px] font-semibold @min-[24rem]:text-sm ${light ? "text-ocean-900/75" : "text-white/90"}`}>
              {sub}
            </p>
          )}
        </div>

        {ribbon && (
          <span className="mb-2.5 inline-flex whitespace-nowrap rounded-md bg-mango-300 px-2 py-0.5 text-[10px] font-extrabold text-ocean-950 shadow-sm @min-[24rem]:text-[11px]">
            {ribbon}
          </span>
        )}
      </div>
    </div>
  );

  // About 2 : 1 — a little taller than the reference apps, so a long
  // offer ("Buy 1, get 40% off the next") and its subtitle never crowd.
  const frame = "@container group block aspect-[2/1]";
  return linkable ? (
    <Link href={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

/**
 * Whether white words would be hard to read on this colour. Admin tiles
 * are often pastel ("#ffe4e6"), shop colours rarely are — and a light-blue
 * card with white text on it is the kind of thing that makes a page look
 * unfinished.
 */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}
