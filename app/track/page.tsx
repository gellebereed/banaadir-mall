"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ParcelCard from "@/components/track/ParcelCard";
import type { OrderParcel } from "@/app/actions";
import { sharedCourierGroups } from "@/lib/delivery";
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
  const [parcels, setParcels] = useState<OrderParcel[]>([]);
  const [brandStatuses, setBrandStatuses] = useState<
    Record<
      string,
      {
        status: OrderStatus;
        store: string;
        storeName: string;
        storeIcon: string;
        storeLogo?: string;
        orderId: string;
        total: number;
      }
    >
  >({});

  async function performLookup(searchId: string) {
    if (!searchId.trim()) return;
    setIsSearching(true);
    setNotFound(false);

    const cleanId = searchId.trim().toLowerCase();
    let foundOrder: Order | null = null;

    // 1. Check local storage user orders first
    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem("banaadir_user_orders") || "[]");
      const localFound = localOrders.find((o) => o.id.toLowerCase() === cleanId);
      if (localFound) {
        foundOrder = localFound;
      }
    } catch {
      // Ignore
    }

    // 2. Check demo/static orders
    if (!foundOrder) {
      const demoFound = demoOrders.find((o) => o.id.toLowerCase() === cleanId);
      if (demoFound) {
        foundOrder = demoFound;
      }
    }

    // 3. Fallback to Server Action lookup
    if (!foundOrder) {
      try {
        const { getOrderAction } = await import("@/app/actions");
        const fetched = await getOrderAction(cleanId);
        if (fetched) {
          foundOrder = fetched;
        }
      } catch {
        // Ignore
      }
    }

    if (foundOrder) {
      setOrder(foundOrder);
      setIsSearching(false);

      // The parcels themselves — each with its own courier, timeline and
      // estimate. This is the authoritative view; the localStorage copy
      // above only exists so the page works before the order syncs.
      try {
        const { getOrderParcelsAction, getBrandOrderStatusesAction } =
          await import("@/app/actions");
        const [fetchedParcels, statuses] = await Promise.all([
          getOrderParcelsAction(foundOrder.id),
          getBrandOrderStatusesAction(foundOrder.id),
        ]);
        setParcels(fetchedParcels);
        setBrandStatuses(statuses);
      } catch {
        // Ignore
      }
    } else {
      setOrder(null);
      setNotFound(true);
      setIsSearching(false);
    }
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

  /**
   * The parcels to show, one per store.
   *
   * Items are grouped by their own `store` when they carry one — that's the
   * case for the copy saved in this browser at checkout. An order fetched
   * from the server has items of just {productId, qty}, so grouping them
   * would collapse every parcel into one; there we build the list from the
   * per-parcel statuses instead, which always know their store.
   */
  const itemsWithStore = order?.items || [];
  const groupedStores: Record<string, typeof itemsWithStore> = {};
  for (const item of itemsWithStore) {
    if (!item.store) continue;
    groupedStores[item.store] = groupedStores[item.store] || [];
    groupedStores[item.store].push(item);
  }

  const storeEntries =
    Object.keys(groupedStores).length > 0
      ? Object.entries(groupedStores)
      : Object.keys(brandStatuses).map(
          (slug) => [slug, [] as typeof itemsWithStore] as const,
        );

  /**
   * Parcels sharing one driver, so the customer is told once instead of
   * being shown the same number three times and left to work out it's one
   * person making one trip.
   */
  const shared = sharedCourierGroups(
    parcels.map((p) => ({ order: p.order, storeName: p.storeName })),
  );
  const sharedWith = (storeSlug: string): string[] => {
    const group = shared.find((g) =>
      g.parcels.some((p) => p.order.store === storeSlug),
    );
    return group
      ? group.parcels.filter((p) => p.order.store !== storeSlug).map((p) => p.storeName)
      : [];
  };

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
        <div className="card mt-8 p-6 animate-fade-up space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-4">
            <div>
              <p className="font-display text-xl font-extrabold text-ocean-950">
                Order #{order.id}
              </p>
              <p className="text-xs text-slate-500">
                Placed {shortDate(order.date)} · Deliver to {order.city} ·{" "}
                {money(order.total)}
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* Timeline Journey */}
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

          {/* Per-Vendor Brand Status Breakdown */}
          {storeEntries.length > 0 && (
            <div className="border-t border-sand-200 pt-6">
              <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-slate-400 mb-1">
                {storeEntries.length > 1
                  ? `Your ${storeEntries.length} parcels`
                  : "Your parcel"}
              </h3>
              {storeEntries.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  Each store ships separately, so your parcels may arrive on
                  different days.
                </p>
              )}
              {/* Same driver across several parcels — say it once, at the
                  top, instead of repeating the number on each card. */}
              {shared.map((group) => (
                <p
                  key={group.courier.phone}
                  className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900"
                >
                  🚚 <strong>{group.courier.name}</strong> is bringing{" "}
                  {group.parcels.length} of your parcels together —{" "}
                  {group.parcels.map((p) => p.storeName).join(", ")}. One
                  delivery, one number to call.
                </p>
              ))}

              <div className="space-y-4">
                {/* The server's parcels carry courier, timeline and estimate.
                    Before an order syncs (or without Supabase) fall back to
                    the copy saved in this browser, which has the items but
                    no dispatch details yet. */}
                {parcels.length > 0
                  ? parcels.map((p, i) => (
                      <ParcelCard
                        key={p.order.id}
                        order={p.order}
                        storeName={p.storeName}
                        storeIcon={p.storeIcon}
                        storeLogo={p.storeLogo}
                        items={groupedStores[p.order.store] ?? p.order.items}
                        index={i + 1}
                        total={parcels.length}
                        sharedWith={sharedWith(p.order.store)}
                      />
                    ))
                  : storeEntries.map(([storeSlug, storeItems], i) => {
                      const brand = brandStatuses[storeSlug];
                      const storeName =
                        brand?.storeName ??
                        storeItems.find((it) => it.storeName)?.storeName ??
                        storeSlug.replace(/-/g, " ");
                      return (
                        <ParcelCard
                          key={storeSlug}
                          order={{
                            ...order,
                            id: brand?.orderId ?? order.id,
                            store: storeSlug,
                            status: brand?.status ?? order.status,
                          }}
                          storeName={storeName}
                          storeIcon={brand?.storeIcon}
                          storeLogo={brand?.storeLogo}
                          items={storeItems}
                          index={i + 1}
                          total={storeEntries.length}
                        />
                      );
                    })}
              </div>
            </div>
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
