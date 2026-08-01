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
  return (
    <span
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={
        store.logo
          ? undefined
          : { background: `linear-gradient(135deg, ${store.art.from}, ${store.art.to})` }
      }
    >
      {store.logo ? (
        <Image
          src={store.logo}
          alt={store.name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        store.icon
      )}
    </span>
  );
}
