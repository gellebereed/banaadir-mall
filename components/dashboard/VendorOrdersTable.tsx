"use client";

import { useState } from "react";
import ParcelDispatch from "@/components/dashboard/ParcelDispatch";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { formatWhatsAppNumber } from "@/lib/whatsapp";
import type { Courier, Order, OrderStatus } from "@/lib/types";

interface ExtendedOrderRow extends Order {
  productName: string;
  qty: number;
}

const TABS: { id: string; label: string; icon: string }[] = [
  { id: "all", label: "All Orders", icon: "📋" },
  { id: "pending", label: "Order Placed", icon: "🧾" },
  { id: "processing", label: "Being Packed", icon: "📦" },
  { id: "shipped", label: "On the Way", icon: "🚚" },
  { id: "delivered", label: "Delivered", icon: "✓" },
  { id: "cancelled", label: "Cancelled", icon: "✕" },
];

export default function VendorOrdersTable({
  rows,
  newIds,
  mayManage,
  savedCouriers,
}: {
  rows: ExtendedOrderRow[];
  newIds: string[];
  mayManage: boolean;
  savedCouriers: Courier[];
}) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const newIdSet = new Set(newIds);

  const countByStatus = (statusId: string) => {
    if (statusId === "all") return rows.length;
    return rows.filter((r) => r.status === statusId).length;
  };

  const filteredRows = rows.filter((r) => {
    // 1. Tab filter
    if (activeTab !== "all" && r.status !== activeTab) {
      return false;
    }
    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.city && r.city.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 mt-5">
      {/* Search and Status Filter Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-sand-100/70 p-1.5 border border-sand-200">
          {TABS.map((tab) => {
            const count = countByStatus(tab.id);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all ${
                  isActive
                    ? "bg-white text-ocean-950 shadow-sm ring-1 ring-black/5"
                    : "text-slate-600 hover:bg-white/60 hover:text-ocean-900"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive ? "bg-ocean-100 text-ocean-800" : "bg-sand-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative shrink-0 sm:w-64">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer, city..."
            className="input !py-1.5 text-xs pl-8"
          />
          <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden border border-sand-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50/80 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3 min-w-[280px]">Status &amp; Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <span className="text-2xl block mb-1">🔍</span>
                    No orders found matching your filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((o) => {
                  const isDelivered = o.status === "delivered";
                  return (
                    <tr
                      key={o.id}
                      className={`transition-colors align-middle ${
                        isDelivered
                          ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                          : "hover:bg-sand-50/60"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-ocean-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{o.id}</span>
                          {newIdSet.has(o.id) && (
                            <span className="rounded-full bg-coral-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-2xs">
                              New
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-xs font-semibold text-slate-700">
                        {o.productName} <span className="text-slate-400">×{o.qty}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {o.customer}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {o.city}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {shortDate(o.date)}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-ocean-950 whitespace-nowrap">
                        {money(o.total)}
                      </td>
                      <td className="px-4 py-3">
                        {mayManage ? (
                          <ParcelDispatch order={o} savedCouriers={savedCouriers} />
                        ) : (
                          <div className="space-y-1">
                            <StatusBadge status={o.status} />
                            {o.delivery?.courier && (
                              <p className="text-[11px] text-slate-500">
                                🚚 {o.delivery.courier.name} ·{" "}
                                {formatWhatsAppNumber(o.delivery.courier.phone)}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
