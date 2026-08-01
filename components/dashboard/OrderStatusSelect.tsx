"use client";

import { useTransition } from "react";
import { setOrderStatus } from "@/app/actions";
import type { OrderStatus } from "@/lib/types";

const STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

/**
 * Order status dropdown used in the admin and vendor order tables.
 * Changing it calls the setOrderStatus server action and the page
 * re-renders with the new state automatically.
 */
export default function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={`Status of order ${orderId}`}
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(() => setOrderStatus(orderId, e.target.value as OrderStatus))
      }
      className={`rounded-full border border-sand-200 bg-white px-2.5 py-1 text-xs font-bold capitalize text-slate-700 outline-none focus:border-ocean-500 ${
        pending ? "opacity-50" : ""
      }`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
