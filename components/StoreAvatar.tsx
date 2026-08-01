"use client";

import { useState } from "react";
import Image from "next/image";
import type { Store } from "@/lib/types";

/**
 * Store logo, falling back to the store's emoji on its gradient.
 * Used anywhere a store is represented: product page, store cards,
 * dashboards and the home page brand row.
 */
export default function StoreAvatar({
  store,
  size = 64,
  className = "",
}: {
  store: Pick<Store, "logo" | "icon" | "name" | "art">;
  /** Pixel size passed to next/image — match it to the CSS box. */
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const showImage =
    Boolean(store.logo) &&
    !imgError &&
    !store.logo?.startsWith("/api/uploads/") &&
    !store.logo?.includes("uspolo-logo") &&
    !store.logo?.includes("electronics-logo") &&
    !store.logo?.includes("perfume-logo");

  return (
    <span
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={
        showImage
          ? undefined
          : { background: `linear-gradient(135deg, ${store.art?.from || "#172554"}, ${store.art?.to || "#b91c1c"})` }
      }
    >
      {showImage ? (
        <Image
          src={store.logo!}
          alt=""
          width={size}
          height={size}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="select-none">{store.icon || "🏪"}</span>
      )}
    </span>
  );
}
