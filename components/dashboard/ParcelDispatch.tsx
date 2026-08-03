"use client";

import { useActionState, useState } from "react";
import { updateParcelDelivery, type SaveState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import { formatWhatsAppNumber } from "@/lib/whatsapp";
import type { Courier, Order, OrderStatus } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

const STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "🧾 Order placed" },
  { value: "processing", label: "📦 Being packed" },
  { value: "shipped", label: "🚚 On the way" },
  { value: "delivered", label: "🎉 Delivered" },
  { value: "cancelled", label: "✕ Cancelled" },
];

/**
 * Dispatch one parcel: move it through fulfilment and say who is carrying it.
 *
 * The driver's number is what the customer calls when a parcel is late, so
 * marking a parcel "on the way" without one is refused by the server. This
 * form makes that impossible to do by accident: choosing "On the way"
 * reveals the courier fields and marks the phone required.
 *
 * Saved drivers appear as one-tap buttons. Re-typing a name and number on
 * every order is the step that gets skipped in a busy shop.
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

  // Courier details only matter once a parcel is actually moving. Showing
  // them for an order that hasn't been packed is noise.
  const needsCourier = status === "shipped" || status === "delivered";

  function useCourier(c: Courier) {
    setName(c.name);
    setPhone(formatWhatsAppNumber(c.phone));
    setCompany(c.company ?? "");
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={order.id} />

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-500">Parcel status</span>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
          className="input !py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>

      {needsCourier && (
        <div className="space-y-3 rounded-2xl border border-sand-200 bg-sand-50/60 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            🚚 Who is delivering this parcel
          </p>

          {savedCouriers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {savedCouriers.map((c) => (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => useCourier(c)}
                  className="rounded-full border border-sand-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-ocean-400 hover:text-ocean-700"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                Driver&apos;s name
              </span>
              <input
                name="courierName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cabdi Xasan"
                className="input !py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                Driver&apos;s phone <span className="text-coral-600">*</span>
              </span>
              <input
                name="courierPhone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+252 61 333 4444"
                className="input !py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                Company <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                name="courierCompany"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Own delivery / Banaadir Express"
                className="input !py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                Expected arrival <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                name="estimatedAt"
                type="date"
                defaultValue={order.delivery?.estimatedAt?.slice(0, 10) ?? ""}
                className="input !py-1.5 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">
              Note for the customer <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              name="note"
              defaultValue={order.delivery?.note ?? ""}
              placeholder="e.g. Driver will call before arriving"
              className="input !py-1.5 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              name="rememberCourier"
              defaultChecked
              className="h-3.5 w-3.5 accent-ocean-700"
            />
            Save this driver for next time
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary !px-4 !py-1.5 text-xs">Update parcel</SubmitButton>
        {state.message && (
          <span
            className={`text-xs font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}
          >
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
