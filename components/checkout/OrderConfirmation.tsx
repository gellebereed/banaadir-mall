"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import {
  buildCustomerReceipt,
  buildVendorOrderMessage,
  formatWhatsAppNumber,
  isValidWhatsAppNumber,
  SUPPORT_WHATSAPP,
  whatsappLink,
} from "@/lib/whatsapp";

/** One vendor's parcel within a placed order. */
export interface PlacedParcel {
  storeSlug: string;
  storeName: string;
  storeIcon: string;
  storeLogo?: string;
  /** The store's own WhatsApp number, when it has saved one. */
  whatsapp?: string;
  /** This parcel's real order id, e.g. "BM-12345-KARA". */
  orderId: string;
  subtotal: number;
  lines: {
    name: string;
    qty: number;
    price: number;
    options?: string;
    reference?: string;
    image?: string;
  }[];
}

export interface PlacedOrder {
  /** Customer-facing order number, e.g. "BM-12345". */
  baseId: string;
  /** ISO timestamp — kept as a string so the snapshot stays serialisable. */
  placedAt: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  paymentLabel: string;
  subtotal: number;
  delivery: number;
  total: number;
  parcels: PlacedParcel[];
}

/**
 * Order confirmation.
 *
 * An order spanning several stores becomes several parcels, each shipped
 * separately — so this screen shows the split plainly rather than implying
 * one delivery, and gives each vendor its own notification button carrying
 * only that vendor's items.
 *
 * Every WhatsApp message is composed in lib/whatsapp.ts, which is also what
 * guarantees a vendor is quoted their own order id and their own subtotal
 * rather than the whole order's.
 */
export default function OrderConfirmation({
  order,
  deliveryEstimate,
}: {
  order: PlacedOrder;
  deliveryEstimate?: string;
}) {
  const [notified, setNotified] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const placedAt = new Date(order.placedAt);
  const split = order.parcels.length > 1;

  const receipt = buildCustomerReceipt({
    orderId: order.baseId,
    customerName: order.customerName,
    address: order.address,
    city: order.city,
    paymentMethod: order.paymentLabel,
    subtotal: order.subtotal,
    deliveryFee: order.delivery,
    total: order.total,
    placedAt,
    parcels: order.parcels.map((p) => ({
      storeName: p.storeName,
      orderId: p.orderId,
      itemCount: p.lines.length,
      subtotal: p.subtotal,
    })),
  });

  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(receipt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is blocked in some in-app browsers — the WhatsApp share
      // button below still works, so fail quietly rather than alarm anyone.
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-up">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl shadow-sm">
          🎉
        </span>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-ocean-950">
          Order confirmed
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Thank you, {order.customerName.split(" ")[0]}. We&apos;ve sent your
          order to {split ? `${order.parcels.length} stores` : "the store"}.
        </p>
        <p className="mt-3 inline-block rounded-xl bg-sand-100 px-3 py-2 font-mono text-lg font-bold tracking-wide text-ocean-900">
          {order.baseId}
        </p>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div className="card mt-8 p-6">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-slate-400">
          Order summary
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Items</dt>
            <dd className="font-semibold text-slate-800">{money(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Delivery</dt>
            <dd className="font-semibold text-slate-800">
              {order.delivery === 0 ? (
                <span className="text-emerald-600">Free</span>
              ) : (
                money(order.delivery)
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-sand-200 pt-2">
            <dt className="font-display font-bold text-ocean-950">Total</dt>
            <dd className="font-display text-lg font-extrabold text-ocean-950">
              {money(order.total)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-4 border-t border-sand-200 pt-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Delivering to
            </p>
            <p className="mt-1 font-semibold text-slate-800">{order.customerName}</p>
            <p className="text-slate-500">{order.address}</p>
            <p className="text-slate-500">{order.customerPhone}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Payment
            </p>
            <p className="mt-1 font-semibold text-slate-800">{order.paymentLabel}</p>
            {deliveryEstimate && (
              <>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Estimated delivery
                </p>
                <p className="mt-1 text-slate-500">{deliveryEstimate}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Vendor notification ─────────────────────────────────── */}
      <div className="mt-6 rounded-3xl border-2 border-emerald-300 bg-emerald-50/60 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
          ⚡ Notify {split ? "your stores" : "the store"}
        </p>
        <p className="mt-1.5 text-sm text-emerald-800">
          {split ? (
            <>
              Your order is split across{" "}
              <strong>{order.parcels.length} stores</strong>. Each one packs
              and ships its own parcel — send each store its order so they can
              start straight away.
            </>
          ) : (
            <>
              Send the store your order details on WhatsApp so they can
              confirm and start packing straight away.
            </>
          )}
        </p>

        <div className="mt-4 space-y-3">
          {order.parcels.map((parcel) => {
            const hasOwnNumber = isValidWhatsAppNumber(parcel.whatsapp);
            const target = hasOwnNumber ? parcel.whatsapp! : SUPPORT_WHATSAPP;

            const message = buildVendorOrderMessage({
              orderId: parcel.orderId,
              storeName: parcel.storeName,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              address: order.address,
              city: order.city,
              paymentMethod: order.paymentLabel,
              placedAt,
              lines: parcel.lines,
              dashboardUrl: "banaadirmall.com/vendor/orders",
            });

            const units = parcel.lines.reduce((sum, l) => sum + l.qty, 0);
            const sent = notified[parcel.storeSlug];

            return (
              <div
                key={parcel.storeSlug}
                className="rounded-2xl border border-emerald-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-xl">
                      {parcel.storeLogo ? (
                        <Image
                          src={parcel.storeLogo}
                          alt=""
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        parcel.storeIcon
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display font-bold text-ocean-950">
                        {parcel.storeName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {units} item{units === 1 ? "" : "s"} · {money(parcel.subtotal)}
                      </p>
                    </div>
                  </div>
                  {/* The parcel's REAL order id — this is the number the
                      vendor searches for, and it is what the message quotes. */}
                  <span className="rounded-lg bg-sand-100 px-2 py-1 font-mono text-[11px] font-bold text-ocean-900">
                    {parcel.orderId}
                  </span>
                </div>

                {/* What this store is packing, so the customer can check it
                    before sending — and see the split is correct. */}
                <ul className="mt-3 space-y-1 border-t border-sand-100 pt-3 text-xs text-slate-600">
                  {parcel.lines.map((line, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {line.qty} × {line.name}
                        {line.options && (
                          <span className="text-slate-400"> · {line.options}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold text-slate-700">
                        {money(line.price * line.qty)}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={whatsappLink(target, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    setNotified((prev) => ({ ...prev, [parcel.storeSlug]: true }))
                  }
                  className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition ${
                    sent
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {sent ? "✓ Sent — tap to send again" : `💬 Notify ${parcel.storeName}`}
                </a>

                <p className="mt-2 text-center text-[11px] text-slate-400">
                  {hasOwnNumber ? (
                    <>Goes to {formatWhatsAppNumber(parcel.whatsapp)}</>
                  ) : (
                    // Being explicit stops this reading as a direct line to
                    // the store when it is actually the support desk relaying.
                    <>
                      This store hasn&apos;t added a WhatsApp number — your
                      message goes to Banaadir Mall support, who will pass it on.
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Customer's own copy ─────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-sand-200 bg-sand-50/60 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          🧾 Keep a copy
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Save your receipt or forward it to whoever is paying or receiving
          the delivery.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(receipt)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
          >
            💬 Share receipt
          </a>
          <button
            type="button"
            onClick={copyReceipt}
            className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-ocean-400 hover:text-ocean-700"
          >
            {copied ? "✓ Copied" : "📋 Copy receipt"}
          </button>
        </div>
      </div>

      {/* ── Next steps ──────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/track?id=${order.baseId}`} className="btn-primary !py-2.5 text-sm">
          📦 Track order
        </Link>
        <Link href="/products" className="btn-secondary !py-2.5 text-sm">
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
