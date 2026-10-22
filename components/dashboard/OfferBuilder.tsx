"use client";

import { useActionState, useMemo, useState } from "react";
import { createOffer, type SaveState } from "@/app/actions";
import { useT } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { offerHeadline, offerProblem, offerTerms, priceCart } from "@/lib/offers";
import type { Category, Offer, OfferKind, Product } from "@/lib/types";
import ProductPicker from "./ProductPicker";
import SubmitButton from "./SubmitButton";

const INITIAL: SaveState = { ok: false, message: "" };

type Draft = Omit<Offer, "id" | "store" | "active" | "name">;

interface Template {
  kind: OfferKind;
  icon: string;
  title: string;
  pitch: string;
  draft: Draft;
}

const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/**
 * The templates, with numbers suggested from the shop's OWN prices — a
 * "spend $X" threshold that nobody reaches, or one every single order
 * already passes, is an offer that does nothing.
 */
function templatesFor(products: Product[]): Template[] {
  const prices = products.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 20;
  const spendAt = round(median * 1.6, 5);
  const save = round(spendAt * 0.1, 1);

  return [
    {
      kind: "next_fixed",
      icon: "💲",
      title: "Next one for $1",
      pitch: "Buy one at full price, the next item of the same price or lower costs $1. The US Polo deal.",
      draft: { kind: "next_fixed", price: 1, fullPriceOnly: true, maxPerOrder: 1 },
    },
    {
      kind: "next_pct",
      icon: "✂️",
      title: "% off the next item",
      pitch: "Buy one, get 40% off the next one. Gentle on margin, still feels like a deal.",
      draft: { kind: "next_pct", pct: 40 },
    },
    {
      kind: "bxgy",
      icon: "🎁",
      title: "Buy X, get Y free",
      pitch: "Buy 2, get the cheapest third free. Moves volume on everyday items.",
      draft: { kind: "bxgy", buy: 2, get: 1, pct: 100 },
    },
    {
      kind: "tiers",
      icon: "📈",
      title: "Buy more, save more",
      pitch: "2+ items 10% off, 3+ items 20% off. Rewards bigger baskets.",
      draft: { kind: "tiers", tiers: [{ minQty: 2, pct: 10 }, { minQty: 3, pct: 20 }] },
    },
    {
      kind: "spend",
      icon: "🧾",
      title: "Spend & save",
      pitch: `Spend ${money(spendAt)}, save ${money(save)} — suggested from your prices (a typical item is ${money(median)}).`,
      draft: { kind: "spend", minSpend: spendAt, amountOff: save },
    },
  ];
}

/** A believable basket from the shop's own products for the preview. */
function exampleBasket(offer: Offer, products: Product[]): { product: Product; qty: number }[] {
  const pool = products
    .filter((p) => p.price > 0 && !(offer.fullPriceOnly && (p.compareAt ?? 0) > p.price))
    .sort((a, b) => b.price - a.price);
  if (pool.length === 0) return [];

  let units = 2;
  if (offer.kind === "bxgy") units = (offer.buy ?? 1) + (offer.get ?? 1);
  if (offer.kind === "tiers") units = Math.max(2, ...(offer.tiers ?? []).map((t) => t.minQty));
  if (offer.kind === "spend") {
    const basket: { product: Product; qty: number }[] = [];
    let sum = 0;
    for (let i = 0; i < 8 && sum < (offer.minSpend ?? 0); i++) {
      const product = pool[i % pool.length];
      const line = basket.find((b) => b.product.id === product.id);
      if (line) line.qty += 1;
      else basket.push({ product, qty: 1 });
      sum += product.price;
    }
    return basket;
  }

  // The most expensive first, then cheaper ones — the way a real basket
  // for this kind of offer usually looks.
  const basket: { product: Product; qty: number }[] = [];
  for (let i = 0; i < Math.min(units, 6); i++) {
    const product = pool[i % pool.length];
    const line = basket.find((b) => b.product.id === product.id);
    if (line) line.qty += 1;
    else basket.push({ product, qty: 1 });
  }
  return basket;
}

/**
 * Build a shop offer: pick a template, adjust two or three numbers, and
 * see exactly what a customer would pay — with the shop's own products —
 * before it goes live.
 */
export default function OfferBuilder({
  products,
  categories,
}: {
  /** The shop's products with today's prices (sale prices applied). */
  products: Product[];
  categories: Category[];
}) {
  const t = useT();
  const [state, formAction] = useActionState(createOffer, INITIAL);
  const templates = useMemo(() => templatesFor(products), [products]);

  const [kind, setKind] = useState<OfferKind | null>(null);
  const [draft, setDraft] = useState<Draft>(templates[0].draft);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [scope, setScope] = useState<"store" | "products">("store");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const offer: Offer = { ...draft, id: "draft", store: products[0]?.store ?? "", name: name || "Offer", active: true, startsAt: startsAt || undefined, endsAt: endsAt || undefined };
  const headline = kind ? offerHeadline(offer, t, money) : "";
  const shownName = nameTouched ? name : headline;
  const problem = kind ? offerProblem(offer) : null;

  const basket = kind ? exampleBasket(offer, products) : [];
  const preview = priceCart(
    basket.map((b) => ({
      key: b.product.id,
      productId: b.product.id,
      store: offer.store,
      price: b.product.price,
      qty: b.qty,
      onSale: (b.product.compareAt ?? 0) > b.product.price,
    })),
    problem ? [] : [{ ...offer, productIds: [], startsAt: undefined, endsAt: undefined }],
  );

  // Margin guard: any unit in the example sold below what it cost the shop.
  const belowCost = basket
    .map((b) => {
      const line = preview.lines[b.product.id];
      const lowest = Math.min(...(line?.units.map((u) => u.price) ?? [b.product.price]));
      return b.product.cost && lowest < b.product.cost ? { product: b.product, price: lowest } : null;
    })
    .filter(Boolean) as { product: Product; price: number }[];

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const numField = (key: "price" | "pct" | "buy" | "get" | "minSpend" | "amountOff" | "maxPerOrder", label: string, opts: { prefix?: string; suffix?: string; min?: number; max?: number; step?: number } = {}) => (
    <div>
      <label htmlFor={`offer-${key}`} className="label">{label}</label>
      <div className="flex items-center gap-2">
        {opts.prefix && <span className="text-sm font-bold text-slate-500">{opts.prefix}</span>}
        <input
          id={`offer-${key}`}
          type="number"
          inputMode="decimal"
          min={opts.min ?? 0}
          max={opts.max}
          step={opts.step ?? 1}
          value={draft[key] ?? ""}
          onChange={(e) => set({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
          className="input"
        />
        {opts.suffix && <span className="text-sm font-bold text-slate-500">{opts.suffix}</span>}
      </div>
    </div>
  );

  return (
    <form action={formAction} className="mt-4 space-y-5">
      {/* 1 — what kind of offer */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.kind}
            type="button"
            onClick={() => {
              setKind(template.kind);
              setDraft(template.draft);
              setNameTouched(false);
            }}
            aria-pressed={kind === template.kind}
            className={`rounded-2xl border-2 p-4 text-left transition ${
              kind === template.kind ? "border-ocean-700 bg-ocean-50" : "border-sand-200 bg-white hover:border-ocean-300"
            }`}
          >
            <span className="text-2xl" aria-hidden>{template.icon}</span>
            <span className="mt-1 block text-sm font-bold text-ocean-950">{template.title}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">{template.pitch}</span>
          </button>
        ))}
      </div>

      {kind && (
        <div className="animate-fade-up space-y-5">
          <input type="hidden" name="offerJson" value={JSON.stringify({ ...draft, name: shownName, startsAt, endsAt })} />

          {/* 2 — the numbers */}
          <div className="grid gap-4 sm:grid-cols-3">
            {kind === "next_fixed" && numField("price", "The next item costs", { prefix: "$", step: 0.5 })}
            {kind === "next_pct" && numField("pct", "Discount on the next item", { suffix: "%", min: 1, max: 100 })}
            {kind === "bxgy" && (
              <>
                {numField("buy", "Customer buys", { min: 1, max: 10 })}
                {numField("get", "And gets", { min: 1, max: 10 })}
                {numField("pct", "At this discount", { suffix: "%", min: 1, max: 100 })}
              </>
            )}
            {kind === "spend" && (
              <>
                {numField("minSpend", "When they spend", { prefix: "$", min: 1 })}
                {numField("amountOff", "They save", { prefix: "$", min: 0, step: 0.5 })}
              </>
            )}
            {kind !== "tiers" && kind !== "spend" && numField("maxPerOrder", "Times per order (blank = no limit)", { min: 1 })}
          </div>

          {kind === "tiers" && (
            <div className="space-y-2">
              <span className="label">Tiers</span>
              {(draft.tiers ?? []).map((tier, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="number"
                    min={2}
                    value={tier.minQty}
                    aria-label="Items"
                    onChange={(e) => set({ tiers: draft.tiers!.map((x, j) => (j === i ? { ...x, minQty: Number(e.target.value) } : x)) })}
                    className="input !w-20"
                  />
                  <span>or more items →</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={tier.pct}
                    aria-label="Percent off"
                    onChange={(e) => set({ tiers: draft.tiers!.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })}
                    className="input !w-20"
                  />
                  <span>% off each</span>
                  {(draft.tiers ?? []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => set({ tiers: draft.tiers!.filter((_, j) => j !== i) })}
                      className="text-xs font-semibold text-coral-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {(draft.tiers ?? []).length < 5 && (
                <button
                  type="button"
                  onClick={() => {
                    const last = draft.tiers?.[draft.tiers.length - 1] ?? { minQty: 1, pct: 5 };
                    set({ tiers: [...(draft.tiers ?? []), { minQty: last.minQty + 1, pct: Math.min(90, last.pct + 5) }] });
                  }}
                  className="text-sm font-semibold text-ocean-700 hover:underline"
                >
                  + Add a tier
                </button>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-2xl border border-sand-200 bg-white p-4">
            <input
              type="checkbox"
              checked={Boolean(draft.fullPriceOnly)}
              onChange={(e) => set({ fullPriceOnly: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-ocean-700"
            />
            <span>
              <span className="block text-sm font-bold text-ocean-950">Full-price items only</span>
              <span className="block text-xs text-slate-500">
                Items already on sale don&apos;t count — so a markdown and this offer never stack.
              </span>
            </span>
          </label>

          {/* 3 — which products */}
          <div>
            <span className="label">Applies to</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["store", "🏪 Entire store", "Every product you sell"],
                  ["products", "🎯 Selected products", "Pick exactly which ones"],
                ] as const
              ).map(([value, title, hint]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition ${
                    scope === value ? "border-ocean-700 bg-ocean-50" : "border-sand-200 bg-white hover:border-ocean-300"
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
                <ProductPicker products={products} categories={categories} />
              </div>
            )}
          </div>

          {/* 4 — name and dates */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="offer-name" className="label">Name customers see</label>
              <input
                id="offer-name"
                value={shownName}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                maxLength={80}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="offer-start" className="label">Starts (optional)</label>
              <input id="offer-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="offer-end" className="label">Ends (optional)</label>
              <input id="offer-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input" />
            </div>
          </div>

          {/* 5 — what a customer would actually pay */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Preview with your products</p>
            <p className="mt-1 font-display text-lg font-extrabold text-ocean-950">🎁 {headline}</p>
            {offerTerms(offer, t).length > 0 && (
              <p className="text-xs text-slate-500">{offerTerms(offer, t).join(" · ")}</p>
            )}
            {problem ? (
              <p className="mt-3 text-sm font-semibold text-coral-600">⚠ {problem}</p>
            ) : basket.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Add products to your shop to see an example.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {basket.map((b) => {
                    const line = preview.lines[b.product.id];
                    return (
                      <li key={b.product.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-slate-700">
                          {b.qty} × {b.product.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {line && line.discount > 0 && (
                            <span className="mr-2 text-xs text-slate-400 line-through">{money(line.listTotal)}</span>
                          )}
                          <strong>{money(line?.total ?? b.product.price * b.qty)}</strong>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 border-t border-emerald-200 pt-2 text-sm text-ocean-950">
                  Customer pays <strong>{money(preview.total)}</strong>
                  {preview.offerDiscount > 0 ? (
                    <> instead of {money(preview.listTotal)} — they save <strong className="text-emerald-700">{money(preview.offerDiscount)}</strong>, paid by your shop.</>
                  ) : (
                    <> — this basket doesn&apos;t qualify yet.</>
                  )}
                </p>
              </>
            )}
            {belowCost.map(({ product, price }) => (
              <p key={product.id} className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                ⚠ {product.name} would sell for {money(price)} — below what it cost you ({money(product.cost ?? 0)}).
                Consider a limit per order, &ldquo;full-price items only&rdquo;, or a smaller discount.
              </p>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pendingLabel="Launching…">Launch offer</SubmitButton>
            {state.message && (
              <span className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}>
                {state.ok ? "✓ " : "⚠ "}
                {state.message}
              </span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
