import type { Metadata } from "next";
import OrderStatusSelect from "@/components/dashboard/OrderStatusSelect";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { getAnyProduct, getOrdersByStore } from "@/lib/api";
import { can } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Orders" };

/** Seller order management: see every order, move it through fulfilment. */
export default async function VendorOrdersPage() {
  const { session, storeSlug } = await requireVendor();
  const orders = await getOrdersByStore(storeSlug);
  const mayManage = can(session, "orders");

  const rows = await Promise.all(
    orders.map(async (o) => ({
      ...o,
      productName: (await getAnyProduct(o.items[0].productId))?.name ?? "—",
      qty: o.items.reduce((s, i) => s + i.qty, 0),
    })),
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        {orders.length} orders in the last 30 days. Update the status as you
        pack and ship — customers see it on the tracking page.
      </p>

      {!mayManage && (
        <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-800">
          👁️ Your account has view-only access to orders. Ask a manager for
          the <strong>orders</strong> role to make changes.
        </p>
      )}

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">City</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                <td className="px-5 py-3.5 font-bold text-ocean-800">{o.id}</td>
                <td className="max-w-52 truncate px-5 py-3.5 text-slate-600">
                  {o.productName} ×{o.qty}
                </td>
                <td className="px-5 py-3.5 text-slate-600">{o.customer}</td>
                <td className="px-5 py-3.5 text-slate-500">{o.city}</td>
                <td className="px-5 py-3.5 text-slate-500">{shortDate(o.date)}</td>
                <td className="px-5 py-3.5 font-semibold">{money(o.total)}</td>
                <td className="px-5 py-3.5">
                  {mayManage ? (
                    <OrderStatusSelect orderId={o.id} status={o.status} />
                  ) : (
                    <StatusBadge status={o.status} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
