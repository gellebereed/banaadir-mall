import type { Metadata } from "next";
import AdminStoresClient from "@/components/dashboard/AdminStoresClient";
import { getAllStores, getVendorStats } from "@/lib/api";

export const metadata: Metadata = { title: "Stores Control Panel" };

// Always fetch fresh data so store status updates render immediately
export const dynamic = "force-dynamic";

export default async function AdminStoresPage() {
  const stores = await getAllStores();

  const pending = stores.filter((s) => s.status === "pending");
  const active = stores.filter((s) => s.status === "active");
  const inactive = stores.filter((s) => s.status === "rejected" || s.status === "suspended");

  const activeWithStats = await Promise.all(
    active.map(async (store) => ({
      store,
      stats: await getVendorStats(store.slug),
    }))
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Stores Directory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Control merchant stores, approve applications, and toggle official brand status.
          </p>
        </div>
      </div>

      <AdminStoresClient
        storesWithStats={activeWithStats}
        pendingStores={pending}
        inactiveStores={inactive}
      />
    </div>
  );
}
