"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { getBrandOrderStatusesAction, getUserOrdersAction } from "@/app/actions";
import { money, shortDate } from "@/lib/format";
import { SUPPORT_WHATSAPP } from "@/lib/whatsapp";
import type { Order, OrderStatus } from "@/lib/types";

interface OrderItemExt {
  productId: string;
  name: string;
  price: number;
  qty: number;
  store?: string;
  image?: string;
  selectedColor?: string;
  selectedSize?: string;
}

interface LocalOrderEntry {
  id: string;
  date: string;
  customer?: string;
  phone?: string;
  city?: string;
  address?: string;
  total: number;
  status: OrderStatus;
  items: OrderItemExt[];
}

export default function AccountOrdersClient({
  userName,
  userEmail,
  serverOrders = [],
}: {
  userName: string;
  userEmail: string;
  serverOrders?: Order[];
}) {
  const [orders, setOrders] = useState<LocalOrderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [brandStatuses, setBrandStatuses] = useState<
    Record<string, Record<string, { status: OrderStatus; store: string }>>
  >({});

  useEffect(() => {
    async function loadMergedOrders() {
      setLoading(true);
      const mergedMap = new Map<string, LocalOrderEntry>();

      // 1. Load local storage orders
      try {
        const local: LocalOrderEntry[] = JSON.parse(
          localStorage.getItem("banaadir_user_orders") || "[]"
        );
        local.forEach((o) => {
          if (o.id) mergedMap.set(o.id.toLowerCase(), o);
        });
      } catch {
        // Ignore storage read error
      }

      // 2. Load server orders passed from server
      serverOrders.forEach((o) => {
        const baseId = o.id.split("-")[0] + "-" + (o.id.split("-")[1] || "");
        const existing = mergedMap.get(o.id.toLowerCase()) || mergedMap.get(baseId.toLowerCase());

        if (existing) {
          existing.status = o.status;
        } else {
          mergedMap.set(o.id.toLowerCase(), {
            id: o.id,
            date: o.date,
            customer: o.customer,
            phone: o.phone,
            city: o.city,
            address: o.address,
            total: o.total,
            status: o.status,
            items: (o.items || []).map((i) => ({
              productId: i.productId,
              name: `Product ${i.productId}`,
              price: o.total / Math.max(1, i.qty),
              qty: i.qty,
              store: o.store,
            })),
          });
        }
      });

      // 3. Fetch any additional database orders for this user name or email
      try {
        const dbOrders = await getUserOrdersAction({ name: userName, email: userEmail });
        dbOrders.forEach((o) => {
          const key = o.id.toLowerCase();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              id: o.id,
              date: o.date,
              customer: o.customer,
              phone: o.phone,
              city: o.city,
              address: o.address,
              total: o.total,
              status: o.status,
              items: (o.items || []).map((i) => ({
                productId: i.productId,
                name: `Product ${i.productId}`,
                price: o.total / Math.max(1, i.qty),
                qty: i.qty,
                store: o.store,
              })),
            });
          }
        });
      } catch {
        // Ignore fetch errors
      }

      const orderList = Array.from(mergedMap.values());
      setOrders(orderList);
      setLoading(false);

      // Fetch per-brand live statuses for multi-brand orders
      orderList.forEach(async (ord) => {
        try {
          const brandStatusMap = await getBrandOrderStatusesAction(ord.id);
          if (Object.keys(brandStatusMap).length > 0) {
            setBrandStatuses((prev) => ({
              ...prev,
              [ord.id]: brandStatusMap,
            }));
          }
        } catch {
          // Ignore
        }
      });
    }

    void loadMergedOrders();
  }, [userName, userEmail, serverOrders]);

  const [statusTab, setStatusTab] = useState<string>("all");

  const filtered = orders.filter((o) => {
    if (statusTab === "delivered" && o.status !== "delivered") return false;
    if (statusTab === "active" && (o.status === "delivered" || o.status === "cancelled")) return false;
    if (statusTab === "cancelled" && o.status !== "cancelled") return false;

    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      (o.city && o.city.toLowerCase().includes(q)) ||
      o.items.some((i) => i.name.toLowerCase().includes(q) || (i.store && i.store.toLowerCase().includes(q)))
    );
  });

  if (loading) {
    return (
      <div className="card mt-6 p-8 text-center text-slate-400">
        <p className="animate-pulse">📦 Loading your orders…</p>
      </div>
    );
  }

  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const activeCount = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length;

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold text-ocean-950">
            My Orders ({orders.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track deliveries, contact sellers, and view purchase history.
          </p>
        </div>

        {orders.length > 0 && (
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search order #, item or store…"
            className="input sm:max-w-xs !py-1.5 text-xs"
          />
        )}
      </div>

      {/* Customer Status Tabs */}
      {orders.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-sand-100/70 p-1.5 border border-sand-200">
          <button
            type="button"
            onClick={() => setStatusTab("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
              statusTab === "all"
                ? "bg-white text-ocean-950 shadow-xs ring-1 ring-black/5"
                : "text-slate-600 hover:bg-white/50"
            }`}
          >
            All Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab("active")}
            className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
              statusTab === "active"
                ? "bg-white text-sky-900 shadow-xs ring-1 ring-black/5"
                : "text-slate-600 hover:bg-white/50"
            }`}
          >
            🚚 In Progress ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab("delivered")}
            className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
              statusTab === "delivered"
                ? "bg-emerald-500 text-white shadow-xs"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            ✓ Delivered ({deliveredCount})
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="card p-10 text-center animate-fade-up">
          <span className="text-4xl">🛍️</span>
          <p className="mt-2 font-display text-lg font-bold text-ocean-950">No orders placed yet</p>
          <p className="mt-1 text-xs text-slate-400">
            When you purchase items from Somalia&apos;s best stores, your orders &amp; brand delivery tracking will appear here.
          </p>
          <Link href="/products" className="btn-primary mt-4 inline-block">
            Start Shopping →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          No orders found matching your search or filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => {
            const isDelivered = order.status === "delivered";

            // Group items by vendor store / brand
            const groupedStores: Record<string, OrderItemExt[]> = {};
            order.items.forEach((item) => {
              const storeKey = item.store || "Banaadir Mall";
              groupedStores[storeKey] = groupedStores[storeKey] || [];
              groupedStores[storeKey].push(item);
            });

            const storeEntries = Object.entries(groupedStores);
            const isMultiVendor = storeEntries.length > 1;

            return (
              <div
                key={order.id}
                className={`card overflow-hidden border transition-all duration-200 ${
                  isDelivered
                    ? "border-emerald-300/80 bg-gradient-to-b from-emerald-50/30 to-white shadow-xs"
                    : "border-sand-200 shadow-xs hover:shadow-md"
                }`}
              >
                {/* Main Order Header */}
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 p-4 border-b ${
                    isDelivered
                      ? "bg-emerald-50/80 border-emerald-200/80"
                      : "bg-sand-50/80 border-sand-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-ocean-950 text-base">
                        Order #{order.id}
                      </span>
                      {isDelivered && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-2xs">
                          ✓ Completed
                        </span>
                      )}
                      {isMultiVendor && (
                        <span className="rounded-full bg-ocean-100 px-2 py-0.5 text-[10px] font-bold text-ocean-800">
                          {storeEntries.length} Stores
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Placed on {shortDate(order.date)} · Deliver to {order.city || "Mogadishu"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Total Paid</p>
                      <p className="font-display font-bold text-ocean-950 text-base">
                        {money(order.total)}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                    <Link
                      href={`/track?id=${order.id}`}
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      Track Order ↗
                    </Link>
                  </div>
                </div>

                {/* Per-Vendor Brand Status Breakdown */}
                <div className="divide-y divide-sand-100 p-4 space-y-4">
                  {storeEntries.map(([storeSlug, storeItems]) => {
                    const storeDisplayName = storeSlug
                      .replace(/-/g, " ")
                      .toUpperCase();
                    
                    // Brand status lookup from Supabase store sub-order
                    const liveBrandInfo = brandStatuses[order.id]?.[storeSlug];
                    const currentBrandStatus = liveBrandInfo?.status || order.status;

                    const vendorTotal = storeItems.reduce(
                      (acc, i) => acc + i.price * i.qty,
                      0
                    );

                    const waMsg = encodeURIComponent(
                      `Hello ${storeDisplayName}! 🛍️\n\nI am checking on my order *#${order.id}*.\nBrand Items:\n` +
                        storeItems.map((i) => `• ${i.name} (x${i.qty})`).join("\n") +
                        `\nTotal: $${vendorTotal.toFixed(2)}\n\nPlease provide delivery status. Thank you!`
                    );

                    return (
                      <div key={storeSlug} className="pt-3 first:pt-0">
                        {/* Brand Banner Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ocean-900 text-xs text-white font-bold">
                              🏪
                            </span>
                            <div>
                              <span className="font-display text-xs font-extrabold tracking-wide text-ocean-950">
                                {storeDisplayName}
                              </span>
                              <span className="ml-2 text-[10px] text-slate-400">
                                ({storeItems.length} item{storeItems.length === 1 ? "" : "s"})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <StatusBadge status={currentBrandStatus} />
                            <a
                              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${waMsg}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                            >
                              <span>💬 Contact Vendor</span>
                            </a>
                          </div>
                        </div>

                        {/* Brand Items */}
                        <div className="space-y-2 pl-2 sm:pl-9">
                          {storeItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt={item.name}
                                  width={40}
                                  height={40}
                                  className="h-10 w-10 rounded-lg object-cover border border-sand-200"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sand-100 text-lg">
                                  🛍️
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-slate-800">
                                  {item.name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  Qty: {item.qty}
                                  {item.selectedColor ? ` · ${item.selectedColor}` : ""}
                                  {item.selectedSize ? ` · ${item.selectedSize}` : ""}
                                </p>
                              </div>
                              <p className="font-display text-xs font-bold text-ocean-950">
                                {money(item.price * item.qty)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
