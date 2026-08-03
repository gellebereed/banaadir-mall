"use client";

import Image from "next/image";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { money } from "@/lib/format";
import { estimateLabel, parcelJourney, stampLabel, telLink } from "@/lib/delivery";
import { formatWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import type { Order, OrderItem } from "@/lib/types";

/**
 * One shop's parcel within an order: what's in it, where it has got to, and
 * who to call about it.
 *
 * Each shop packs and dispatches independently, so a parcel gets its own
 * timeline rather than inheriting one status for the whole order. Three
 * shops means three of these, and they routinely disagree — one delivered
 * while another hasn't been packed is normal, not an error state.
 */
export default function ParcelCard({
  order,
  storeName,
  storeIcon,
  storeLogo,
  items,
  index,
  total,
  /** Set when this parcel shares its driver with others in the same order. */
  sharedWith,
}: {
  order: Order;
  storeName: string;
  storeIcon?: string;
  storeLogo?: string;
  items: OrderItem[];
  index: number;
  total: number;
  sharedWith?: string[];
}) {
  const journey = parcelJourney(order);
  const courier = order.delivery?.courier;
  const cancelled = order.status === "cancelled";
  const eta = estimateLabel(order.delivery?.estimatedAt);

  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5">
      {/* ── Which shop, and which parcel of how many ─────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-100 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-lg">
            {storeLogo ? (
              <Image src={storeLogo} alt="" width={40} height={40} className="h-full w-full object-cover" />
            ) : (
              storeIcon ?? "🏪"
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display font-bold text-ocean-950">{storeName}</p>
            <p className="text-xs text-slate-500">
              Parcel {index} of {total}
              <span className="ml-1.5 font-mono text-[11px] text-slate-400">{order.id}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* ── What's inside ─────────────────────────────────────────── */}
      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {item.qty} × {item.name ?? item.productId}
                {(item.selectedColor || item.selectedSize) && (
                  <span className="text-slate-400">
                    {" · "}
                    {[item.selectedColor, item.selectedSize].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {typeof item.price === "number" && (
                <span className="shrink-0 font-semibold text-slate-700">
                  {money(item.price * item.qty)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Where it has got to ───────────────────────────────────── */}
      {cancelled ? (
        <p className="mt-4 rounded-xl bg-coral-50 px-3 py-2 text-xs text-coral-800">
          This parcel was cancelled. The rest of your order is unaffected.
        </p>
      ) : (
        <ol className="mt-4">
          {journey.map((step, i) => (
            <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
              {i < journey.length - 1 && (
                <span
                  className={`absolute left-3.5 top-8 h-full w-0.5 ${
                    i < journey.findIndex((s) => s.current) ? "bg-ocean-600" : "bg-sand-200"
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  step.reached
                    ? "bg-ocean-700 text-white shadow-sm shadow-ocean-700/30"
                    : "bg-sand-100 text-slate-400"
                }`}
              >
                {step.icon}
              </span>
              <div className={`min-w-0 ${step.reached ? "" : "opacity-40"}`}>
                <p className="text-sm font-bold text-ocean-950">
                  {step.label}
                  {step.current && (
                    <span className="ml-2 rounded-full bg-mango-100 px-2 py-0.5 text-[10px] font-bold text-mango-900">
                      Now
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {step.text}
                  {/* The stamp is what turns "shipped" into "shipped four
                      days ago", which is the thing worth knowing. */}
                  {step.reached && step.at && (
                    <span className="ml-1.5 text-slate-400">· {stampLabel(step.at)}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* ── Who is carrying it ────────────────────────────────────── */}
      {courier && !cancelled && (
        <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                🚚 Your driver
              </p>
              <p className="truncate text-sm font-bold text-ocean-950">
                {courier.name}
                {courier.company && (
                  <span className="ml-1.5 font-normal text-slate-500">· {courier.company}</span>
                )}
              </p>
              <p className="font-mono text-xs text-slate-500">
                {formatWhatsAppNumber(courier.phone)}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={telLink(courier.phone)}
                className="rounded-xl bg-ocean-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-ocean-800"
              >
                📞 Call
              </a>
              <a
                href={whatsappLink(
                  courier.phone,
                  `Hello ${courier.name}, I'm asking about my Banaadir Mall parcel ${order.id}. Where is it now?`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                💬 WhatsApp
              </a>
            </div>
          </div>

          {sharedWith && sharedWith.length > 0 && (
            <p className="mt-2 border-t border-emerald-200 pt-2 text-[11px] text-emerald-800">
              Also bringing your {sharedWith.join(" and ")} parcel
              {sharedWith.length === 1 ? "" : "s"} — one delivery, one call.
            </p>
          )}

          {order.delivery?.trackingCode && (
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              Waybill: {order.delivery.trackingCode}
            </p>
          )}
          {order.delivery?.note && (
            <p className="mt-1 text-[11px] text-slate-600">💬 {order.delivery.note}</p>
          )}
        </div>
      )}

      {/* Not yet dispatched: say what happens next rather than nothing. */}
      {!courier && !cancelled && order.status !== "delivered" && (
        <p className="mt-2 rounded-xl bg-sand-50 px-3 py-2 text-[11px] text-slate-500">
          {eta
            ? `${eta}. You'll see the driver's number here once ${storeName} hands this parcel over.`
            : `You'll see the driver's number here once ${storeName} hands this parcel over.`}
        </p>
      )}

      {eta && courier && !cancelled && (
        <p className="mt-2 text-center text-[11px] font-semibold text-ocean-700">{eta}</p>
      )}
    </div>
  );
}
