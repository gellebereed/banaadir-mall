"use client";

import { useState } from "react";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { orders } from "@/lib/data/orders";
import { money, shortDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

/** The delivery journey shown as a timeline. */
const JOURNEY: { status: OrderStatus; icon: string; label: string; text: string }[] = [
  { status: "pending", icon: "🧾", label: "Order Placed", text: "We received your order" },
  { status: "processing", icon: "📦", label: "Processing", text: "The store is packing your items" },
  { status: "shipped", icon: "🚚", label: "On the Way", text: "Your order is with the courier" },
  { status: "delivered", icon: "🎉", label: "Delivered", text: "Enjoy your purchase!" },
];

const STATUS_INDEX: Record<OrderStatus, number> = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
};

export default function TrackPage() {
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    const found = orders.find(
      (o) => o.id.toLowerCase() === input.trim().toLowerCase(),
    );
    setOrder(found ?? null);
    setNotFound(!found);
  }

  const reached = order ? STATUS_INDEX[order.status] : -1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <span className="text-5xl">📦</span>
        <h1 className="mt-4 font-display text-3xl font-extrabold text-ocean-950">
          Track your order
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your order number (e.g.{" "}
          <button
            onClick={() => setInput(orders[0].id)}
            className="font-bold text-ocean-700 hover:underline"
          >
            {orders[0].id}
          </button>
          ) to see where it is.
        </p>
      </div>

      <form onSubmit={lookup} className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="BM-10287"
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0 !py-2.5">
          Track
        </button>
      </form>

      {notFound && (
        <p className="mt-4 rounded-xl bg-coral-100 px-4 py-3 text-sm font-semibold text-coral-700">
          We couldn&apos;t find that order. Double-check the number and try
          again.
        </p>
      )}

      {order && (
        <div className="card mt-8 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-4">
            <div>
              <p className="font-display text-lg font-extrabold text-ocean-950">
                {order.id}
              </p>
              <p className="text-xs text-slate-500">
                Placed {shortDate(order.date)} · Deliver to {order.city} ·{" "}
                {money(order.total)}
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {order.status === "cancelled" ? (
            <p className="mt-5 text-sm text-slate-500">
              This order was cancelled. If that doesn&apos;t look right,
              contact us via the Help page and we&apos;ll sort it out.
            </p>
          ) : (
            <ol className="mt-6 space-y-0">
              {JOURNEY.map((step, i) => {
                const done = i <= reached;
                const current = i === reached;
                return (
                  <li key={step.status} className="relative flex gap-4 pb-8 last:pb-0">
                    {/* connector line */}
                    {i < JOURNEY.length - 1 && (
                      <span
                        className={`absolute left-5 top-10 h-full w-0.5 ${
                          i < reached ? "bg-ocean-600" : "bg-sand-200"
                        }`}
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                        done
                          ? "bg-ocean-700 shadow-md shadow-ocean-700/30"
                          : "bg-sand-100"
                      }`}
                    >
                      {step.icon}
                    </span>
                    <div className={done ? "" : "opacity-40"}>
                      <p className="font-display font-bold text-ocean-950">
                        {step.label}
                        {current && (
                          <span className="ml-2 rounded-full bg-mango-100 px-2 py-0.5 text-[10px] font-bold text-mango-800">
                            Current
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">{step.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
