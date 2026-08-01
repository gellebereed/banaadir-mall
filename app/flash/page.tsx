import type { Metadata } from "next";
import Link from "next/link";
import CountdownTimer from "@/components/CountdownTimer";
import ProductCard from "@/components/ProductCard";
import { getFlashDeal, getFlashProducts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Flash Deals",
  description: "Limited-time offers across Banaadir Mall.",
};

// Reflects campaign edits from /admin/flash immediately.
export const dynamic = "force-dynamic";

/** The full flash-deal campaign — where "See all deals" leads. */
export default async function FlashPage() {
  const [flash, products] = await Promise.all([getFlashDeal(), getFlashProducts()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="rounded-3xl bg-gradient-to-r from-coral-500/15 via-mango-100 to-sand-100 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-ocean-950 sm:text-4xl">
              ⚡ {flash.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {products.length} limited-time offer{products.length === 1 ? "" : "s"} —
              when they&apos;re gone, they&apos;re gone.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 px-5 py-3">
            <CountdownTimer endsAt={flash.endsAt || undefined} />
          </div>
        </div>
      </div>

      {products.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="card mt-6 flex flex-col items-center gap-3 p-14 text-center">
          <span className="text-5xl">⚡</span>
          <p className="font-display text-lg font-bold text-ocean-950">
            No flash deals running right now
          </p>
          <p className="text-sm text-slate-500">
            Check back soon — new campaigns launch regularly.
          </p>
          <Link href="/products" className="btn-primary mt-2">
            Browse All Products
          </Link>
        </div>
      )}
    </div>
  );
}
