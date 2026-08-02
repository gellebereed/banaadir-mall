"use client";

import { useActionState, useState } from "react";
import { updateMarketing, type SaveState } from "@/app/actions";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import type { MarketingSettings } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/** Announcement bar, hero copy and the site-wide sale campaign. */
export default function MarketingBasicsForm({ marketing }: { marketing: MarketingSettings }) {
  const [state, formAction] = useActionState(updateMarketing, INITIAL);
  useRefreshOnSuccess(state);

  const [bgColor, setBgColor] = useState(marketing.announcementBgColor || "#0c2b34");
  const [textColor, setTextColor] = useState(marketing.announcementTextColor || "#ffffff");
  const [autoScroll, setAutoScroll] = useState(marketing.announcementScroll ?? true);
  const [speed, setSpeed] = useState(marketing.announcementSpeed || 25);

  const bgPresets = [
    { label: "Deep Ocean", hex: "#0c2b34" },
    { label: "Navy Blue", hex: "#0f172a" },
    { label: "Ocean Teal", hex: "#1f6270" },
    { label: "Emerald", hex: "#064e3b" },
    { label: "Crimson", hex: "#881337" },
    { label: "Dark Amber", hex: "#78350f" },
  ];

  const textPresets = [
    { label: "Pure White", hex: "#ffffff" },
    { label: "Mango Gold", hex: "#fde68a" },
    { label: "Light Cyan", hex: "#e0f2fe" },
    { label: "Mint Green", hex: "#d1fae5" },
    { label: "Soft Coral", hex: "#fecdd3" },
  ];

  return (
    <form action={formAction} className="space-y-5">
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📢 Top Announcement Bar</h2>
        <p className="mt-1 text-xs text-slate-500">
          Customize the auto-scrolling header banner. Format text with <strong>**bold**</strong>, <em>*italics*</em>, and emojis.
        </p>

        <div className="mt-4 grid gap-5">
          <div>
            <label htmlFor="announcement" className="label">Announcement Text</label>
            <input
              id="announcement"
              name="announcement"
              required
              defaultValue={marketing.announcement}
              placeholder="e.g. **FREE DELIVERY** in Mogadishu on orders over $25 · Pay with *EVC Plus, Zaad & eDahab*"
              className="input"
            />
            <p className="mt-1 text-xs text-slate-400">
              Tip: Surround words with <code>**bold text**</code> to make them bold, or <code>*italic text*</code> to italicize.
            </p>
          </div>

          {/* Color Customization */}
          <div className="grid gap-4 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="announcementBgColor" className="label font-semibold text-slate-700">
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border-0 p-0"
                />
                <input
                  type="text"
                  id="announcementBgColor"
                  name="announcementBgColor"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="input !py-2 font-mono text-xs uppercase"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bgPresets.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setBgColor(p.hex)}
                    className="flex items-center gap-1 rounded-full border border-sand-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:border-ocean-400"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.hex }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="announcementTextColor" className="label font-semibold text-slate-700">
                Text Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border-0 p-0"
                />
                <input
                  type="text"
                  id="announcementTextColor"
                  name="announcementTextColor"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="input !py-2 font-mono text-xs uppercase"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {textPresets.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setTextColor(p.hex)}
                    className="flex items-center gap-1 rounded-full border border-sand-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:border-ocean-400"
                  >
                    <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: p.hex }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Auto-scroll & Speed controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sand-200 bg-sand-50 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                name="announcementScroll"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-4 w-4 accent-ocean-700"
              />
              <span>🔄 Enable continuous auto-scrolling marquee</span>
            </label>

            {autoScroll && (
              <div className="flex items-center gap-2">
                <label htmlFor="announcementSpeed" className="text-xs font-semibold text-slate-600">
                  Speed:
                </label>
                <select
                  id="announcementSpeed"
                  name="announcementSpeed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="input !py-1.5 !px-3 text-xs"
                >
                  <option value={15}>⚡ Fast (15s)</option>
                  <option value={25}>✨ Medium Smooth (25s)</option>
                  <option value={35}>🐢 Relaxed Slow (35s)</option>
                </select>
              </div>
            )}
          </div>

          {/* Live Preview Box */}
          <div>
            <span className="label text-xs font-bold uppercase tracking-wider text-slate-400">Live Preview</span>
            <div
              className="mt-1 overflow-hidden rounded-xl py-2 px-4 text-center text-xs font-semibold shadow-xs"
              style={{ backgroundColor: bgColor, color: textColor }}
            >
              <span>{marketing.announcement}</span>
            </div>
          </div>

          <div className="pt-2">
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
