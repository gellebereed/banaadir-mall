"use client";

import { useState } from "react";
import ParcelDispatch from "@/components/dashboard/ParcelDispatch";
import ParcelPayment from "@/components/dashboard/ParcelPayment";
import { kindInfo, type ShopPaymentMethod } from "@/lib/shop-payments";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { telLink } from "@/lib/delivery";
import { money, shortDate } from "@/lib/format";
import { formatWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import type { Courier, Order } from "@/lib/types";

interface ExtendedOrderRow extends Order {
  productName: string;
  qty: number;
}

/** "To do" first: what a seller opens this page to act on. */
const TABS: { id: string; label: string; icon: string }[] = [
  { id: "todo", label: "To do", icon: "⏳" },
  { id: "all", label: "All", icon: "📋" },
  { id: "unpaid", label: "Awaiting payment", icon: "💳" },
  { id: "pending", label: "Order placed", icon: "🧾" },
  { id: "processing", label: "Being packed", icon: "📦" },
  { id: "shipped", label: "On the way", icon: "🚚" },
  { id: "delivered", label: "Delivered", icon: "✓" },
  { id: "cancelled", label: "Cancelled", icon: "✕" },
];

const isTodo = (o: Order) => o.status === "pending" || o.status === "processing";
const isUnpaid = (o: Order) => o.paymentStatus === "awaiting" && o.status !== "cancelled";

/**
 * The seller's parcels: a table on a computer, cards on a phone — where a
 * table with seven columns meant scrolling sideways to find out who the
 * customer was and what to do next.
 *
 * Every parcel shows ALL its items (with options and any offer), how to
 * reach the customer, the picking slip, and the status/driver control.
 */
export default function VendorOrdersTable({
  rows,
  newIds,
  mayManage,
  savedCouriers,
  storeName,
  paymentMethods,
}: {
  rows: ExtendedOrderRow[];
  newIds: string[];
  mayManage: boolean;
  savedCouriers: Courier[];
  storeName: string;
  /** This shop's saved numbers — the WhatsApp button asks for payment on them. */
  paymentMethods: ShopPaymentMethod[];
}) {
  const todoCount = rows.filter(isTodo).length;
  const [activeTab, setActiveTab] = useState<string>(todoCount > 0 ? "todo" : "all");
  const [searchQuery, setSearchQuery] = useState("");
  const newIdSet = new Set(newIds);

  const countFor = (id: string) =>
    id === "all"
      ? rows.length
      : id === "todo"
        ? todoCount
        : id === "unpaid"
          ? rows.filter(isUnpaid).length
          : rows.filter((r) => r.status === id).length;

  const filteredRows = rows.filter((r) => {
    if (activeTab === "todo" && !isTodo(r)) return false;
    if (activeTab === "unpaid" && !isUnpaid(r)) return false;
    if (!["all", "todo", "unpaid"].includes(activeTab) && r.status !== activeTab) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const digits = q.replace(/\D/g, "");
    return (
      r.id.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q) ||
      (digits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(digits)) ||
      r.items.some((i) => (i.name ?? "").toLowerCase().includes(q)) ||
      (r.city ?? "").toLowerCase().includes(q)
    );
  });

  /*
   * The first message to a customer who still has to pay says how: the
   * amount and the shop's number for the method they picked. That is the
   * "the shop contacts you" step, without the seller retyping a number
   * into every chat.
   */
  const greeting = (o: Order) => {
    const hello = `Hello ${o.customer.split(" ")[0]}, this is ${storeName} about your Banaadir Mall order ${o.id}.`;
    const method = paymentMethods.find((m) => m.kind === o.payment);
    if (o.paymentStatus !== "awaiting" || !method?.number) return hello;
    return (
      `${hello} Please send ${money(o.total)} by ${kindInfo(method.kind)?.label} to ${method.number}` +
      `${method.accountName ? ` (${method.accountName})` : ""}, then reply here. Thank you!`
    );
  };

  const contact = (o: Order) =>
    o.phone ? (
      <span className="flex flex-wrap gap-1.5">
        <a href={telLink(o.phone)} className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-bold text-ocean-800 hover:bg-sand-200">
          📞 {formatWhatsAppNumber(o.phone)}
        </a>
        <a
          href={whatsappLink(o.phone, greeting(o))}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
        >
          💬 WhatsApp
        </a>
      </span>
    ) : null;

  const itemList = (o: ExtendedOrderRow, compact = false) => (
    <ul className={compact ? "space-y-0.5" : "space-y-1"}>
      {o.items.map((i, n) => (
        <li key={n} className="text-xs text-slate-700">
          <strong className="text-ocean-950">{i.qty} ×</strong> {i.name}
          {(i.selectedColor || i.selectedSize) && (
            <span className="text-slate-400"> · {[i.selectedColor, i.selectedSize].filter(Boolean).join(" · ")}</span>
          )}
          {i.offer && <span className="font-semibold text-emerald-700"> · 🎁 {i.offer}</span>}
        </li>
      ))}
    </ul>
  );

  const control = (o: ExtendedOrderRow) => (
    <div className="space-y-2">
      <ParcelPayment order={o} mayManage={mayManage} />
      {mayManage ? (
        <ParcelDispatch order={o} savedCouriers={savedCouriers} />
      ) : (
        <div className="space-y-1">
          <StatusBadge status={o.status} />
          {o.delivery?.courier && (
            <p className="text-[11px] text-slate-500">
              🚚 {o.delivery.courier.name} · {formatWhatsAppNumber(o.delivery.courier.phone)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" className="rail-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${
                  active ? "bg-ocean-800 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
                }`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-sand-100 text-slate-500"}`}>
                  {countFor(tab.id)}
                </span>
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Order #, customer, phone, item, city…"
          aria-label="Search orders"
          className="input !py-2 text-sm lg:w-72"
        />
      </div>

      {filteredRows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          {activeTab === "todo"
            ? "🎉 Nothing waiting — every parcel is on its way or delivered."
            : activeTab === "unpaid"
              ? "🎉 Every parcel is paid for."
              : "No orders match."}
        </div>
      ) : (
        <>
          {/* ── Phone: one card per parcel ─────────────────────────── */}
          <div className="space-y-3 md:hidden">
            {filteredRows.map((o) => (
              <article key={o.id} className={`card p-4 ${newIdSet.has(o.id) ? "ring-2 ring-coral-300" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-mono text-sm font-bold text-ocean-950">
                      {o.id}
                      {newIdSet.has(o.id) && (
                        <span className="rounded-full bg-coral-500 px-1.5 py-0.5 font-sans text-[9px] font-extrabold uppercase text-white">New</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {shortDate(o.date)} · {o.city}
                    </p>
                  </div>
                  <p className="shrink-0 font-display text-lg font-extrabold text-ocean-950">{money(o.total)}</p>
                </div>

                <div className="mt-3 rounded-xl bg-sand-50 p-3">{itemList(o)}</div>

                <div className="mt-3">
                  <p className="text-sm font-semibold text-slate-800">{o.customer}</p>
                  {o.address && <p className="text-xs text-slate-500">{o.address}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {contact(o)}
                    <a
                      href={`/api/order-slip/${o.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-sand-200"
                    >
                      🧾 Slip
                    </a>
                  </div>
                </div>

                <div className="mt-3 border-t border-sand-100 pt-3">{control(o)}</div>
              </article>
            ))}
          </div>

          {/* ── Computer: the table ────────────────────────────────── */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-50/80 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="min-w-[280px] px-4 py-3">Status &amp; delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {filteredRows.map((o) => (
                    <tr key={o.id} className={`align-top transition-colors ${o.status === "delivered" ? "bg-emerald-50/20" : "hover:bg-sand-50/60"}`}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="flex items-center gap-1.5 font-mono font-bold text-ocean-900">
                          {o.id}
                          {newIdSet.has(o.id) && (
                            <span className="rounded-full bg-coral-500 px-1.5 py-0.5 font-sans text-[9px] font-extrabold uppercase text-white">New</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{shortDate(o.date)}</p>
                        <a href={`/api/order-slip/${o.id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-ocean-700 hover:underline">
                          🧾 Picking slip
                        </a>
                      </td>
                      <td className="max-w-[280px] px-4 py-3">{itemList(o, true)}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-800">{o.customer}</p>
                        <p className="text-[11px] text-slate-500">{o.address || o.city}</p>
                        <div className="mt-1">{contact(o)}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-ocean-950">{money(o.total)}</td>
                      <td className="px-4 py-3">{control(o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
