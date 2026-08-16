import type { Metadata } from "next";
import PantryClient from "@/components/pos/PantryClient";
import { getSupplies, getSupplyPurchases } from "@/lib/api";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Pantry" };

/**
 * What the kitchen bought, what is left, and what it cost.
 *
 * The screen a shop touches most often — a delivery arrives, somebody types
 * two numbers. Everything downstream (what a tray costs, what to charge,
 * how many more trays are possible) is derived from what happens here, so
 * it is worth the two numbers being as easy as they can possibly be.
 */
export default async function PantryPage() {
  const { storeSlug } = await requireVendor();

  const [supplies, purchases] = await Promise.all([
    getSupplies(storeSlug),
    getSupplyPurchases(storeSlug),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-extrabold text-ocean-950">Pantry</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything you buy, and what it costs you per unit.
        </p>
      </div>

      <PantryClient supplies={supplies} purchases={purchases} />
    </div>
  );
}
