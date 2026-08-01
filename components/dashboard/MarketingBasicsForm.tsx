"use client";

import { useActionState } from "react";
import { updateMarketing, type SaveState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import type { MarketingSettings } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/** Announcement bar, hero copy and the site-wide sale campaign. */
export default function MarketingBasicsForm({ marketing }: { marketing: MarketingSettings }) {
  const [state, formAction] = useActionState(updateMarketing, INITIAL);
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="space-y-5">
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📢 Top of the page</h2>
        <div className="mt-4 grid gap-4">
          <div>
            <label htmlFor="announcement" className="label">Announcement bar text</label>
            <input id="announcement" name="announcement" required defaultValue={marketing.announcement} className="input" />
          </div>
          <div>
            <label htmlFor="heroBadge" className="label">Hero badge</label>
            <input id="heroBadge" name="heroBadge" required defaultValue={marketing.heroBadge} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="heroTitleTop" className="label">Hero title — first line</label>
              <input id="heroTitleTop" name="heroTitleTop" required defaultValue={marketing.heroTitleTop} className="input" />
            </div>
            <div>
              <label htmlFor="heroTitleHighlight" className="label">Hero title — highlighted line</label>
              <input id="heroTitleHighlight" name="heroTitleHighlight" required defaultValue={marketing.heroTitleHighlight} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="heroSubtitle" className="label">Hero subtitle</label>
            <textarea id="heroSubtitle" name="heroSubtitle" required rows={2} defaultValue={marketing.heroSubtitle} className="input resize-none" />
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🔥 Site-wide sale campaign</h2>
        <p className="mt-1 text-xs text-slate-400">
          Discounts every product on the marketplace and shows a banner under
          the hero. The biggest discount wins when a store promotion also
          applies.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr_140px]">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-sand-200 px-4 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="campaignActive" defaultChecked={marketing.campaign.active} className="h-4 w-4 accent-ocean-700" />
            Active
          </label>
          <div>
            <label htmlFor="campaignName" className="label">Campaign name</label>
            <input id="campaignName" name="campaignName" defaultValue={marketing.campaign.name} className="input" />
          </div>
          <div>
            <label htmlFor="campaignPct" className="label">Discount %</label>
            <input id="campaignPct" name="campaignPct" type="number" min="1" max="90" defaultValue={marketing.campaign.pct} className="input" />
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🚚 Delivery &amp; checkout</h2>
        <p className="mt-1 text-xs text-slate-400">
          Applied on the cart and checkout. These used to be fixed in code.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="deliveryFee" className="label">Delivery fee (USD)</label>
            <input id="deliveryFee" name="deliveryFee" type="number" min="0" step="0.5"
              defaultValue={marketing.delivery.fee} className="input" />
          </div>
          <div>
            <label htmlFor="freeThreshold" className="label">
              Free over <span className="font-normal text-slate-400">(0 = never)</span>
            </label>
            <input id="freeThreshold" name="freeThreshold" type="number" min="0" step="1"
              defaultValue={marketing.delivery.freeThreshold} className="input" />
          </div>
          <div>
            <label htmlFor="deliveryEstimate" className="label">Delivery estimate</label>
            <input id="deliveryEstimate" name="deliveryEstimate"
              defaultValue={marketing.delivery.estimate} className="input" />
          </div>
          <div>
            <label htmlFor="promoCode" className="label">
              Promo code <span className="font-normal text-slate-400">(blank = off)</span>
            </label>
            <input id="promoCode" name="promoCode" defaultValue={marketing.promo.code} className="input" />
          </div>
          <div>
            <label htmlFor="promoPct" className="label">Promo discount %</label>
            <input id="promoPct" name="promoPct" type="number" min="1" max="90"
              defaultValue={marketing.promo.pct} className="input" />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <SubmitButton pendingLabel="Publishing…">Save &amp; Publish</SubmitButton>
        {state.message && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}>
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
