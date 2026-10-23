"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import OrderSlipShare from "@/components/checkout/OrderSlipShare";
import { usePrefs } from "@/components/prefs/PrefsProvider";
import RecoStack from "@/components/reco/RecoStack";
import { money } from "@/lib/format";
import type { CartLineRef } from "@/lib/reco/types";
import {
  buildCustomerReceipt,
  buildVendorOrderMessage,
  formatWhatsAppNumber,
  isValidWhatsAppNumber,
  SUPPORT_WHATSAPP_CONFIGURED,
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
  /** The payment option's id ("cod", "evc"…) — picks the translated wording. */
  paymentMethod?: string;
  subtotal: number;
  /** Saved through shop offers and the promo code, as the server priced it. */
  discount?: number;
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
  purchased = [],
  signUpHref,
}: {
  order: PlacedOrder;
  deliveryEstimate?: string;
  /** What was just bought — seeds the "goes with your order" shelf. */
  purchased?: CartLineRef[];
  /**
   * Set for a guest: the sign-up page with their details filled in. Their
   * copy of this order is kept on this phone and moves into the account
   * they create here (adoptGuestData), so it is waiting under "My orders".
   */
  signUpHref?: string;
}) {
  const { t } = usePrefs();
  const [notified, setNotified] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const placedAt = new Date(order.placedAt);
  const split = order.parcels.length > 1;
  const firstName = order.customerName.split(" ")[0];
  const cash = order.paymentMethod === "cod";
  const paymentName = cash ? t("checkout.pay.codName") : order.paymentLabel;

  /*
   * Where each parcel's WhatsApp message would go: the store's own number,
   * else support — but only a support number that is really configured.
   * The code's fallback is a placeholder, and sending a stranger this
   * customer's name, phone and address is worse than offering no button.
   */
  const chatTarget = (parcel: PlacedParcel) =>
    isValidWhatsAppNumber(parcel.whatsapp) ? parcel.whatsapp! : SUPPORT_WHATSAPP_CONFIGURED;
  const canChat = order.parcels.some((p) => chatTarget(p));

  // The slip link has to be absolute — it travels into WhatsApp, where a
  // relative path means nothing. Empty during SSR, which is fine: the
  // message is only ever built for a click that happens in the browser.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const receipt = buildCustomerReceipt({
    orderId: order.baseId,
    customerName: order.customerName,
    address: order.address,
    city: order.city,
    paymentMethod: order.paymentLabel,
    subtotal: order.subtotal,
    discount: order.discount,
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
    <div className="animate-fade-up">
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl shadow-sm">
          🎉
        </span>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-ocean-950">
          {t("conf.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {split
            ? t("conf.thanksSplit", { name: firstName, n: order.parcels.length })
            : t("conf.thanks", { name: firstName })}
        </p>
        <p className="mt-3 inline-block rounded-xl bg-sand-100 px-3 py-2 font-mono text-lg font-bold tracking-wide text-ocean-900">
          {order.baseId}
        </p>
      </div>

      {/*
        What happens now, in three plain steps. A first-time online shopper
        reading "Order confirmed" has no idea whether to wait, call or pay —
        this is the part of the screen they actually need.
      */}
      <div className="card mt-8 p-6">
        <h2 className="font-display text-base font-extrabold text-ocean-950">{t("conf.nextTitle")}</h2>
        <ol className="mt-3 space-y-3 text-sm text-slate-700">
          {[
            t("conf.next1"),
            t("conf.next2", { phone: order.customerPhone }),
            cash
              ? t("conf.next3Cash", { total: money(order.total) })
              : t("conf.next3", { total: money(order.total), method: paymentName }),
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-xs font-bold text-ocean-800">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div className="card mt-6 p-6">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-slate-400">
          {t("conf.summary")}
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">{t("conf.items")}</dt>
            <dd className="font-semibold text-slate-800">{money(order.subtotal)}</dd>
          </div>
          {(order.discount ?? 0) > 0 && (
            <div className="flex justify-between text-emerald-600">
              <dt>{t("conf.saved")}</dt>
              <dd className="font-semibold">−{money(order.discount ?? 0)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">{t("conf.delivery")}</dt>
            <dd className="font-semibold text-slate-800">
              {order.delivery === 0 ? (
                <span className="text-emerald-600">{t("conf.free")}</span>
              ) : (
                money(order.delivery)
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-sand-200 pt-2">
            <dt className="font-display font-bold text-ocean-950">{t("conf.total")}</dt>
            <dd className="font-display text-lg font-extrabold text-ocean-950">
              {money(order.total)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-4 border-t border-sand-200 pt-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t("conf.to")}
            </p>
            <p className="mt-1 font-semibold text-slate-800">{order.customerName}</p>
            <p className="text-slate-500">{order.address}</p>
            <p className="text-slate-500">{order.customerPhone}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t("conf.payment")}
            </p>
            <p className="mt-1 font-semibold text-slate-800">{paymentName}</p>
            {deliveryEstimate && (
              <>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {t("conf.eta")}
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
          {t("conf.parcels")}
        </p>
        {/* The shop is told in its dashboard (bell, live alert) — WhatsApp
            is an extra for the impatient, not a job the buyer must do. */}
        <p className="mt-1.5 text-sm text-emerald-800">
          {!canChat
            ? t("conf.parcelsBodyNoChat")
            : split
              ? t("conf.parcelsBodySplit", { n: order.parcels.length })
              : t("conf.parcelsBody")}
        </p>

        <div className="mt-4 space-y-3">
          {order.parcels.map((parcel) => {
            const hasOwnNumber = isValidWhatsAppNumber(parcel.whatsapp);
            const target = chatTarget(parcel);

            const message = buildVendorOrderMessage({
              orderId: parcel.orderId,
              storeName: parcel.storeName,
              slipUrl: `${origin}/api/order-slip/${parcel.orderId}`,
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
                        {units === 1 ? t("conf.unit") : t("conf.units", { n: units })} · {money(parcel.subtotal)}
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

                {target && (
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
                  {sent ? t("conf.sent") : t("conf.notify", { store: parcel.storeName })}
                </a>
                )}

                {/* The same parcel as a picture, for shops that would rather
                    look at a slip than read a message. */}
                <OrderSlipShare
                  orderId={parcel.orderId}
                  storeName={parcel.storeName}
                  className="mt-2"
                />

                {target && (
                  <p className="mt-2 text-center text-[11px] text-slate-400">
                    {hasOwnNumber
                      ? t("conf.goesTo", { number: formatWhatsAppNumber(parcel.whatsapp) })
                      : // Being explicit stops this reading as a direct line to
                        // the store when it is actually the support desk relaying.
                        t("conf.relay")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Customer's own copy ─────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-sand-200 bg-sand-50/60 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {t("conf.copyTitle")}
        </p>
        <p className="mt-1 text-xs text-slate-500">{t("conf.copyBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(receipt)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
          >
            {t("conf.share")}
          </a>
          <button
            type="button"
            onClick={copyReceipt}
            className="rounded-xl border border-sand-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-ocean-400 hover:text-ocean-700"
          >
            {copied ? t("conf.copied") : t("conf.copy")}
          </button>
        </div>
      </div>

      {signUpHref && (
        <div className="mt-6 rounded-2xl border border-ocean-100 bg-ocean-50/60 p-5">
          <p className="font-display font-bold text-ocean-950">{t("conf.saveTitle")}</p>
          <p className="mt-1 text-xs text-slate-600">{t("conf.saveBody")}</p>
          <Link href={signUpHref} className="btn-primary mt-3 inline-block !py-2 text-sm">
            {t("conf.saveCta")}
          </Link>
        </div>
      )}

      {/* ── Next steps ──────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/track?id=${order.baseId}`} className="btn-primary !py-2.5 text-sm">
          {t("conf.track")}
        </Link>
        <Link href="/products" className="btn-secondary !py-2.5 text-sm">
          {t("conf.keepShopping")}
        </Link>
      </div>
    </div>

    {/*
      The peak-end moment. This is the point in the whole journey where a
      shopper feels best about the shop, and where an add-on can still be
      packed into a parcel that hasn't left yet — which makes it useful to
      them rather than merely well-timed for us.
    */}
    {purchased.length > 0 && (
      <div className="pb-8">
        <RecoStack surface="confirmation" items={purchased} />
      </div>
    )}
    </div>
  );
}
