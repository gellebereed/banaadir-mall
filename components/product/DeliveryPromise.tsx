"use client";

import DeliveryCity from "@/components/layout/DeliveryCity";
import { useT } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import type { MarketingSettings } from "@/lib/types";

/**
 * What a shopper needs to know before tapping Add to Cart, under the
 * button rather than at checkout: when it arrives in THEIR city (the
 * header's "Deliver to" picker, changeable here), what delivery costs for
 * this order, how they can pay, and the returns promise. Every figure is
 * the admin's own (Marketing → Delivery) — nothing is promised that the
 * shop hasn't.
 */
export default function DeliveryPromise({
  delivery,
  subtotal,
}: {
  delivery: MarketingSettings["delivery"];
  /** Price × quantity currently chosen. */
  subtotal: number;
}) {
  const t = useT();
  const { fee, freeThreshold } = delivery;

  let feeLine: string;
  if (freeThreshold > 0 && subtotal >= freeThreshold) feeLine = t("promise.freeOrder");
  else if (freeThreshold > 0 && subtotal > 0 && freeThreshold - subtotal <= freeThreshold / 2)
    feeLine = t("promise.addMore", { amount: money(freeThreshold - subtotal) });
  else if (freeThreshold > 0) feeLine = t("promise.freeOver", { amount: money(freeThreshold), fee: money(fee) });
  else feeLine = fee > 0 ? t("promise.fee", { fee: money(fee) }) : t("promise.freeOrder");

  return (
    <div className="mt-5 divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-white text-sm">
      <div className="px-4 py-3">
        <DeliveryCity delivery={delivery} variant="bar" />
        <p className="mt-1 pl-6 text-xs text-slate-500">{feeLine}</p>
      </div>
      <p className="flex items-start gap-2.5 px-4 py-3 text-slate-600">
        <span aria-hidden>💵</span>
        {t("promise.pay")}
      </p>
      <p className="flex items-start gap-2.5 px-4 py-3 text-slate-600">
        <span aria-hidden>↩️</span>
        {t("promise.returns")}
      </p>
    </div>
  );
}
