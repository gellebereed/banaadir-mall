"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrderVendorSections from "@/components/account/OrderVendorSections";
import { getUserOrdersAction } from "@/app/actions";
import { money, shortDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

interface OrderItemExt {
  productId: string;
  name: string;
  price: number;
  qty: number;
  store?: string;
  /** The shop's display name, captured on the order. */
  storeName?: string;
  image?: string;
  selectedColor?: string;
  selectedSize?: string;
}

interface LocalOrderEntry {
  id: string;
  date: string;
  customer?: string;
  /**
   * Who placed it. This is what `matchesUser` prefers over the name: two
   * customers called "Ahmed" would otherwise see each other's orders, and
   * an order placed under a nickname would show up for nobody.
   */
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  total: number;
  status: OrderStatus;
  items: OrderItemExt[];
}

/**
 * Map a stored order line to what this screen renders.
 *
 * Orders now carry their own name, price and photo (see submitOrderAction),
 * so this only falls back for records written before that — where the best
 * available answer really is the product id and an averaged unit price.
 * Guessing was previously the ONLY path, which is why order history showed
 * lines like "Product classic-suit-msaj6r64".
 */
function orderLine(order: Order) {
  return (item: Order["items"][number]): OrderItemExt => ({
    productId: item.productId,
    name: item.name ?? `Product ${item.productId}`,
    price: item.price ?? order.total / Math.max(1, item.qty),
    qty: item.qty,
    store: item.store ?? order.store,
    storeName: item.storeName,
    image: item.image,
    selectedColor: item.selectedColor,
    selectedSize: item.selectedSize,
  });
}

function matchesUser(
  o: { customer?: string; email?: string },
  userName: string,
  userEmail: string,
): boolean {
  const cleanEmail = (userEmail || "").trim().toLowerCase();
  const cleanName = (userName || "").trim().toLowerCase();

  if (o.email && o.email.trim().toLowerCase() === cleanEmail) return true;
  if (o.customer && o.customer.trim().toLowerCase() === cleanName) return true;
  return false;
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

  useEffect(() => {
    async function loadMergedOrders() {
      setLoading(true);
      const mergedMap = new Map<string, LocalOrderEntry>();

      // 1. Load local storage orders (only those belonging to this user)
      try {
        const local: LocalOrderEntry[] = JSON.parse(
          localStorage.getItem("banaadir_user_orders") || "[]"
        );
        local
          .filter((o) => matchesUser(o, userName, userEmail))
          .forEach((o) => {
            if (o.id) mergedMap.set(o.id.toLowerCase(), o);
          });
      } catch {
        // Ignore storage read error
      }

      // 2. Load server orders passed from server (only those belonging to this user)
      serverOrders
        .filter((o) => matchesUser(o, userName, userEmail))
        .forEach((o) => {
          const baseId = o.id.split("-")[0] + "-" + (o.id.split("-")[1] || "");
          const existing = mergedMap.get(o.id.toLowerCase()) || mergedMap.get(baseId.toLowerCase());

          if (existing) {
            existing.status = o.status;
          } else {
            mergedMap.set(o.id.toLowerCase(), {
              id: o.id,
              date: o.date,
              customer: o.customer,
              email: o.email,
              phone: o.phone,
              city: o.city,
              address: o.address,
              total: o.total,
              status: o.status,
              items: (o.items || []).map(orderLine(o)),
            });
          }
        });

      // 3. Fetch any additional database orders for this user name or email
      try {
        const dbOrders = await getUserOrdersAction({ name: userName, email: userEmail });
        dbOrders
          .filter((o) => matchesUser(o, userName, userEmail))
          .forEach((o) => {
            const key = o.id.toLowerCase();
            if (!mergedMap.has(key)) {
              mergedMap.set(key, {
                id: o.id,
                date: o.date,
                customer: o.customer,
                email: o.email,
                phone: o.phone,
                city: o.city,
                address: o.address,
                total: o.total,
                status: o.status,
                items: (o.items || []).map(orderLine(o)),
              });
            }
          });
      } catch {
        // Ignore fetch errors
      }

      setOrders(Array.from(mergedMap.values()));
      setLoading(false);

      // Per-shop statuses used to be fetched once, here, and then never
      // again — so a parcel that shipped while the page was open kept
      // showing "Order Placed". Each card now subscribes to its own order
      // via OrderVendorSections, which keeps polling while you look at it.
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

            // Group items by vendor store / brand.
            // The key stays the slug so parcel statuses match up; the NAME
            // shown comes from the order line, which now carries it. Falling
            // back to "Banaadir Mall" for everything is what made a
            // four-item order from three shops look like one own-brand order.
            const groupedStores: Record<string, OrderItemExt[]> = {};
            order.items.forEach((item) => {
              const storeKey = item.store || "unknown-store";
              groupedStores[storeKey] = groupedStores[storeKey] || [];
              groupedStores[storeKey].push(item);
            });

            const storeLabel = (slug: string, items: OrderItemExt[]) =>
              items.find((i) => i.storeName)?.storeName ??
              (slug === "unknown-store" ? "Banaadir Mall" : slug.replace(/-/g, " "));

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

                {/* Per-shop breakdown, kept current by polling. */}
                <OrderVendorSections
                  orderId={order.id}
                  groups={storeEntries}
                  fallbackStatus={order.status}
                  storeLabel={storeLabel}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
