"use client";

import { useActionState, useState } from "react";
import { updateParcelDelivery, type SaveState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import { formatWhatsAppNumber } from "@/lib/whatsapp";
import type { Courier, Order, OrderStatus } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

const STATUSES: { value: OrderStatus; label: string; icon: string }[] = [
  { value: "pending", label: "Order Placed", icon: "🧾" },
  { value: "processing", label: "Being Packed", icon: "📦" },
  { value: "shipped", label: "On the Way", icon: "🚚" },
  { value: "delivered", label: "Delivered", icon: "✓" },
  { value: "cancelled", label: "Cancelled", icon: "✕" },
];

const SELECT_THEMES: Record<OrderStatus, string> = {
  pending: "bg-slate-50 text-slate-700 border-slate-200 focus:ring-slate-400",
  processing: "bg-amber-50/80 text-amber-900 border-amber-200/80 focus:ring-amber-400 font-bold",
  shipped: "bg-sky-50/80 text-sky-900 border-sky-200/80 focus:ring-sky-400 font-bold",
  delivered: "bg-emerald-50 text-emerald-900 border-emerald-300 focus:ring-emerald-500 font-extrabold",
  cancelled: "bg-rose-50 text-rose-800 border-rose-200 focus:ring-rose-400 font-bold",
};

/**
 * Sleek, compact parcel manager for vendor table rows.
 * Keeps table rows neat and scannable by default, expanding courier details on demand.
 */
export default function ParcelDispatch({
  order,
  savedCouriers,
}: {
  order: Order;
  savedCouriers: Courier[];
}) {
  const [state, formAction] = useActionState(
    async (_prev: SaveState, formData: FormData) => updateParcelDelivery(formData),
    INITIAL,
  );
  useRefreshOnSuccess(state);

  const [status, setStatus] = useState<OrderStatus>(order.status);
  const existing = order.delivery?.courier;
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ? formatWhatsAppNumber(existing.phone) : "");
  const [company, setCompany] = useState(existing?.company ?? "");
  const [isExpanded, setIsExpanded] = useState(false);

  const needsCourier = status === "shipped" || status === "delivered";

  function handleStatusChange(newStatus: OrderStatus) {
    setStatus(newStatus);
    // Automatically open courier drawer if switching to shipped/delivered without driver details
    if ((newStatus === "shipped" || newStatus === "delivered") && !name) {
      setIsExpanded(true);
    }
  }

  function useCourier(c: Courier) {
    setName(c.name);
    setPhone(formatWhatsAppNumber(c.phone));
    setCompany(c.company ?? "");
  }

  return (
    <form action={formAction} className="relative space-y-2">
      <input type="hidden" name="orderId" value={order.id} />

      {/* Main compact bar inside table cell */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            name="status"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
            className={`rounded-full border px-3 py-1.5 text-xs outline-none transition shadow-2xs ${SELECT_THEMES[status]}`}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value} className="bg-white text-slate-800 font-semibold py-1">
                {s.icon} {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Driver pill if set */}
        {existing?.name ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
            title="Click to edit driver details"
          >
            <span>🚚</span>
            <span className="max-w-28 truncate">{existing.name}</span>
            <span className="text-[10px] text-emerald-600">✏️</span>
          </button>
        ) : needsCourier ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
              isExpanded
                ? "border-ocean-300 bg-ocean-100 text-ocean-800"
                : "border-mango-300 bg-mango-50 text-mango-800 hover:bg-mango-100"
            }`}
          >
            <span>+ Add Driver</span>
          </button>
        ) : null}

        {/* Quick Submit button if only status changed or panel open */}
        {(!needsCourier || !isExpanded) && status !== order.status && (
          <SubmitButton className="rounded-full bg-ocean-700 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-ocean-800">
            Save
          </SubmitButton>
        )}

        {/* Expand / collapse trigger for courier form */}
        {needsCourier && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] font-semibold text-slate-400 hover:text-ocean-700 underline underline-offset-2 ml-auto"
          >
            {isExpanded ? "Collapse" : existing ? "Edit" : "Details"}
          </button>
        )}
      </div>

      {state.message && !isExpanded && (
        <p className={`text-[11px] font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}>
          {state.ok ? "✓ " : "⚠ "}{state.message}
        </p>
      )}

      {/* Collapsible Courier Details Drawer */}
      {isExpanded && (
        <div className="mt-2 rounded-xl border border-sand-200 bg-white p-3.5 shadow-lg ring-1 ring-black/5 animate-fade-up z-20">
          <div className="flex items-center justify-between border-b border-sand-100 pb-2 mb-2.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <span>🚚</span> Delivery &amp; Driver Details
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          {savedCouriers.length > 0 && (
            <div className="mb-2.5">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">Quick Select Saved Courier:</span>
              <div className="flex flex-wrap gap-1">
                {savedCouriers.map((c) => (
                  <button
                    key={c.phone}
                    type="button"
                    onClick={() => useCourier(c)}
                    className="rounded-full border border-sand-200 bg-sand-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 transition hover:border-ocean-400 hover:bg-ocean-50 hover:text-ocean-800"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="block">
              <span className="mb-0.5 block font-semibold text-slate-600 text-[11px]">
                Driver&apos;s Name
              </span>
              <input
                name="courierName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cabdi Xasan"
                className="input !py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block font-semibold text-slate-600 text-[11px]">
                Driver&apos;s Phone <span className="text-coral-600">*</span>
              </span>
              <input
                name="courierPhone"
                type="tel"
                required={needsCourier}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+252 61 333 4444"
                className="input !py-1 text-xs font-mono"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block font-semibold text-slate-600 text-[11px]">
                Company <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                name="courierCompany"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Own delivery / Rikaab"
                className="input !py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block font-semibold text-slate-600 text-[11px]">
                Expected Arrival <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                name="estimatedAt"
                type="date"
                defaultValue={order.delivery?.estimatedAt?.slice(0, 10) ?? ""}
                className="input !py-1 text-xs"
              />
            </label>
          </div>

          <label className="block mt-2">
            <span className="mb-0.5 block font-semibold text-slate-600 text-[11px]">
              Note for customer <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              name="note"
              defaultValue={order.delivery?.note ?? ""}
              placeholder="e.g. Driver will call before arrival"
              className="input !py-1 text-xs"
            />
          </label>

          <div className="mt-2.5 flex items-center justify-between border-t border-sand-100 pt-2">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <input
                type="checkbox"
                name="rememberCourier"
                defaultChecked
                className="h-3 w-3 accent-ocean-700"
              />
              Save driver for next time
            </label>

            <div className="flex items-center gap-2">
              <SubmitButton className="btn-primary !px-3 !py-1 text-xs">
                Update Parcel
              </SubmitButton>
            </div>
          </div>

          {state.message && (
            <p className={`mt-1.5 text-xs font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}>
              {state.ok ? "✓ " : "⚠ "}{state.message}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
