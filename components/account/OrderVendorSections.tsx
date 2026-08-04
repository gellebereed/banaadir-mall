"use client";

import Image from "next/image";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrderProgress, { LiveIndicator } from "@/components/track/OrderProgress";
import { money } from "@/lib/format";
import { useLiveOrder } from "@/lib/use-live-order";
import { SUPPORT_WHATSAPP, whatsappLink } from "@/lib/whatsapp";
import type { OrderStatus } from "@/lib/types";

export interface VendorLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
  store?: string;
  storeName?: string;
  image?: string;
  selectedColor?: string;
  selectedSize?: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ONE ORDER, BROKEN DOWN BY SHOP — and kept current.
 * ─────────────────────────────────────────────────────────────────────────
 * Each shop that has items in this order gets its own block: what it is
 * packing, where that parcel has got to, and a way to contact it. The
 * statuses come from `useLiveOrder`, so when a seller marks a parcel
 * shipped, this updates on its own — the customer does not have to reload,
 * and does not have to wonder whether reloading would even help.
 *
 * The parcel statuses are looked up by STORE SLUG rather than by position,
 * because the order of the shops here (grouped from the line items) has no
 * reason to match the order the parcels come back in.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function OrderVendorSections({
  orderId,
  groups,
  fallbackStatus,
  storeLabel,
}: {
  orderId: string;
  /** [storeSlug, items] pairs, already grouped by the caller. */
  groups: [string, VendorLine[]][];
  /** Used until the live data arrives, and for orders with no parcel record. */
  fallbackStatus: OrderStatus;
  storeLabel: (slug: string, items: VendorLine[]) => string;
}) {
  const { parcels, justChanged, lastCheckedAt, live, refresh } = useLiveOrder(orderId);

  const byStore = new Map(parcels.map((parcel) => [parcel.order.store, parcel]));

  return (
    <div className="space-y-4 divide-y divide-sand-100 p-4">
      {groups.map(([storeSlug, storeItems]) => {
        const parcel = byStore.get(storeSlug);
        const status = parcel?.order.status ?? fallbackStatus;
        const changed = parcel ? justChanged.includes(parcel.order.id) : false;
        const displayName = parcel?.storeName ?? storeLabel(storeSlug, storeItems);

        const vendorTotal = storeItems.reduce((sum, item) => sum + item.price * item.qty, 0);

        const message =
          `Hello ${displayName}, I'm asking about my Banaadir Mall order ` +
          `${parcel?.order.id ?? orderId}.\n\n` +
          storeItems.map((item) => `• ${item.qty} × ${item.name}`).join("\n") +
          `\n\nTotal: ${money(vendorTotal)}\n\nCould you tell me the delivery status? Thank you.`;

        // A shop that saved its own number is reached directly; otherwise
        // the message goes to support, who relay it.
        const target = parcel?.storeWhatsapp || SUPPORT_WHATSAPP;

        return (
          <div key={storeSlug} className="pt-3 first:pt-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ocean-900 text-xs font-bold text-white">
                  {parcel?.storeLogo ? (
                    <Image
                      src={parcel.storeLogo}
                      alt=""
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (parcel?.storeIcon ?? "🏪")
                  )}
                </span>
                <div className="min-w-0">
                  <span className="font-display text-xs font-extrabold uppercase tracking-wide text-ocean-950">
                    {displayName}
                  </span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    ({storeItems.length} item{storeItems.length === 1 ? "" : "s"})
                  </span>
                  {parcel && (
                    <span className="ml-2 font-mono text-[10px] text-slate-300">
                      {parcel.order.id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
                <a
                  href={whatsappLink(target, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                >
                  💬 Contact Vendor
                </a>
              </div>
            </div>

            {/* Where this shop's parcel has got to. */}
            <div className="mb-3">
              <OrderProgress
                order={parcel?.order ?? { status, timeline: undefined, date: "" }}
                highlight={changed}
              />
            </div>

            {/* Driver details, once the shop has handed the parcel over. */}
            {parcel?.order.delivery?.courier && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                <p className="text-[11px] text-emerald-900">
                  🚚 <strong>{parcel.order.delivery.courier.name}</strong>
                  {parcel.order.delivery.courier.company && (
                    <span className="text-emerald-700">
                      {" "}
                      · {parcel.order.delivery.courier.company}
                    </span>
                  )}
                </p>
                <a
                  href={`tel:${parcel.order.delivery.courier.phone}`}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  Call driver
                </a>
              </div>
            )}

            <div className="space-y-2 pl-2 sm:pl-9">
              {storeItems.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-lg border border-sand-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sand-100 text-lg">
                      🛍️
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{item.name}</p>
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

      <div className="pt-3">
        <LiveIndicator live={live} lastCheckedAt={lastCheckedAt} onRefresh={refresh} />
      </div>
    </div>
  );
}
