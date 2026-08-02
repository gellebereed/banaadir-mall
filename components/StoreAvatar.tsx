"use client";

import { useState } from "react";
import Image from "next/image";
import type { Store } from "@/lib/types";

/**
 * Store logo, falling back to the store's emoji or initial on its gradient.
 * Used anywhere a store is represented: product page, store cards,
 * dashboards and the admin control panel.
 */
export default function StoreAvatar({
  store,
  size = 64,
  className = "",
}: {
  store: Partial<Pick<Store, "logo" | "icon" | "name" | "art">>;
  /** Pixel size passed to next/image — match it to the CSS box. */
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const showImage = Boolean(store.logo) && !imgError;

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={
        showImage
          ? { backgroundColor: "#ffffff" }
          : { background: `linear-gradient(135deg, ${store.art?.from || "#172554"}, ${store.art?.to || "#b91c1c"})` }
      }
    >
      {showImage ? (
        <Image
          src={store.logo!}
          alt={store.name || "Store logo"}
          width={size}
          height={size}
          onError={() => setImgError(true)}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <span className="select-none font-bold text-white">
          {store.icon && store.icon.length <= 4 ? store.icon : store.name?.charAt(0).toUpperCase() || "🏪"}
        </span>
      )}
    </span>
  );
}
