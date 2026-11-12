"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markAlertSent } from "@/app/alert-actions";
import { formatWhatsAppNumber } from "@/lib/whatsapp";

interface ReadyAlert {
  id: string;
  phone: string;
  name?: string;
  productName: string;
  image?: string;
  icon: string;
  /** The WhatsApp message, already written (lib/alert-utils#alertMessage). */
  message: string;
}

/**
 * The seller's alert lists (see app/vendor/alerts/page.tsx for why two).
 *
 * "Send on WhatsApp" opens the chat with the message written, and the row
 * leaves the list in the same tap. It is closed on the tap rather than on
 * some confirmation because there is none to wait for — WhatsApp never
 * reports back — and a row that stays put invites a second message to a
 * customer who asked for exactly one.
 */
export default function AlertsBoard({
  ready,
  waiting,
  automatic,
  canEditProducts,
}: {
  ready: ReadyAlert[];
  waiting: { productName: string; waitingFor: string; count: number; editHref: string }[];
  /** The WhatsApp Cloud API is configured, so due alerts send themselves. */
  automatic: boolean;
  canEditProducts: boolean;
}) {
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const open = ready.filter((r) => !sent.has(r.id));
  const waitingTotal = waiting.reduce((sum, w) => sum + w.count, 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Customer alerts</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Customers who tapped “Tell me on WhatsApp” on one of your products. Each one asked for a single
        message — when it arrives, when it is back, or when it is cheaper.
      </p>

      <p
        className={`mt-4 rounded-xl px-4 py-3 text-xs ${
          automatic ? "bg-emerald-50 text-emerald-800" : "bg-sand-100 text-slate-600"
        }`}
      >
        {automatic
          ? "✅ Automatic sending is on: alerts go out by themselves when they come due. Anything listed below is waiting for the next run — you can also send it now."
          : "Sending is by hand for now: when an alert is ready it appears below with the message already written. One tap opens WhatsApp."}
      </p>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">
          🔔 Ready to send <span className="text-slate-400">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing to send right now. When a product comes back in stock, arrives or drops in price, the
            customers waiting for it appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-100">
            {open.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-xl">
                  {alert.image ? <Image src={alert.image} alt="" fill sizes="44px" className="object-cover" /> : alert.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">
                    {alert.name ?? "Customer"} · <span className="font-mono text-xs font-medium text-slate-500">{formatWhatsAppNumber(alert.phone)}</span>
                  </span>
                  <span className="block truncate text-xs text-slate-500">{alert.productName}</span>
                </span>
                <a
                  href={`https://wa.me/${alert.phone}?text=${encodeURIComponent(alert.message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setSent((prev) => new Set(prev).add(alert.id));
                    start(async () => {
                      await markAlertSent(alert.id);
                    });
                  }}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Send on WhatsApp
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">
          ⏳ Waiting <span className="text-slate-400">({waitingTotal})</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          What your customers want and cannot buy yet — most wanted first.
        </p>
        {waiting.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Nobody is waiting yet. The button shows on every product page; sold-out and pre-order products
            get the most sign-ups.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-100">
            {waiting.map((group) => (
              <li key={`${group.productName}|${group.waitingFor}`} className="flex items-center gap-3 py-3">
                <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-ocean-950 px-2 font-display text-sm font-extrabold text-mango-300">
                  {group.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{group.productName}</span>
                  <span className="block text-xs text-slate-500">
                    {group.count === 1 ? "1 customer" : `${group.count} customers`} {group.waitingFor}
                  </span>
                </span>
                {canEditProducts && (
                  <Link href={group.editHref} className="text-xs font-bold text-ocean-700 hover:underline">
                    Open product →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
