import type { OrderStatus } from "@/lib/types";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-sand-100 text-slate-600",
  processing: "bg-mango-100 text-mango-800",
  shipped: "bg-sky-100 text-sky-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-coral-100 text-coral-600",
};

/** Coloured pill for an order status — used in every orders table. */
export default function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
