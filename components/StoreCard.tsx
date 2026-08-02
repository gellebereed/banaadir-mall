"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { compact } from "@/lib/format";
import type { Store } from "@/lib/types";
import Rating from "./Rating";
import StoreAvatar from "./StoreAvatar";

/** Store tile used on the home page spotlight and the /stores directory. */
export default function StoreCard({ store }: { store: Store }) {
  const [bannerError, setBannerError] = useState(false);

  const showBanner = Boolean(store.banner) && !bannerError;

  return (
    <Link
      href={`/store/${store.slug}`}
      className="card group block overflow-hidden transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ocean-900/10"
    >
      {/* Uploaded banner, or the store's gradient */}
      {showBanner ? (
        <div className="relative h-20">
          <Image
            src={store.banner!}
            alt=""
            fill
            sizes="400px"
            onError={() => setBannerError(true)}
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="h-20"
          style={{
            background: `linear-gradient(120deg, ${store.art?.from || "#0f172a"}, ${store.art?.to || "#64748b"})`,
          }}
        />
      )}
      <div className="-mt-8 px-4 pb-4">
        <StoreAvatar
          store={store}
          size={64}
          className="h-16 w-16 rounded-2xl border-4 border-white text-3xl shadow-md"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <h3 className="font-display font-bold text-ocean-950 group-hover:text-ocean-700">
            {store.name}
          </h3>
          {store.official ? (
            <span className="rounded-full bg-mango-100 px-2 py-0.5 text-[10px] font-bold text-mango-800">
              Official Brand
            </span>
          ) : (
            store.verified && (
              <span title="Verified store" className="text-ocean-500">
                ✔
              </span>
            )
          )}
        </div>
        <p className="text-xs text-slate-500">{store.tagline}</p>
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
          <Rating value={store.rating} />
          <span>
            📍 {store.city} · {compact(store.followers)} followers
          </span>
        </div>
      </div>
    </Link>
  );
}
