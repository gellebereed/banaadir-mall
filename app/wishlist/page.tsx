"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { useCart } from "@/lib/cart-context";
import { getWishlistProductsAction } from "@/app/actions";
import type { Product } from "@/lib/types";

export default function WishlistPage() {
  const { wishlist } = useCart();
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWishlist() {
      if (wishlist.length === 0) {
        setSavedProducts([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const fetched = await getWishlistProductsAction(wishlist);
        setSavedProducts(fetched);
      } catch {
        setSavedProducts([]);
      }
      setLoading(false);
    }

    void loadWishlist();
  }, [wishlist]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center text-slate-400">
        <p className="animate-pulse font-semibold">🤍 Loading your saved products…</p>
      </div>
    );
  }

  if (savedProducts.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="text-7xl">🤍</span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ocean-950">
          Nothing saved yet
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Tap the heart on any product to keep it here for later.
        </p>
        <Link href="/products" className="btn-primary mt-6">
          Discover Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold text-ocean-950">
        My Wishlist{" "}
        <span className="text-lg font-semibold text-slate-400">
          ({savedProducts.length} item{savedProducts.length === 1 ? "" : "s"})
        </span>
      </h1>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {savedProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
