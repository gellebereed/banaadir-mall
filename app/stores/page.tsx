import type { Metadata } from "next";
import Link from "next/link";
import PublicStoresClient from "@/components/PublicStoresClient";
import { getListedStores } from "@/lib/api";

export const metadata: Metadata = {
  title: "All Stores & Official Brands | Banaadir Mall",
  description: "Browse official brand stores and verified local sellers across Mogadishu, Hargeisa, Kismayo and Somalia.",
};

// Rendered per request so admin approvals/suspensions show immediately.
export const dynamic = "force-dynamic";

export default async function StoresPage() {
  // The directory: active stores that want to be found here. A shop that
  // opted out still works at its own link — it just isn't advertised.
  const stores = await getListedStores();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ocean-950">
            Stores & Official Brands
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Explore {stores.length} official brand franchises and verified merchant stores on Banaadir Mall.
          </p>
        </div>
        <Link href="/sell" className="btn-primary !py-2.5 text-sm">
          + Open Your Store
        </Link>
      </div>

      <PublicStoresClient stores={stores} />
    </div>
  );
}
