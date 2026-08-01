import type { Metadata } from "next";
import Link from "next/link";
import StoreCard from "@/components/StoreCard";
import { getStores } from "@/lib/api";

export const metadata: Metadata = { title: "All Stores" };

// Rendered per request so admin approvals/suspensions show immediately.
export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const stores = await getStores();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ocean-950">
            Our Stores
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stores.length} trusted sellers from across Somalia
          </p>
        </div>
        <Link href="/sell" className="btn-primary !py-2.5 text-sm">
          + Open Your Store
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stores.map((s) => (
          <StoreCard key={s.slug} store={s} />
        ))}
      </div>
    </div>
  );
}
