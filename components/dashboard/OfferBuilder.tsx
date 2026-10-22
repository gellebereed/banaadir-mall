"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { OfferSuggestion } from "@/lib/offer-suggestions";
import { createOffer, type SaveState } from "@/app/actions";
import { useT } from "@/components/prefs/PrefsProvider";
import { money } from "@/lib/format";
import { offerCoverage, offerHeadline, offerProblem, offerTerms, priceCart } from "@/lib/offers";
import type { Category, Offer, OfferKind, OfferProductRef, Product } from "@/lib/types";
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

const toRef = (p: Product): OfferProductRef => ({
  productId: p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  image: p.images?.[0],
  icon: p.icon,
});

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
    ...bundleTemplates(products, median, spendAt),
  ];
}

/** Set price, mix & match and free gift — seeded with the shop's own items. */
function bundleTemplates(products: Product[], median: number, spendAt: number): Template[] {
  const byPrice = [...products].filter((p) => p.price > 0).sort((a, b) => b.price - a.price);
  const pair = byPrice.slice(0, 2);
  const pairSum = pair.reduce((t, p) => t + p.price, 0);
  const cheapest = byPrice[byPrice.length - 1];
  const mixPrice = round(median * 3 * 0.8, 5);
  return [
    {
      kind: "bundle",
      icon: "🧩",
      title: "Bundle price",
      pitch: pair.length === 2
        ? `${pair[0].name} + ${pair[1].name} together for ${money(round(pairSum * 0.85, 1))} instead of ${money(pairSum)}.`
        : "Chosen products together for one price — complete the look.",
      draft: {
        kind: "bundle",
        bundle: pair.map(toRef),
        price: pair.length === 2 ? round(pairSum * 0.85, 1) : undefined,
      },
    },
    {
      kind: "mix",
      icon: "🔀",
      title: "Mix & match",
      pitch: `Any 3 for ${money(mixPrice)} — customers pick, you move more items.`,
      draft: { kind: "mix", qty: 3, price: mixPrice },
    },
    {
      kind: "gift",
      icon: "🎀",
      title: "Free gift",
      pitch: cheapest
        ? `Free ${cheapest.name} when they spend ${money(spendAt)}.`
        : "A free product when they spend enough.",
      draft: { kind: "gift", minSpend: spendAt, gift: cheapest ? toRef(cheapest) : undefined },
    },
  ];
}

/** A believable basket from the shop's own products for the preview. */
function exampleBasket(offer: Offer, products: Product[]): { product: Product; qty: number }[] {
  const pool = products
    .filter((p) => p.price > 0 && !(offer.fullPriceOnly && (p.compareAt ?? 0) > p.price))
    .sort((a, b) => b.price - a.price);
  if (pool.length === 0) return [];

  if (offer.kind === "bundle") {
    return (offer.bundle ?? [])
      .map((b) => products.find((p) => p.id === b.productId))
      .filter((p): p is Product => Boolean(p))
      .map((product) => ({ product, qty: 1 }));
  }
  if (offer.kind === "gift") {
    const gift = products.find((p) => p.id === offer.gift?.productId);
    const basket: { product: Product; qty: number }[] = [];
    const others = pool.filter((p) => p.id !== gift?.id);
    let sum = 0;
    for (let i = 0; i < 8 && others.length && sum < (offer.minSpend ?? 0); i++) {
      const product = others[i % others.length];
      const line = basket.find((b) => b.product.id === product.id);
      if (line) line.qty += 1;
      else basket.push({ product, qty: 1 });
      sum += product.price;
    }
    if (gift) basket.push({ product: gift, qty: 1 });
    return basket;
  }

  let units = 2;
  if (offer.kind === "bxgy") units = (offer.buy ?? 1) + (offer.get ?? 1);
  if (offer.kind === "mix") units = Math.max(2, offer.qty ?? 2);
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
  preset,
}: {
  /** The shop's products with today's prices (sale prices applied). */
  products: Product[];
  categories: Category[];
  /** A suggestion to load ("Use this"); `nonce` changes on every click. */
  preset?: OfferSuggestion & { nonce: number };
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

  // Load a suggestion into the form — the seller still sees the preview
  // and decides; nothing goes live until they press Launch.
  useEffect(() => {
    if (!preset) return;
    setKind(preset.draft.kind);
    setDraft(preset.draft);
    setName(preset.name ?? "");
    setNameTouched(Boolean(preset.name));
    setScope(preset.productIds?.length ? "products" : "store");
    setStartsAt(preset.startsAt ?? "");
    setEndsAt(preset.endsAt ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const offer: Offer = { ...draft, id: "draft", store: products[0]?.store ?? "", name: name || "Offer", active: true, startsAt: startsAt || undefined, endsAt: endsAt || undefined };
  const headline = kind ? offerHeadline(offer, t, money) : "";
  const shownName = nameTouched ? name : headline;
  const problem = kind ? offerProblem(offer) : null;

  const basket = kind ? exampleBasket(offer, products) : [];
  const coverage = offerCoverage({ ...offer, productIds: [] }, products);
  const preview = priceCart(
    basket.map((b) => ({
      key: b.product.id,
      productId: b.product.id,
      store: offer.store,
      price: b.product.price,
      qty: b.qty,
      onSale: (b.product.compareAt ?? 0) > b.product.price,
    })),
    problem ? [] : [{ ...offer, productIds: offer.kind === "bundle" ? offer.productIds : [], startsAt: undefined, endsAt: undefined }],
    { codes: offer.code ? [offer.code] : [] },
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
  const numField = (key: "price" | "pct" | "buy" | "get" | "minSpend" | "amountOff" | "maxPerOrder" | "qty" | "maxUses" | "budget", label: string, opts: { prefix?: string; suffix?: string; min?: number; max?: number; step?: number } = {}) => (
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <input
            type="hidden"
            name="offerJson"
            value={JSON.stringify({
              ...draft,
              bundleIds: draft.bundle?.map((b) => b.productId),
              giftId: draft.gift?.productId,
              name: shownName,
              // Sent as typed: the server reads these as Mogadishu time
              // (lib/shop-time.ts) — the marketplace's clock, whatever time
              // zone the seller's phone happens to be set to.
              startsAt,
              endsAt,
            })}
          />

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
            {kind === "bundle" && numField("price", "The whole set costs", { prefix: "$", min: 0, step: 0.5 })}
            {kind === "mix" && (
              <>
                {numField("qty", "Any this many items", { min: 2, max: 10 })}
                {numField("price", "For", { prefix: "$", min: 0, step: 0.5 })}
              </>
            )}
            {kind === "gift" && numField("minSpend", "When they spend", { prefix: "$", min: 1 })}
            {kind !== "tiers" && kind !== "spend" && kind !== "gift" &&
              numField("maxPerOrder", "Times per order (blank = no limit)", { min: 1 })}
          </div>

          {kind === "mix" && scope === "store" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              💡 Mix &amp; match works best on products of a similar price — with your whole shop, a
              customer can pick your dearest items (the preview below shows exactly that). Choose
              &ldquo;Selected products&rdquo; below to limit it.
            </p>
          )}

          {kind === "bundle" && (
            <ProductChooser
              label="Products in the set (2–6, one of each)"
              products={products}
              chosen={draft.bundle ?? []}
              max={6}
              onChange={(bundle) => set({ bundle })}
            />
          )}
          {kind === "gift" && (
            <ProductChooser
              label="The free gift"
              products={products}
              chosen={draft.gift ? [draft.gift] : []}
              max={1}
              onChange={(chosen) => set({ gift: chosen[0] })}
            />
          )}

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
              {draft.fullPriceOnly && coverage.onSaleSkipped > 0 && (
                <span
                  className={`mt-2 block rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    coverage.eligible === 0 ? "bg-coral-100 text-coral-700" : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {coverage.eligible === 0
                    ? `⚠ Every one of your ${coverage.onSaleSkipped} products has a "was" price, so with this ticked the offer would apply to nothing and customers would never see it. Untick it.`
                    : `${coverage.onSaleSkipped} of your products have a "was" price and won't count — ${coverage.eligible} will.`}
                </span>
              )}
            </span>
          </label>

          {/* 3 — which products (a bundle names its own) */}
          <div className={kind === "bundle" ? "hidden" : ""}>
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
                <ProductPicker
                  key={preset?.nonce ?? 0}
                  products={products}
                  categories={categories}
                  initial={preset?.productIds ?? []}
                />
              </div>
            )}
          </div>

          {/* Limits and a private coupon code */}
          <details className="rounded-2xl border border-sand-200 bg-sand-50 p-4" open={Boolean(draft.code || draft.maxUses || draft.budget)}>
            <summary className="cursor-pointer text-sm font-bold text-ocean-800">
              🔒 Coupon code &amp; limits (optional)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="offer-code" className="label">Only with this code</label>
                <input
                  id="offer-code"
                  value={draft.code ?? ""}
                  onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || undefined })}
                  placeholder="e.g. SAHRA15"
                  className="input uppercase"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  A private deal for your Instagram or WhatsApp followers — no badge on your products.
                </p>
              </div>
              {numField("maxUses", "Stop after this many orders", { min: 1 })}
              {numField("budget", "Stop when customers have saved", { prefix: "$", min: 1 })}
            </div>
          </details>

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
              <label htmlFor="offer-start" className="label">Starts (optional, Mogadishu time)</label>
              <input id="offer-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="offer-end" className="label">Ends (optional, Mogadishu time)</label>
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
              <p className="mt-3 text-sm text-slate-500">
                {products.length === 0
                  ? "Add products to your shop to see an example."
                  : draft.fullPriceOnly && coverage.eligible === 0
                    ? "None of your products qualify — they all have a \"was\" price. Untick \"Full-price items only\"."
                    : "Choose the products for this offer to see an example."}
              </p>
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

/** Pick products by name — for a bundle's members or the free gift. */
function ProductChooser({
  label,
  products,
  chosen,
  max,
  onChange,
}: {
  label: string;
  products: Product[];
  chosen: OfferProductRef[];
  max: number;
  onChange: (chosen: OfferProductRef[]) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? products.filter((p) => p.name.toLowerCase().includes(q) && !chosen.some((c) => c.productId === p.id)).slice(0, 8)
    : [];
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {chosen.map((c) => (
          <span key={c.productId} className="flex items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-900 ring-1 ring-ocean-200">
            {c.name}
            {typeof c.price === "number" && <span className="text-slate-500">{money(c.price)}</span>}
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              onClick={() => onChange(chosen.filter((x) => x.productId !== c.productId))}
              className="text-slate-400 hover:text-coral-600"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {chosen.length < max && (
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your products…"
            className="input"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-sand-200 bg-white shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(max === 1 ? [toRef(p)] : [...chosen, toRef(p)]);
                      setQuery("");
                    }}
                    className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sand-50"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-slate-500">{money(p.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
