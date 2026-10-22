"use client";

import { usePrefs, useT } from "@/components/prefs/PrefsProvider";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ProductImage from "@/components/ProductImage";
import Rating from "@/components/Rating";
import ShareButton from "@/components/ShareButton";
import DeliveryPromise from "./DeliveryPromise";
import { offerHeadline, offerTerms } from "@/lib/offers";
import { useReco } from "@/components/reco/RecoProvider";
import { cartLineKey, useCart } from "@/lib/cart-context";
import { useRouter } from "next/navigation";
import { compact, discountPct, money } from "@/lib/format";
import {
  colorOptions,
  colorSwatch,
  defaultVariant,
  findVariant,
  hasVariants,
  sizeOptions,
  variantImages,
  variantPrice,
  variantStock,
} from "@/lib/product-utils";
import type { MarketingSettings, Product } from "@/lib/types";
import FlashEndsChip from "@/components/FlashEndsChip";

/**
 * The interactive half of the product page: zoomable photo gallery plus
 * the buy box. Both live in one component because selecting a variant
 * changes the price, the stock AND the photos shown.
 *
 * `children` is the server-rendered store card, passed straight through.
 */
export default function ProductView({
  product,
  details = [],
  delivery,
  children,
}: {
  product: Product;
  /** Standard attributes as rows (lib/taxonomy-attributes#describeAttributes). */
  details?: { name: string; value: string }[];
  /** Marketing → Delivery, for the promise under the buy buttons. */
  delivery?: MarketingSettings["delivery"];
  children?: ReactNode;
}) {
  const { addToCart, toggleWishlist, isWishlisted, lines } = useCart();
  const router = useRouter();
  const t = useT();

  const withVariants = hasVariants(product);

  /*
   * Colours carry their own swatch, because the seller may have picked the
   * exact hex on the variant (Variant.colorHex). Deriving the swatch from
   * the colour NAME here — which is what this did — threw that away, so
   * "Navy" always rendered as the dictionary's navy however carefully the
   * shade had been set in the dashboard.
   */
  const colours = useMemo(() => colorOptions(product), [product]);
  const colors = useMemo(() => colours.map((c) => c.color), [colours]);
  const swatchByColor = useMemo(
    () => new Map(colours.map((c) => [c.color, c.swatch])),
    [colours],
  );

  // Open on the seller's chosen default variant (falls back to the first
  // in-stock one) so the page matches the catalogue image.
  const preset = defaultVariant(product);
  const [color, setColor] = useState<string | undefined>(preset?.color ?? colors[0]);

  /*
   * Sizes belong to the SELECTED colour, not to the product. See
   * sizesForColor() for what showing all of them broke.
   */
  const sizeChoices = useMemo(
    () => (withVariants ? sizeOptions(product, color) : (product.sizes ?? []).map((size) => ({ size, inStock: product.stock > 0 }))),
    [product, color, withVariants],
  );
  const sizes = useMemo(() => sizeChoices.map((s) => s.size), [sizeChoices]);

  const [size, setSize] = useState<string | undefined>(preset?.size ?? sizes[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  /*
   * Keep the chosen size inside the chosen colour.
   *
   * Switching from a colour that comes in 54 to one that does not has to
   * land somewhere real — otherwise no variant matches and the page reports
   * a stocked product as out of stock. It prefers a size that is actually
   * buyable in the new colour, and only falls back to the first listed one
   * when the whole colour is sold out.
   */
  useEffect(() => {
    if (!withVariants || sizes.length === 0) return;
    if (size && sizes.includes(size)) return;
    setSize(sizeChoices.find((s) => s.inStock)?.size ?? sizes[0]);
  }, [sizes, sizeChoices, size, withVariants]);

  const variant = withVariants ? findVariant(product, color, size) : undefined;
  const images = useMemo(() => variantImages(product, variant), [product, variant]);
  const price = variantPrice(product, variant);
  const stock = variantStock(product, variant);

  // Variant switches change the photo set, so reset to its first image.
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => setActiveImage(0), [images]);
  useEffect(() => setQty(1), [variant?.id]);

  /**
   * Picking a colour or a size is the difference between browsing and
   * shopping: nobody chooses a size for something they are not considering
   * buying. It is weighted well above a page view in lib/reco/taste.ts.
   *
   * The first run is skipped because the component OPENS on the seller's
   * default variant — that is our choice, not the shopper's.
   */
  const { track } = useReco();
  const optionsUntouched = useRef(true);
  useEffect(() => {
    if (!withVariants) return;
    if (optionsUntouched.current) {
      optionsUntouched.current = false;
      return;
    }
    track("option", { id: product.id });
  }, [color, size, withVariants, product.id, track]);

  const wished = isWishlisted(product.id);
  const lowStock = stock > 0 && stock <= 15;
  const soldOut = withVariants ? stock === 0 : product.stock === 0;

  /*
   * On a phone the buy buttons sit below the photo, price, description and
   * options — off the first screen — and scroll away again while the
   * shopper reads reviews. Once they have scrolled PAST them, a slim bar
   * with the price and Add to Cart rides above the bottom navigation.
   */
  const actionsRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const node = actionsRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function handleAdd() {
    if (soldOut) return;
    addToCart({
      productId: product.id,
      qty,
      color,
      size,
      variantId: variant?.id,
      snapshot: {
        name: product.name,
        price,
        icon: product.icon,
        slug: product.slug,
        // Which shop sells it — without this the order is filed under no
        // store and never reaches the seller's dashboard.
        store: product.store,
        // The photo for the variant they actually chose.
        image: images[0],
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  /*
   * Buy Now goes to checkout. It used to open the cart — Add to Cart plus an
   * extra tap — which is not what anyone pressing "Buy Now" expects. A line
   * already in the basket (same size and colour) is not added a second time:
   * pressing Buy Now after Add to Cart must not quietly order two.
   */
  function handleBuyNow() {
    if (soldOut) return;
    const key = cartLineKey({ productId: product.id, variantId: variant?.id, color, size });
    if (!lines.some((l) => cartLineKey(l) === key)) handleAdd();
    router.push("/checkout");
  }

  /*
   * `min-w-0` on both columns below.
   *
   * A grid item defaults to `min-width: auto`, which means it refuses to
   * shrink below the intrinsic width of its content. The thumbnail rail is
   * as wide as all its thumbnails laid end to end, so on a 375px phone
   * this column measured 724px and dragged the whole page into sideways
   * scrolling — every section then rendered about twice the screen width,
   * which is what "stretched" was.
   */
  const features = [...new Set(product.features)];
  // The buy box shows the opening paragraph only; the rest is in Product details.
  const openingParagraph = (product.description ?? "").split(/\n\s*\n/)[0].replace(/^###\s+/, "");
  const longDescription = openingParagraph.length > 240 || openingParagraph.length < (product.description ?? "").trim().length;
  const hasDetails = Boolean(product.description) || features.length > 0 || details.length > 0;

  const thumbs = (vertical: boolean) =>
    images.map((src, i) => (
      <button
        key={src}
        onClick={() => setActiveImage(i)}
        aria-label={t("product.photo", { n: i + 1 })}
        aria-current={i === activeImage}
        className={`relative shrink-0 overflow-hidden rounded-xl border-2 transition ${vertical ? "aspect-square w-full" : "h-20 w-20"} ${
          i === activeImage ? "border-ocean-700" : "border-transparent hover:border-ocean-300"
        }`}
      >
        <Image src={src} alt="" fill sizes="80px" className="object-cover" />
      </button>
    ));

  return (
    <>
    <div className="grid gap-5 sm:gap-8 lg:grid-cols-2">
      {/* Sticky buy bar — phones only (the bottom nav is md:hidden too). */}
      <div
        aria-hidden={!showBar}
        className={`fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t border-sand-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-transform duration-200 md:hidden ${
          showBar ? "translate-y-0" : "pointer-events-none translate-y-[200%]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">
              {[color, size].filter(Boolean).join(" · ") || product.name}
            </p>
            <p className="font-display text-lg font-extrabold leading-tight text-ocean-950">{money(price)}</p>
          </div>
          <button
            type="button"
            tabIndex={showBar ? 0 : -1}
            onClick={handleAdd}
            disabled={soldOut}
            className="btn-primary shrink-0 whitespace-nowrap !px-5 !py-2.5 text-sm disabled:opacity-50"
          >
            {added ? "✓" : soldOut ? t("product.outOfStock") : t("product.addToCart")}
          </button>
        </div>
      </div>

      {/* ── Photos ─────────────────────────────────────────────────── */}
      {/* Gallery. Desktop: thumbnails down the left, so every photo is in
          the first screen beside the main one; phone: a row underneath. */}
      {/* Sticky on desktop: the photos stay beside the buy column as it scrolls. */}
      <div className="min-w-0 lg:sticky lg:top-36 lg:flex lg:items-start lg:gap-3 lg:self-start">
        {images.length > 1 && (
          <div className="rail-scroll hidden max-h-[min(36rem,calc(100vh-12rem))] w-20 shrink-0 flex-col gap-2.5 overflow-y-auto lg:flex">
            {thumbs(true)}
          </div>
        )}
        <div className="min-w-0 flex-1">
        {images.length > 0 ? (
          <ZoomableImage
            images={images}
            index={Math.min(activeImage, images.length - 1)}
            onIndexChange={setActiveImage}
            alt={product.name}
          />
        ) : (
          <ProductImage
            product={product}
            iconClass="text-[9rem]"
            className="aspect-square w-full rounded-3xl shadow-sm"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        )}

        {images.length > 1 && (
          <div className="rail-scroll mt-3 flex gap-3 overflow-x-auto pb-1 lg:hidden">{thumbs(false)}</div>
        )}
        </div>
      </div>

      {/* ── Details & buy box ──────────────────────────────────────── */}
      <div className="min-w-0">
        {product.badge && (
          <span className="mb-3 inline-block rounded-full bg-mango-100 px-3 py-1 text-xs font-bold text-mango-800">
            {product.badge}
          </span>
        )}
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
            {product.name}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={wished ? t("product.wishRemove") : t("product.wishAdd")}
              aria-pressed={wished}
              onClick={() =>
                toggleWishlist(product.id, {
                  name: product.name,
                  icon: product.icon,
                  images: images.length > 0 ? images : product.images,
                })
              }
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg transition ${
                wished
                  ? "border-coral-500 bg-coral-500 text-white"
                  : "border-sand-200 bg-white text-slate-500 hover:border-coral-500 hover:text-coral-500"
              }`}
            >
              {wished ? "♥" : "♡"}
            </button>
            <ShareButton
              path={`/product/${product.slug}`}
              title={product.name}
              text={`${product.name} — ${money(price)} on Banaadir Mall`}
              label={t("product.share")}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {product.reviewCount > 0 ? (
            <a href="#reviews" className="hover:underline">
              <Rating value={product.rating} count={product.reviewCount} />
            </a>
          ) : (
            <a href="#reviews" className="text-sm text-slate-400 hover:text-ocean-700 hover:underline">
              {t("product.noReviews")}
            </a>
          )}
          <span className="text-sm text-slate-400">{t("product.sold", { n: compact(product.sold) })}</span>
        </div>

        {/*
          The reference for the option currently selected — the variant's own
          code when it has one, else the product's. Customers quote this when
          they phone the store, so it must track the colour/size they are
          actually looking at rather than showing the template's code always.
        */}
        {(variant?.sku || product.internalReference) && (
          <p className="mt-1 font-mono text-xs text-slate-400">
            Ref: {variant?.sku || product.internalReference}
          </p>
        )}

        {/* Price reflects the selected variant. Wraps on a narrow phone
            rather than squeezing the "Save" pill against the edge. */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-4xl font-extrabold text-ocean-950">
            {money(price)}
          </span>
          {product.compareAt && product.compareAt > price && (
            <>
              <span className="text-lg text-slate-400 line-through">
                {money(product.compareAt)}
              </span>
              <span className="rounded-full bg-coral-100 px-2.5 py-1 text-xs font-bold text-coral-600">
                {t("product.save", { pct: discountPct(price, product.compareAt) })}
              </span>
            </>
          )}
        </div>

        {product.flashEndsAt && (
          <div className="mt-2">
            <FlashEndsChip endsAt={product.flashEndsAt} />
          </div>
        )}

        {/* The shop's cart offer, with the conditions spelled out. */}
        {product.offer && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-2xl" aria-hidden>🎁</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{t("offer.shopOffer")}</p>
              <p className="font-display text-base font-extrabold text-ocean-950">
                {offerHeadline(product.offer, t, money)}
              </p>
              {offerTerms(product.offer, t).length > 0 && (
                <p className="text-xs text-slate-600">{offerTerms(product.offer, t).join(" · ")}</p>
              )}
              {product.offer.kind === "bundle" ? (
                // The rest of the set, one tap each.
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {(product.offer.bundle ?? [])
                    .filter((b) => b.productId !== product.id)
                    .map((b) => (
                      <Link key={b.productId} href={`/product/${b.slug}`} className="text-xs font-bold text-emerald-800 hover:underline">
                        {b.name} →
                      </Link>
                    ))}
                </span>
              ) : product.offer.kind === "gift" && product.offer.gift ? (
                <Link
                  href={`/product/${product.offer.gift.slug}`}
                  className="mt-1 inline-block text-xs font-bold text-emerald-800 hover:underline"
                >
                  {product.offer.gift.name} →
                </Link>
              ) : (
                <Link
                  href={`/products?store=${product.store}`}
                  className="mt-1 inline-block text-xs font-bold text-emerald-800 hover:underline"
                >
                  {t("offer.shopItems")} →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* The opening of the description; the whole of it is under
            "Product details" below, where it has room. */}
        {product.description && (
          <div className="mt-4">
            <div className="line-clamp-4 [&>div]:mt-0">
              <FormattedDescription text={openingParagraph} />
            </div>
            {longDescription && (
              <a href="#details" className="mt-1 inline-block text-sm font-bold text-ocean-700 hover:underline">
                {t("product.readMore")}
              </a>
            )}
          </div>
        )}

        {/* Variant pickers */}
        <div className="mt-6 space-y-5">
          {colors.length > 0 && (
            <OptionPicker
              label={t("product.colour")}
              options={colours.map((c) => ({ value: c.color, inStock: c.inStock }))}
              value={color}
              onChange={setColor}
              swatchFor={(name) => swatchByColor.get(name) ?? colorSwatch(name)}
            />
          )}
          {sizes.length > 0 && (
            <OptionPicker
              label={t("product.size")}
              options={sizeChoices.map((s) => ({ value: s.size, inStock: s.inStock }))}
              value={size}
              onChange={setSize}
            />
          )}

          {/* Quantity + stock */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-full border border-sand-200 bg-white">
              <button
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-11 w-11 rounded-full text-lg font-bold text-slate-600 hover:bg-sand-100"
              >
                −
              </button>
              <span className="w-10 text-center font-display font-bold tabular-nums">{qty}</span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQty((q) => Math.min(Math.max(stock, 1), q + 1))}
                className="h-11 w-11 rounded-full text-lg font-bold text-slate-600 hover:bg-sand-100"
              >
                +
              </button>
            </div>
            <p
              className={`text-sm font-medium ${
                soldOut ? "text-slate-400" : lowStock ? "text-coral-600" : "text-emerald-600"
              }`}
            >
              {soldOut
                ? t("product.soldOutOption")
                : lowStock
                  ? t("product.lowStock", { n: stock })
                  : t("product.inStock", { n: stock })}
            </p>
          </div>

          {/* Actions */}
          <div ref={actionsRef} className="grid grid-cols-2 gap-3">
            <button
              onClick={handleAdd}
              disabled={soldOut}
              className="btn-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            >
              {added ? t("product.added") : soldOut ? t("product.soldOut") : t("product.addToCart")}
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={soldOut}
              className="btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("product.buyNow")}
            </button>
          </div>
        </div>

        {delivery && <DeliveryPromise delivery={delivery} subtotal={price * qty} />}

        {/* Store card (server-rendered) */}
        {children}

      </div>
    </div>

    {/* ── Product details: the full description, highlights and specs ──
        A section of its own, not the bottom of the buy column, so a long
        supplier description has room and the buy box stays short. */}
    {hasDetails && (
      <section id="details" className="mt-12 scroll-mt-40">
        <h2 className="font-display text-2xl font-bold text-ocean-950">{t("product.details")}</h2>
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {product.description && (
            <div className="card p-5 sm:p-6">
              <h3 className="font-display text-base font-bold text-ocean-950">{t("product.description")}</h3>
              <FormattedDescription text={product.description} />
            </div>
          )}
          <div className="space-y-6">
            {/* Supplier imports often repeat a feature line verbatim — de-duplicated above. */}
            {features.length > 0 && (
              <div className="card p-5 sm:p-6">
                <h3 className="font-display text-base font-bold text-ocean-950">{t("product.highlights")}</h3>
                <ul className="mt-3 space-y-2">
                  {features.map((f, i) => (
                    <li key={`${f}-${i}`} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-emerald-500">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {details.length > 0 && (
              <div className="card overflow-hidden">
                <h3 className="px-5 pt-5 font-display text-base font-bold text-ocean-950 sm:px-6">{t("product.specs")}</h3>
                <dl className="mt-3 divide-y divide-sand-100 text-sm">
                  {details.map((d) => (
                    <div key={d.name} className="flex gap-4 px-5 py-2.5 sm:px-6">
                      <dt className="w-2/5 shrink-0 text-slate-500">{d.name}</dt>
                      <dd className="font-semibold text-slate-800">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </section>
    )}
    </>
  );
}

/* ── Zoomable main image ────────────────────────────────────────────── */

/**
 * Hover to magnify on desktop (the cursor position drives the zoom
 * origin), click to open a full-screen lightbox that works on touch too.
 *
 * ── The inline frame CROPS; only the lightbox letterboxes ────────────────
 * A supplier's photo is whatever shape the supplier shot it in — fashion
 * comes portrait, kitchenware square — so a square frame can either crop
 * the difference or pad it. This was briefly switched to `object-contain`
 * to stop a portrait shot losing the top of the model's head, and that
 * cure was worse than the disease: a tall photo in a square frame becomes
 * a narrow strip between two broad white bars, and the product ends up
 * smaller and cheaper-looking on the page than the crop ever made it.
 *
 * So the frame crops, and the LIGHTBOX is where the whole photo is shown
 * uncropped — which is now one click away and properly navigable, rather
 * than the dead end it used to be.
 *
 * ── The lightbox is a gallery, not a single image ────────────────────────
 * It used to open the ONE photo you clicked, with a close button and
 * nothing else — so seeing the seven photos of a shirt meant closing it,
 * clicking the next thumbnail, and opening it again, seven times. It now
 * carries the whole set: arrows, arrow keys, a swipe on touch, a counter
 * and a thumbnail strip.
 */
function ZoomableImage({
  images,
  index,
  onIndexChange,
  alt,
}: {
  images: string[];
  index: number;
  onIndexChange: (next: number) => void;
  alt: string;
}) {
  const [origin, setOrigin] = useState("50% 50%");
  const [zooming, setZooming] = useState(false);
  // Light data mode: screen width at normal quality (the zoom gets softer).
  const { lite } = usePrefs();
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const src = images[index];
  const many = images.length > 1;

  // Wrap around: from the last photo, "next" returns to the first. A
  // gallery that dead-ends at both edges feels broken on a phone.
  const step = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndexChange],
  );

  // Escape closes; arrows move. Bound while the lightbox is open only, so
  // the keys still belong to the page the rest of the time.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox, step]);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  /** A horizontal drag of more than a thumb's width changes photo. */
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const delta = e.changedTouches[0].clientX - start;
    if (Math.abs(delta) > 50) step(delta < 0 ? 1 : -1);
  }

  return (
    <>
      <div
        onMouseEnter={() => setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMove}
        onClick={() => setLightbox(true)}
        onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
        className="group relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-3xl bg-sand-100 shadow-sm"
      >
        <Image
          src={src}
          alt={alt}
          fill
          /*
           * DOUBLE the layout size, because this image is magnified 2×.
           *
           * `sizes` tells next/image how wide the picture will be shown, and
           * it has no idea about the CSS transform below. Declaring the
           * layout width (50vw) meant a ~1280px file was fetched and then
           * blown up to fill ~2560px of screen — so the magnifier, the one
           * control whose entire job is showing fabric detail, was the
           * blurriest thing on the page. The 2 here is the scale(2) below.
           */
          sizes={lite ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 1024px) 150vw, 75vw"}
          quality={lite ? 75 : 90}
          priority
          className="object-cover transition-transform duration-200 ease-out"
          style={{
            transform: zooming ? "scale(2)" : "scale(1)",
            transformOrigin: origin,
          }}
        />

        {many && (
          <>
            <GalleryArrow
              side="left"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
            />
            <GalleryArrow
              side="right"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
            />
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}

        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
          🔍 Hover to zoom · click to expand
        </span>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/92 p-4"
        >
          <button
            aria-label="Close"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/25"
          >
            ✕
          </button>

          {many && (
            <span className="absolute left-4 top-6 text-sm font-semibold text-white/80">
              {index + 1} / {images.length}
            </span>
          )}

          {/* Stop the backdrop's close handler firing on the image itself. */}
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
            onTouchEnd={onTouchEnd}
            className="relative h-full max-h-[78vh] w-full max-w-4xl"
          >
            {/* The one view where the whole photo is shown at full size —
                worth the extra bytes that quality 90 costs. */}
            <Image
              src={src}
              alt={alt}
              fill
              sizes="100vw"
              quality={90}
              className="object-contain"
            />

            {many && (
              <>
                <GalleryArrow
                  side="left"
                  large
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                />
                <GalleryArrow
                  side="right"
                  large
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                />
              </>
            )}
          </div>

          {many && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1 rail-scroll"
            >
              {images.map((thumb, i) => (
                <button
                  key={thumb}
                  onClick={() => onIndexChange(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={i === index}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10 ring-2 transition ${
                    i === index ? "ring-white" : "ring-transparent hover:ring-white/40"
                  }`}
                >
                  <Image src={thumb} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The prev / next control, shared by the inline gallery and the lightbox. */
function GalleryArrow({
  side,
  large = false,
  onClick,
}: {
  side: "left" | "right";
  large?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full transition ${
        side === "left" ? "left-2" : "right-2"
      } ${
        large
          ? "h-12 w-12 bg-white/15 text-2xl text-white hover:bg-white/30"
          : "h-9 w-9 bg-white/85 text-lg text-ocean-950 opacity-0 shadow-md hover:bg-white group-hover:opacity-100"
      }`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

/* ── Option picker ──────────────────────────────────────────────────── */

/**
 * One row of choices.
 *
 * Every option here EXISTS — the caller has already filtered sizes down to
 * the ones the selected colour is made in. What varies is whether an option
 * can be bought today, and a sold-out one is shown struck through rather
 * than removed: a shopper who cannot find their size at all concludes the
 * shop never stocked it, which is a different and worse message than "not
 * right now".
 *
 * `swatchFor` rather than a boolean, so the seller's own hex reaches the
 * dot instead of the colour name being guessed at a second time.
 */
function OptionPicker({
  label,
  options,
  value,
  onChange,
  swatchFor,
}: {
  label: string;
  options: { value: string; inStock: boolean }[];
  value?: string;
  onChange: (v: string) => void;
  swatchFor?: (option: string) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">
        {label}: <span className="font-normal text-slate-500">{value}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const swatch = swatchFor?.(opt.value);
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              title={opt.inStock ? undefined : `${opt.value} — out of stock`}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm font-medium transition ${
                selected
                  ? "border-ocean-700 bg-ocean-700 text-white"
                  : opt.inStock
                    ? "border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
                    : "border-sand-200 bg-sand-50 text-slate-400 line-through decoration-slate-300"
              }`}
            >
              {swatch && (
                <span
                  className={`h-4 w-4 rounded-full shrink-0 border border-black/10 shadow-xs ${
                    selected ? "ring-2 ring-white/50" : ""
                  }`}
                  style={{ background: swatch }}
                />
              )}
              {opt.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormattedDescription({ text }: { text: string }) {
  if (!text) return null;

  // Split by double line breaks into paragraphs / sections. A "### Title"
  // line is its own block even when the paragraph follows on the next line
  // — otherwise the heading swallowed the whole paragraph in bold.
  const blocks = text
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed.startsWith("### ")) return [block];
      const [heading, ...rest] = trimmed.split("\n");
      return rest.join("\n").trim() ? [heading, rest.join("\n")] : [heading];
    });

  return (
    <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="font-display text-base font-bold text-ocean-950 mt-4 mb-1">
              {trimmed.replace(/^###\s+/, "")}
            </h3>
          );
        }
        if (trimmed.includes("\n") || trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("✓")) {
          const lines = trimmed.split("\n");
          return (
            <ul key={idx} className="space-y-1">
              {lines.map((line, lIdx) => {
                const cleanLine = line.replace(/^[•\-✓*]\s*/, "").trim();
                if (!cleanLine) return null;
                return (
                  <li key={lIdx} className="flex items-start gap-2">
                    <span className="text-ocean-600 font-bold">•</span>
                    <span>{formatInlineMarkdown(cleanLine)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }
        return <p key={idx}>{formatInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
