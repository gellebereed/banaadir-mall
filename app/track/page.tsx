"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { orders as demoOrders } from "@/lib/data/orders";
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

function TrackContent() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id") || "";

  const [input, setInput] = useState(queryId);
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  async function performLookup(searchId: string) {
    if (!searchId.trim()) return;
    setIsSearching(true);
    setNotFound(false);

    const cleanId = searchId.trim().toLowerCase();

    // 1. Check local storage user orders first
    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem("banaadir_user_orders") || "[]");
      const localFound = localOrders.find((o) => o.id.toLowerCase() === cleanId);
      if (localFound) {
        setOrder(localFound);
        setIsSearching(false);
        return;
      }
    } catch {
      // Ignore
    }

    // 2. Check demo/static orders
    const demoFound = demoOrders.find((o) => o.id.toLowerCase() === cleanId);
    if (demoFound) {
      setOrder(demoFound);
      setIsSearching(false);
      return;
    }

    // 3. Fallback to API lookup
    try {
      const { getOrder } = await import("@/lib/api");
      const fetched = await getOrder(cleanId);
      if (fetched) {
        setOrder(fetched);
        setIsSearching(false);
        return;
      }
    } catch {
      // Ignore
    }

    setOrder(null);
    setNotFound(true);
    setIsSearching(false);
  }

  useEffect(() => {
    if (queryId) {
      setInput(queryId);
      void performLookup(queryId);
    }
  }, [queryId]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLookup(input);
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
            type="button"
            onClick={() => {
              setInput("BM-10240");
              void performLookup("BM-10240");
            }}
            className="font-bold text-ocean-700 hover:underline"
          >
            BM-10240
          </button>
          ) to see where it is.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="BM-10287"
          className="input font-mono text-base font-semibold"
        />
        <button type="submit" disabled={isSearching} className="btn-primary shrink-0 !py-2.5 disabled:opacity-50">
          {isSearching ? "Searching…" : "Track Order"}
        </button>
      </form>

      {notFound && (
        <div className="mt-4 rounded-2xl border border-coral-200 bg-coral-50 p-4 text-sm font-semibold text-coral-800 animate-fade-up">
          ⚠️ We couldn&apos;t find order &ldquo;{input}&rdquo;. Please verify your order number and try again.
        </div>
      )}

      {order && (
        <div className="card mt-8 p-6 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-4">
            <div>
              <p className="font-display text-xl font-extrabold text-ocean-950">
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
                          ? "bg-ocean-700 text-white shadow-md shadow-ocean-700/30"
                          : "bg-sand-100 text-slate-400"
                      }`}
                    >
                      {step.icon}
                    </span>
                    <div className={done ? "" : "opacity-40"}>
                      <p className="font-display font-bold text-ocean-950">
                        {step.label}
                        {current && (
                          <span className="ml-2 rounded-full bg-mango-100 px-2.5 py-0.5 text-[10px] font-bold text-mango-900">
                            Current Status
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

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading order tracker…</div>}>
      <TrackContent />
    </Suspense>
  );
}
