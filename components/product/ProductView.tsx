"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ProductImage from "@/components/ProductImage";
import Rating from "@/components/Rating";
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
        // The photo for the variant they actually chose.
        image: images[0],
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* ── Photos ─────────────────────────────────────────────────── */}
      <div>
        {images.length > 0 ? (
          <ZoomableImage
            src={images[Math.min(activeImage, images.length - 1)]}
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
      <div>
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

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {product.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
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
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [origin, setOrigin] = useState("50% 50%");
  const [zooming, setZooming] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  // Close the lightbox with Escape and stop the page scrolling behind it.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox]);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  return (
    <>
      <div
        onMouseEnter={() => setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMove}
        onClick={() => setLightbox(true)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/25"
          >
            ✕
          </button>
          <div className="relative h-full max-h-[85vh] w-full max-w-4xl">
            <Image src={src} alt={alt} fill sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </>
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
