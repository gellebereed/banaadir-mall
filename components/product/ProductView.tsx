"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ProductImage from "@/components/ProductImage";
import Rating from "@/components/Rating";
import { useReco } from "@/components/reco/RecoProvider";
import { useCart } from "@/lib/cart-context";
import { compact, discountPct, money } from "@/lib/format";
import {
  colorSwatch,
  defaultVariant,
  findVariant,
  hasVariants,
  variantColors,
  variantImages,
  variantPrice,
  variantSizes,
  variantStock,
} from "@/lib/product-utils";
import type { Product } from "@/lib/types";

/**
 * The interactive half of the product page: zoomable photo gallery plus
 * the buy box. Both live in one component because selecting a variant
 * changes the price, the stock AND the photos shown.
 *
 * `children` is the server-rendered store card, passed straight through.
 */
export default function ProductView({
  product,
  children,
}: {
  product: Product;
  children?: ReactNode;
}) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();

  const colors = variantColors(product);
  const sizes = variantSizes(product);
  const withVariants = hasVariants(product);

  // Open on the seller's chosen default variant (falls back to the first
  // in-stock one) so the page matches the catalogue image.
  const preset = defaultVariant(product);
  const [color, setColor] = useState<string | undefined>(preset?.color ?? colors[0]);
  const [size, setSize] = useState<string | undefined>(preset?.size ?? sizes[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

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
   * `min-w-0` on both columns below.
   *
   * A grid item defaults to `min-width: auto`, which means it refuses to
   * shrink below the intrinsic width of its content. The thumbnail rail is
   * as wide as all its thumbnails laid end to end, so on a 375px phone
   * this column measured 724px and dragged the whole page into sideways
   * scrolling — every section then rendered about twice the screen width,
   * which is what "stretched" was.
   */
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ── Photos ─────────────────────────────────────────────────── */}
      <div className="min-w-0">
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
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 rail-scroll">
            {images.map((src, i) => (
              <button
                key={src}
                onClick={() => setActiveImage(i)}
                aria-label={`View photo ${i + 1}`}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  i === activeImage
                    ? "border-ocean-700"
                    : "border-transparent hover:border-ocean-300"
                }`}
              >
                <Image src={src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Details & buy box ──────────────────────────────────────── */}
      <div className="min-w-0">
        {product.badge && (
          <span className="mb-3 inline-block rounded-full bg-mango-100 px-3 py-1 text-xs font-bold text-mango-800">
            {product.badge}
          </span>
        )}
        <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
          {product.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Rating value={product.rating} count={product.reviewCount} />
          <span className="text-sm text-slate-400">{compact(product.sold)} sold</span>
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

        {/* Price reflects the selected variant */}
        <div className="mt-4 flex items-baseline gap-3">
          <span className="font-display text-4xl font-extrabold text-ocean-950">
            {money(price)}
          </span>
          {product.compareAt && product.compareAt > price && (
            <>
              <span className="text-lg text-slate-400 line-through">
                {money(product.compareAt)}
              </span>
              <span className="rounded-full bg-coral-100 px-2.5 py-1 text-xs font-bold text-coral-600">
                Save {discountPct(price, product.compareAt)}%
              </span>
            </>
          )}
        </div>

        <FormattedDescription text={product.description} />

        {/* Variant pickers */}
        <div className="mt-6 space-y-5">
          {colors.length > 0 && (
            <OptionPicker
              label="Colour"
              options={colors}
              value={color}
              onChange={setColor}
              swatches
            />
          )}
          {sizes.length > 0 && (
            <OptionPicker label="Size" options={sizes} value={size} onChange={setSize} />
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
                ? "Out of stock in this option"
                : lowStock
                  ? `🔥 Only ${stock} left — order soon`
                  : `✓ In stock (${stock} available)`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAdd}
              disabled={soldOut}
              className="btn-primary min-w-44 flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {added ? "✓ Added to Cart" : soldOut ? "Out of Stock" : "Add to Cart"}
            </button>
            <Link
              href="/cart"
              onClick={handleAdd}
              className={`btn-secondary flex-1 ${soldOut ? "pointer-events-none opacity-50" : ""}`}
            >
              Buy Now
            </Link>
            <button
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
              onClick={() =>
                toggleWishlist(product.id, {
                  name: product.name,
                  icon: product.icon,
                  images: images.length > 0 ? images : product.images,
                })
              }
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl transition ${
                wished
                  ? "border-coral-500 bg-coral-500 text-white"
                  : "border-sand-200 bg-white text-slate-400 hover:border-coral-500 hover:text-coral-500"
              }`}
            >
              {wished ? "♥" : "♡"}
            </button>
          </div>
        </div>

        {/* Store card (server-rendered) */}
        {children}

        {/*
          Supplier imports quite often repeat a feature line verbatim, and
          keying on the text made React warn about duplicate keys and drop
          one of them. De-duplicated instead: a bullet listed twice is not
          worth rendering twice either.
        */}
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {[...new Set(product.features)].map((f, i) => (
            <li key={`${f}-${i}`} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-emerald-500">✓</span> {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
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
          sizes="(max-width: 1024px) 100vw, 50vw"
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
            <Image src={src} alt={alt} fill sizes="100vw" className="object-contain" />

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

function OptionPicker({
  label,
  options,
  value,
  onChange,
  swatches = false,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  swatches?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">
        {label}: <span className="font-normal text-slate-500">{value}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const swatch = swatches ? colorSwatch(opt) : undefined;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm font-medium transition ${
                value === opt
                  ? "border-ocean-700 bg-ocean-700 text-white"
                  : "border-sand-200 bg-white text-slate-600 hover:border-ocean-400"
              }`}
            >
              {swatch && (
                <span
                  className={`h-4 w-4 rounded-full shrink-0 border border-black/10 shadow-xs ${
                    value === opt ? "ring-2 ring-white/50" : ""
                  }`}
                  style={{ background: swatch }}
                />
              )}
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormattedDescription({ text }: { text: string }) {
  if (!text) return null;

  // Split by double line breaks into paragraphs / sections
  const blocks = text.split(/\n\s*\n/);

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
