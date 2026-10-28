"use client";

import { useState, useTransition } from "react";
import { setParcelPayment } from "@/app/actions";
import { kindInfo, unpaidTooLong, UNPAID_FLAG_HOURS } from "@/lib/shop-payments";
import type { Order } from "@/lib/types";

/**
 * Has this shop got the money for this parcel?
 *
 * Customers pay shops directly (lib/shop-payments.ts), so the seller's
 * mark is the only record of it — and it is what the customer's tracking
 * page shows. A parcel still unpaid after UNPAID_FLAG_HOURS is flagged
 * for the seller to chase or cancel; it is never cancelled for them,
 * because a shop that forgot to tick "paid" must not lose a paid order.
 */
export default function ParcelPayment({ order, mayManage }: { order: Order; mayManage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!order.paymentStatus) return null;

  const label = kindInfo(order.payment)?.label ?? order.payment ?? "";
  const paid = order.paymentStatus === "paid";
  const overdue = unpaidTooLong(order);

  const toggle = () =>
    start(async () => {
      setError(null);
      const result = await setParcelPayment(order.id, !paid);
      if (!result.ok) setError(result.message);
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            paid
              ? "bg-emerald-100 text-emerald-800"
              : order.paymentStatus === "on_delivery"
                ? "bg-sand-100 text-slate-700"
                : overdue
                  ? "bg-coral-100 text-coral-700"
                  : "bg-mango-100 text-mango-900"
          }`}
        >
          {paid ? "✓ Paid" : order.paymentStatus === "on_delivery" ? "💵 Cash on delivery" : "⏳ Awaiting payment"}
          {label && order.paymentStatus !== "on_delivery" && ` · ${label}`}
        </span>
        {mayManage && order.status !== "cancelled" && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-60 ${
              paid ? "text-slate-500 hover:text-coral-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {pending ? "Saving…" : paid ? "Undo" : order.paymentStatus === "on_delivery" ? "Cash collected" : "Mark paid"}
          </button>
        )}
      </div>
      {overdue && (
        <p className="text-[11px] font-semibold text-coral-700">
          Unpaid for over {UNPAID_FLAG_HOURS} hours — message the customer, or cancel it to put the stock back.
        </p>
      )}
      {error && <p className="text-[11px] font-semibold text-coral-600">{error}</p>}
    </div>
  );
}
