import type { Metadata } from "next";
import OrderStatusSelect from "@/components/dashboard/OrderStatusSelect";
import { getOrders, getStores } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

const STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

/** Admin order management across the whole marketplace. */
export default async function AdminOrdersPage() {
  const [orders, stores] = await Promise.all([getOrders(), getStores()]);
  const storeName = (slug: string) =>
    stores.find((s) => s.slug === slug)?.name ?? slug;

  const countBy = (status: OrderStatus) =>
    orders.filter((o) => o.status === status).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        {orders.length} orders in the last 30 days
      </p>

      {/* Status summary chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <span
            key={s}
            className="rounded-full border border-sand-200 bg-white px-3.5 py-1.5 text-xs font-semibold capitalize text-slate-600"
          >
            {s}: <strong className="text-ocean-950">{countBy(s)}</strong>
          </span>
        ))}
      </div>

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Store</th>
              <th className="px-5 py-3">City</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                <td className="px-5 py-3.5 font-bold text-ocean-800">{o.id}</td>
                <td className="px-5 py-3.5 text-slate-600">{o.customer}</td>
                <td className="px-5 py-3.5 text-slate-500">{storeName(o.store)}</td>
                <td className="px-5 py-3.5 text-slate-500">{o.city}</td>
                <td className="px-5 py-3.5 text-slate-500">{shortDate(o.date)}</td>
                <td className="px-5 py-3.5 font-semibold">{money(o.total)}</td>
                <td className="px-5 py-3.5">
                  <OrderStatusSelect orderId={o.id} status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
