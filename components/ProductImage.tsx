import Image from "next/image";
import { primaryImage } from "@/lib/product-utils";
import type { Product } from "@/lib/types";

/**
 * Product artwork. Shows the uploaded photo when the seller has added one,
 * otherwise falls back to a generated gradient tile with the product icon
 * so the catalog never looks broken or empty.
 */
export default function ProductImage({
  product,
  iconClass = "text-6xl",
  className = "",
  /** Passed to next/image so the right size is served per layout. */
  sizes = "(max-width: 768px) 50vw, 25vw",
  priority = false,
}: {
  product: Pick<Product, "art" | "icon" | "name" | "images"> &
    Partial<Pick<Product, "variants" | "defaultVariantId">>;
  iconClass?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  // Prefer the default variant's photo so listings and dashboards agree.
  const photo = primaryImage(product as Product);

  if (photo) {
    return (
      <div className={`relative overflow-hidden bg-sand-100 ${className}`}>
        <Image
          src={photo}
          alt={product.name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  // No photo yet — render layered "studio" artwork instead of a flat tile:
  // a tinted backdrop, a soft dot texture, a spotlight and a grounded icon.
  return (
    <div
      role="img"
      aria-label={product.name}
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(150deg, ${product.art.from}, ${product.art.to})`,
      }}
    >
      {/* dot texture */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "12px 12px",
          color: "rgba(255,255,255,0.75)",
        }}
      />
      {/* corner sheen */}
      <div className="absolute -right-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-white/35 blur-2xl" />
      {/* spotlight pool behind the product */}
      <div className="absolute h-3/5 w-3/5 rounded-full bg-white/55 blur-xl" />
      {/* grounding shadow so the icon sits on a surface */}
      <div className="absolute bottom-[18%] h-[6%] w-2/5 rounded-[50%] bg-black/10 blur-md" />
      <span
        className={`relative -translate-y-[4%] select-none ${iconClass}`}
        style={{ filter: "drop-shadow(0 6px 10px rgba(15,23,42,0.18))" }}
      >
        {product.icon}
      </span>
    </div>
  );
}
