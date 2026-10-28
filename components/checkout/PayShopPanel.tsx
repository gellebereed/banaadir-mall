"use client";

import { useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { dialCode, dialHref, kindInfo, type PaymentStatus, type ShopPaymentMethod } from "@/lib/shop-payments";
import { isValidWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";

/**
 * How to pay ONE shop: the amount, the number, and the two taps that do it.
 *
 * Shown on the confirmation screen and again on each parcel's tracking
 * card, so a customer who closed the first can still pay from the second.
 * Copying a number between apps is where people mistype, so wallets with
 * a known send-money code get a button that dials it filled in; everyone
 * gets the copy button, and the name the wallet should show.
 */
export default function PayShopPanel({
  storeName,
  storeWhatsapp,
  orderId,
  customerName,
  amount,
  method,
  status,
}: {
  storeName: string;
  storeWhatsapp?: string;
  orderId: string;
  customerName: string;
  amount: number;
  method: ShopPaymentMethod;
  status?: PaymentStatus;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const label = kindInfo(method.kind)?.label ?? method.kind;

  if (status === "paid") {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
        {t("pay.paid")} · {money(amount)} · {label}
      </p>
    );
  }

  if (method.kind === "cod" || status === "on_delivery") {
    return (
      <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-sand-200">
        💵 {t("pay.cod", { amount: money(amount) })}
      </p>
    );
  }

  const code = dialCode(method, amount);

  async function copy() {
    try {
      await navigator.clipboard.writeText(method.number ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Blocked in some in-app browsers — the number is on screen to read.
    }
  }

  return (
    <div className="rounded-xl bg-mango-50/70 p-3 ring-1 ring-mango-200">
      <p className="text-xs font-bold text-mango-900">
        {t("pay.send", { amount: money(amount), method: label })}
      </p>
      {method.number ? (
        <>
          <p className="mt-1 select-all font-mono text-lg font-extrabold tracking-wide text-ocean-950">
            {method.number}
          </p>
          {method.accountName && (
            <p className="text-[11px] text-slate-600">{t("pay.name", { name: method.accountName })}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {code && (
              <a
                href={dialHref(code)}
                className="rounded-xl bg-ocean-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-ocean-800"
              >
                {t("pay.dial")} <span className="font-mono font-normal opacity-80">{code}</span>
              </a>
            )}
            <button
              type="button"
              onClick={copy}
              className="rounded-xl border border-sand-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-ocean-400"
            >
              {copied ? t("pay.copied") : t("pay.copy")}
            </button>
            {isValidWhatsAppNumber(storeWhatsapp) && (
              <a
                href={whatsappLink(
                  storeWhatsapp!,
                  t("pay.toldMsg", { store: storeName, amount: money(amount), method: label, id: orderId, name: customerName }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                {t("pay.told")}
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-600">{t("pay.noNumber")}</p>
      )}
    </div>
  );
}
