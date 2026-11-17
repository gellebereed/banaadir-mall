"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createPromotion, type SaveState } from "@/app/actions";
import CampaignShareButton from "@/components/CampaignShareButton";
import ProductPicker from "./ProductPicker";
import SubmitButton from "./SubmitButton";
import { money } from "@/lib/format";
import { isPreorder } from "@/lib/preorder";
import { promotionCovers, storeLabels } from "@/lib/labels";
import { toShopInput } from "@/lib/shop-time";
import type { Category, Product, Promotion } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Create a promotion — or, given `promotion`, edit that one in place. Uses useActionState + router.refresh so a new
 * promotion appears in the list straight away — it previously needed a
 * manual page refresh to show up.
 */
export default function PromotionForm({
  products,
  categories,
  promotion,
  badges,
}: {
  products: Product[];
  categories: Category[];
  /** The promotion being edited; omit to create a new one. */
  promotion?: Promotion;
  /** product id → the badge it wears today, for the picker's filter. */
  badges?: Record<string, string>;
}) {
  /**
   * No router.refresh() here on purpose. Calling it the moment the action
   * resolves aborts the action's own still-streaming response (the POST
   * ends in ERR_ABORTED), which left the button stuck on "Launching…" and
   * the new promotion missing until a manual reload. The action revalidates
   * the promotions cache tag, so the response it streams back already
   * carries the updated list.
   */
  const [state, formAction] = useActionState(createPromotion, INITIAL);

  const editing = Boolean(promotion);
  const [scope, setScope] = useState<"store" | "products" | "labels">(
    promotion?.productIds?.length ? "products" : promotion?.includeLabels?.length ? "labels" : "store",
  );
  // The store's private labels (lib/labels.ts) and what the label rule
  // covers right now — counted with the same function pricing uses.
  const labels = storeLabels(products);
  const [include, setInclude] = useState<string[]>(promotion?.includeLabels ?? []);
  const [exclude, setExclude] = useState<string[]>(promotion?.excludeLabels ?? []);
  const toggle = (list: string[], label: string) =>
    list.some((l) => l.toLowerCase() === label.toLowerCase())
      ? list.filter((l) => l.toLowerCase() !== label.toLowerCase())
      : [...list, label];
  const covered =
    scope === "products"
      ? null
      : products.filter(
          (p) =>
            !isPreorder(p) &&
            promotionCovers({ includeLabels: scope === "labels" ? include : [], excludeLabels: exclude }, p),
        ).length;
  const [pct, setPct] = useState(promotion?.pct ?? 15);
  const preorderCount = products.filter((p) => isPreorder(p)).length;

  // Live worked example so the seller sees the real effect before saving.
  const sample = products.find((p) => !isPreorder(p)) ?? products[0];
  const samplePrice = sample ? sample.price : 0;
  const discounted = Math.round(samplePrice * (1 - pct / 100) * 100) / 100;

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {promotion && <input type="hidden" name="id" value={promotion.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label htmlFor="promo-name" className="label">Name</label>
          <input
            id="promo-name"
            name="name"
            required
            defaultValue={promotion?.name}
            placeholder="e.g. Weekend Flash Sale"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="promo-pct" className="label">Discount %</label>
          <input
            id="promo-pct"
            name="pct"
            required
            type="number"
            min="1"
            max="90"
            value={pct}
            onChange={(e) => setPct(Number(e.target.value) || 0)}
            className="input"
          />
        </div>
      </div>

      {sample && pct > 0 && pct <= 90 && (
        <p className="rounded-xl bg-ocean-50 px-4 py-2.5 text-xs text-ocean-900">
          Example — <strong>{sample.name}</strong> would go from{" "}
          <span className="line-through">{money(samplePrice)}</span>{" "}
          to <strong className="text-coral-600">{money(discounted)}</strong>.
        </p>
      )}

      {/* Scope */}
      <div>
        <span className="label">Applies to</span>
        <div className={`grid gap-3 ${labels.length ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {(
            [
              ["store", "🏪 Entire store", "Every product you sell"],
              ["products", "🎯 Selected products", "Pick exactly which ones"],
              // Only offered once the shop has labelled something.
              ...(labels.length || scope === "labels"
                ? [["labels", "🏷️ Products with a label", "e.g. everything labelled Clearance"] as const]
                : []),
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition ${
                scope === value
                  ? "border-ocean-700 bg-ocean-50"
                  : "border-sand-200 bg-white hover:border-ocean-300"
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
                className="mt-0.5 h-4 w-4 accent-ocean-700"
              />
              <span>
                <span className="block text-sm font-bold text-ocean-950">{title}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {scope === "products" && (
          <div className="mt-3">
            <ProductPicker
              products={products}
              categories={categories}
              initial={promotion?.productIds ?? []}
              badges={badges}
              blockPreorders
            />
          </div>
        )}
        {scope === "labels" && (
          <LabelChips
            title="Products with any of these labels"
            labels={labels}
            chosen={include}
            onToggle={(l) => {
              setInclude(toggle(include, l));
              setExclude(exclude.filter((x) => x.toLowerCase() !== l.toLowerCase()));
            }}
            name="includeLabels"
            tone="include"
          />
        )}
        {scope !== "products" && labels.length > 0 && (
          <LabelChips
            title="Leave out products with these labels (optional)"
            labels={labels.filter((l) => !include.some((x) => x.toLowerCase() === l.label.toLowerCase()))}
            chosen={exclude}
            onToggle={(l) => setExclude(toggle(exclude, l))}
            name="excludeLabels"
            tone="exclude"
          />
        )}
        {covered !== null && (scope === "labels" || exclude.length > 0) && (
          <p className="mt-2 rounded-xl bg-ocean-50 px-3 py-2 text-xs font-semibold text-ocean-900">
            {scope === "labels" && include.length === 0
              ? "Pick a label above."
              : `Covers ${covered} product${covered === 1 ? "" : "s"} today. ${
                  scope === "labels"
                    ? "Products you label later join automatically."
                    : "Products you give a left-out label later drop out automatically."
                }`}
          </p>
        )}
        {scope !== "products" && labels.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            🏷️ Tip: give products a private label (like “Clearance”) in the product editor or from
            the product list, then run a promotion on just those, or leave them out of a store-wide sale.
          </p>
        )}
        {scope === "store" && preorderCount > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            ⏳ Your {preorderCount} pre-order product{preorderCount === 1 ? " is" : "s are"} left out
            automatically — stock that hasn&apos;t arrived is never on sale.
          </p>
        )}
      </div>

      {/* Optional schedule */}
      <details
        open={Boolean(promotion?.startsAt || promotion?.endsAt)}
        className="rounded-2xl border border-sand-200 bg-sand-50 p-4"
      >
        <summary className="cursor-pointer text-sm font-bold text-ocean-800">
          🗓️ Schedule it (optional)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Leave empty to start immediately and run until you pause it.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="promo-start" className="label">Starts (Mogadishu time)</label>
            <input
              id="promo-start"
              name="startsAt"
              type="datetime-local"
              defaultValue={toShopInput(promotion?.startsAt)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="promo-end" className="label">Ends (Mogadishu time)</label>
            <input
              id="promo-end"
              name="endsAt"
              type="datetime-local"
              defaultValue={toShopInput(promotion?.endsAt)}
              className="input"
            />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel={editing ? "Saving…" : "Launching…"}>
          {editing ? "Save changes" : "Launch Promotion"}
        </SubmitButton>
        {editing && (
          <Link href="/vendor/promotions" className="text-sm font-bold text-slate-500 hover:underline">
            {state.ok ? "Done" : "Cancel"}
          </Link>
        )}
        {state.message && (
          <span
            className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}
          >
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>

      {/* The moment a shop has launched a sale is the moment it wants to
          tell people — the link is offered right here, not left to be
          found in the list below. */}
      {!editing && state.ok && state.link && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mango-50 px-4 py-3 ring-1 ring-mango-200">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ocean-950">📣 Your campaign link is ready</p>
            <p className="text-xs text-slate-600">Post it on WhatsApp, Facebook, TikTok or Instagram — it opens straight on your sale.</p>
          </div>
          <CampaignShareButton
            path={state.link}
            cardPath={`${state.link}/card`}
            title="Your new promotion"
            caption={`🔥 ${pct}% off — our sale is on! Shop now on Banaadir Mall 👇`}
            label="Share campaign"
            variant="primary"
          />
        </div>
      )}
    </form>
  );
}

/** Tap-to-toggle label chips; each chosen one posts as a hidden `name` field. */
function LabelChips({
  title,
  labels,
  chosen,
  onToggle,
  name,
  tone,
}: {
  title: string;
  labels: { label: string; count: number }[];
  chosen: string[];
  onToggle: (label: string) => void;
  name: string;
  tone: "include" | "exclude";
}) {
  // A chosen label no product carries any more still shows, so it can be untoggled.
  const all = [
    ...labels,
    ...chosen
      .filter((c) => !labels.some((l) => l.label.toLowerCase() === c.toLowerCase()))
      .map((label) => ({ label, count: 0 })),
  ];
  if (all.length === 0) return null;
  const isOn = (l: string) => chosen.some((c) => c.toLowerCase() === l.toLowerCase());
  const on =
    tone === "include"
      ? "border-ocean-700 bg-ocean-700 text-white"
      : "border-coral-700 bg-coral-700 text-white";
  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-xs font-bold text-slate-600">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map(({ label, count }) => (
          <button
            key={label}
            type="button"
            aria-pressed={isOn(label)}
            onClick={() => onToggle(label)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              isOn(label) ? on : "border-sand-200 bg-white text-slate-700 hover:border-ocean-300"
            }`}
          >
            {tone === "exclude" && isOn(label) ? "✕ " : "🏷️ "}
            {label} <span className="font-semibold opacity-70">({count})</span>
          </button>
        ))}
      </div>
      {chosen.map((l) => (
        <input key={l} type="hidden" name={name} value={l} />
      ))}
    </fieldset>
  );
}
