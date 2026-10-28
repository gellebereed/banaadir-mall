import type { Metadata } from "next";
import MarkOrdersSeen from "@/components/dashboard/MarkOrdersSeen";
import VendorOrdersTable from "@/components/dashboard/VendorOrdersTable";
import { getAllProductsByStore, getOrdersByStore, getStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Orders" };

/** Seller order management: see every parcel, move it through fulfilment. */
export default async function VendorOrdersPage() {
  const { session, storeSlug } = await requireVendor();
  const [orders, store, products] = await Promise.all([
    getOrdersByStore(storeSlug),
    getStore(storeSlug),
    getAllProductsByStore(storeSlug),
  ]);
  const mayManage = may(session, "orders.manage");
  const savedCouriers = store?.couriers ?? [];

  // One catalogue lookup for every order — this used to look each order's
  // product up separately, re-reading the whole catalogue 48 times.
  const names = new Map(products.map((p) => [p.id, p.name]));
  const rows = orders.map((o) => ({
    ...o,
    items: o.items.map((i) => ({ ...i, name: i.name ?? names.get(i.productId) ?? i.productId })),
    productName: o.items[0]?.name ?? names.get(o.items[0]?.productId ?? "") ?? "—",
    qty: o.items.reduce((s, i) => s + i.qty, 0),
  }));

  // A parcel marked shipped with no driver on it is one the customer cannot
  // chase. New dispatches can't create that state, but older orders can
  // already be in it, so surface the count rather than let it sit quietly.
  const uncontactable = rows.filter(
    (o) => o.status === "shipped" && !o.delivery?.courier?.phone,
  );

  // Which parcels were new when this page was opened. Captured BEFORE
  // clearing them, so the seller still sees what arrived rather than the
  // badge silently vanishing and leaving them to guess.
  const newIds = new Set(rows.filter((o) => !o.seenAt).map((o) => o.id));

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        {orders.length} parcel{orders.length === 1 ? "" : "s"}. Update each one as you pack and hand it
        over — the customer sees it, and can call your driver.
      </p>

      {uncontactable.length > 0 && mayManage && (
        <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-800">
          🚚 <strong>{uncontactable.length}</strong> parcel
          {uncontactable.length === 1 ? " is" : "s are"} marked as on the way
          with no driver&apos;s number, so the customer has no way to chase
          {uncontactable.length === 1 ? " it" : " them"}. Add the driver below.
        </p>
      )}

      {!mayManage && (
        <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-800">
          👁️ Your account has view-only access to orders. Ask a manager for
          the <strong>orders</strong> role to make changes.
        </p>
      )}

      {/* Order table with search, status tabs and collapsible parcel manager */}
      <VendorOrdersTable
        rows={rows}
        newIds={[...newIds]}
        mayManage={mayManage}
        savedCouriers={savedCouriers}
        storeName={store?.name ?? storeSlug}
        paymentMethods={store?.paymentMethods ?? []}
      />

      {/* Opening this page IS reading them, so the badge clears — but only
          after render, so the "New" tags above stay visible this time
          round. Silently clearing without showing what arrived is how a
          seller ends up not knowing which order was the new one. */}
      {mayManage && newIds.size > 0 && <MarkOrdersSeen orderIds={[...newIds]} />}
    </div>
  );
}
