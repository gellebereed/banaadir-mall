"use client";

import { useActionState, useMemo, useState } from "react";
import { applyPrice, makeBatch, saveRecipe, type PosState } from "@/app/vendor/pos/actions";
import { money } from "@/lib/format";
import {
  batchCapacity,
  compatibleUnits,
  marginFor,
  planProduction,
  recipeCost,
  suggestPrice,
  trim,
  unitLabel,
} from "@/lib/pos";
import type { PosSettings, Product, Recipe, RecipeItem, Supply, SupplyUnit } from "@/lib/types";

const EMPTY: PosState = { ok: false, message: "" };

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHAT ONE BATCH IS MADE OF
 * ─────────────────────────────────────────────────────────────────────────
 * The screen this whole feature exists for, and the reason it is drawn as
 * a SUM rather than as a table:
 *
 *     🌾 Flour 2kg  +  🥚 Eggs 6  +  🥛 Milk 500ml  =  🥐 24 Cinnamon Rolls
 *
 * A table of ingredients with a cost column is a spreadsheet, and the
 * person this is for has already decided they do not use spreadsheets. The
 * same numbers written as an equation say the thing that actually matters
 * — these go in, that many come out, each one costs this — in a shape
 * anybody can read without being taught it.
 *
 * Every figure under the chips is live: change a quantity and the cost per
 * roll and the suggested price move as you type, before anything is saved.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function RecipeBuilder({
  recipe,
  product,
  products,
  supplies,
  settings,
}: {
  /** Absent when writing a new one. */
  recipe?: Recipe;
  product?: Product;
  /** The shop's products, to choose what this recipe makes. */
  products: Product[];
  supplies: Supply[];
  settings: PosSettings;
}) {
  const [saveState, saveAction, saving] = useActionState<PosState, FormData>(
    saveRecipe,
    EMPTY,
  );

  const [productId, setProductId] = useState(recipe?.productId ?? product?.id ?? "");
  const [name, setName] = useState(recipe?.name ?? "");
  const [items, setItems] = useState<RecipeItem[]>(recipe?.items ?? []);
  const [yieldQty, setYieldQty] = useState(String(recipe?.yield ?? 12));
  const [overhead, setOverhead] = useState(String(recipe?.overhead ?? 0));

  const supplyMap = useMemo(
    () => new Map(supplies.map((supply) => [supply.id, supply])),
    [supplies],
  );

  const chosenProduct = products.find((p) => p.id === productId);

  /** The recipe as it stands in the form — costed live, not on save. */
  const draft: Recipe = useMemo(
    () => ({
      id: recipe?.id ?? "draft",
      store: recipe?.store ?? "",
      productId,
      name: name || chosenProduct?.name || "New recipe",
      items,
      yield: Number(yieldQty) || 0,
      overhead: Number(overhead) || 0,
    }),
    [recipe, productId, name, items, yieldQty, overhead, chosenProduct],
  );

  const cost = useMemo(() => recipeCost(draft, supplyMap), [draft, supplyMap]);
  const capacity = useMemo(() => batchCapacity(draft, supplyMap), [draft, supplyMap]);
  const suggested = suggestPrice(cost.unitCost, settings);
  const currentMargin = chosenProduct
    ? marginFor(chosenProduct.price, cost.unitCost)
    : undefined;

  const unused = supplies.filter(
    (supply) => !items.some((item) => item.supplyId === supply.id),
  );

  function addItem(supply: Supply) {
    setItems((current) => [
      ...current,
      { supplyId: supply.id, qty: 1, unit: supply.unit },
    ]);
  }

  function update(index: number, patch: Partial<RecipeItem>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function remove(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <form action={saveAction} className="space-y-4">
        {recipe && <input type="hidden" name="id" value={recipe.id} />}
        <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="yield" value={yieldQty} />
        <input type="hidden" name="overhead" value={overhead} />
        <input type="hidden" name="name" value={name} />

        {/* ── What it makes ─────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="font-display font-bold text-ocean-950">What are you making?</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Pick the thing you sell. Anything you make will be added to its
            stock.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                The product
              </span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="input !py-2.5"
              >
                <option value="">— choose —</option>
                {products.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <span className="mt-1 block text-xs text-coral-600">
                  Add a product first — that is the thing customers buy.
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                Call this recipe{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={chosenProduct?.name ?? "Morning tray"}
                className="input !py-2.5"
              />
            </label>
          </div>
        </section>

        {/* ── The sum ───────────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="font-display font-bold text-ocean-950">
            What goes into one batch?
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Add each ingredient and how much of it one batch uses.
          </p>

          {/* The equation. */}
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-sand-50 to-ocean-50/40 p-4">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Nothing yet — tap an ingredient below to start.
              </p>
            ) : (
              <div className="flex flex-wrap items-stretch justify-center gap-2">
                {items.map((item, index) => {
                  const supply = supplyMap.get(item.supplyId);
                  const line = cost.lines[index];
                  return (
                    <div key={`${item.supplyId}-${index}`} className="flex items-stretch gap-2">
                      {index > 0 && (
                        <span
                          aria-hidden
                          className="flex items-center font-display text-2xl font-extrabold text-slate-300"
                        >
                          +
                        </span>
                      )}

                      <div className="relative w-[136px] rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-sand-200">
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          aria-label={`Remove ${supply?.name ?? "ingredient"}`}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-400 shadow ring-1 ring-sand-200 transition hover:bg-coral-500 hover:text-white"
                        >
                          ✕
                        </button>

                        <span className="text-2xl">{supply?.icon || "🧂"}</span>
                        <p className="mt-1 truncate text-xs font-bold text-slate-800">
                          {supply?.name ?? "Missing"}
                        </p>

                        <div className="mt-2 flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.qty}
                            onChange={(e) =>
                              update(index, { qty: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-sand-200 px-1.5 py-1 text-center text-sm font-bold text-ocean-950 outline-none focus:border-ocean-500"
                          />
                          <select
                            value={item.unit}
                            onChange={(e) =>
                              update(index, { unit: e.target.value as SupplyUnit })
                            }
                            className="rounded-lg border border-sand-200 px-1 py-1 text-[11px] outline-none focus:border-ocean-500"
                          >
                            {(supply ? compatibleUnits(supply.unit) : [item.unit]).map(
                              (option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ),
                            )}
                          </select>
                        </div>

                        <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                          {line?.problem ? (
                            <span className="text-coral-600">needs a price</span>
                          ) : (
                            money(line?.cost ?? 0)
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* = the output */}
                <div className="flex items-stretch gap-2">
                  <span
                    aria-hidden
                    className="flex items-center font-display text-2xl font-extrabold text-slate-300"
                  >
                    =
                  </span>
                  <div className="w-[150px] rounded-2xl bg-ocean-950 p-3 text-center text-white shadow-md">
                    <span className="text-2xl">{chosenProduct?.icon || "🥐"}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={yieldQty}
                      onChange={(e) => setYieldQty(e.target.value)}
                      aria-label="How many one batch makes"
                      className="mt-1 w-full rounded-lg bg-white/15 px-1 py-1 text-center font-display text-xl font-extrabold text-white outline-none ring-1 ring-white/20 focus:ring-white/50"
                    />
                    <p className="mt-1 truncate text-[11px] font-semibold text-ocean-100">
                      {chosenProduct?.name ?? "your product"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Add ingredients */}
          {unused.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Add from your pantry
              </p>
              <div className="flex flex-wrap gap-2">
                {unused.map((supply) => (
                  <button
                    key={supply.id}
                    type="button"
                    onClick={() => addItem(supply)}
                    className="flex items-center gap-1.5 rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ocean-400 hover:text-ocean-700"
                  >
                    <span aria-hidden>{supply.icon || "🧂"}</span>
                    {supply.name}
                    <span className="text-slate-400">
                      {trim(supply.stock)} {supply.unit}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {supplies.length === 0 && (
            <p className="mt-4 rounded-xl bg-mango-50 px-4 py-3 text-sm text-mango-900">
              Your pantry is empty. Add what you buy on the{" "}
              <strong>Pantry</strong> screen first — a recipe needs ingredients
              with prices before it can tell you anything.
            </p>
          )}

          {/* Overhead — the reason a kitchen can work all day for nothing. */}
          <label className="mt-4 block border-t border-sand-100 pt-4">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Anything else one batch costs{" "}
              <span className="font-normal text-slate-400">
                (gas, boxes, your time — optional)
              </span>
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={overhead}
              onChange={(e) => setOverhead(e.target.value)}
              placeholder="120"
              className="input !py-2 text-sm sm:max-w-xs"
            />
          </label>

          {cost.problems.length > 0 && (
            <ul className="mt-3 space-y-1">
              {cost.problems.map((problem) => (
                <li key={problem} className="text-xs font-semibold text-coral-600">
                  ⚠ {problem}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── The answer ────────────────────────────────────────── */}
        <section className="card border-2 border-ocean-100 bg-ocean-50/40 p-5">
          <h2 className="font-display font-bold text-ocean-950">
            So what does one cost you?
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="One batch costs" value={money(cost.batchCost)} />
            <Figure
              label={`Each of the ${trim(draft.yield)}`}
              value={money(cost.unitCost)}
              tone="dark"
            />
            <Figure
              label="Sell each at"
              value={suggested > 0 ? money(suggested) : "—"}
              tone="good"
              note={`${settings.targetMarginPct}% profit`}
            />
            <Figure
              label="You keep"
              value={suggested > 0 ? money(suggested - cost.unitCost) : "—"}
              note="per item"
            />
          </div>

          {/* What the shelf can support right now. */}
          {items.length > 0 && draft.yield > 0 && (
            <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-sand-200">
              {capacity.batches > 0 ? (
                <>
                  🥣 You have enough for{" "}
                  <strong className="text-ocean-950">
                    {capacity.batches} batch{capacity.batches === 1 ? "" : "es"}
                  </strong>{" "}
                  — that is {capacity.units} {chosenProduct?.name ?? "items"}.
                  {capacity.limitedBy && (
                    <>
                      {" "}
                      The <strong>{capacity.limitedBy.supply.name}</strong> runs out
                      first.
                    </>
                  )}
                </>
              ) : (
                <>
                  🛒 Not enough in the pantry for a full batch
                  {capacity.limitedBy && (
                    <>
                      {" "}
                      — you need more{" "}
                      <strong>{capacity.limitedBy.supply.name}</strong>
                    </>
                  )}
                  .
                </>
              )}
            </p>
          )}

          {/* How the current shelf price compares. */}
          {chosenProduct && cost.unitCost > 0 && currentMargin && (
            <div
              className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                currentMargin.belowCost
                  ? "bg-coral-100/60 text-coral-800"
                  : "bg-white text-slate-600 ring-1 ring-sand-200"
              }`}
            >
              {currentMargin.belowCost ? (
                <>
                  ⚠ You are selling {chosenProduct.name} at{" "}
                  <strong>{money(chosenProduct.price)}</strong>, which is{" "}
                  <strong>{money(-currentMargin.profit)} less</strong> than it costs
                  to make. Every one you sell loses money.
                </>
              ) : (
                <>
                  Right now you sell it at{" "}
                  <strong className="text-ocean-950">
                    {money(chosenProduct.price)}
                  </strong>{" "}
                  and keep <strong>{money(currentMargin.profit)}</strong> (
                  {currentMargin.pct.toFixed(0)}%).
                </>
              )}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={saving || !productId || items.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Saving…" : recipe ? "Save changes" : "Save this recipe"}
          </button>
          {saveState.message && (
            <p
              role="status"
              className={`text-sm font-semibold ${
                saveState.ok ? "text-emerald-700" : "text-coral-700"
              }`}
            >
              {saveState.ok ? "✓ " : "✕ "}
              {saveState.message}
            </p>
          )}
        </div>
      </form>

      {/* ── After it is saved: price it, and bake it ──────────────── */}
      {recipe && chosenProduct && (
        <>
          <PriceCard
            product={chosenProduct}
            suggested={suggested}
            unitCost={cost.unitCost}
          />
          <BakeCard
            recipe={recipe}
            product={chosenProduct}
            supplies={supplyMap}
            maxBatches={capacity.batches}
          />
        </>
      )}
    </div>
  );
}

/* ── Set the price ──────────────────────────────────────────────────── */

function PriceCard({
  product,
  suggested,
  unitCost,
}: {
  product: Product;
  suggested: number;
  unitCost: number;
}) {
  const [state, formAction, pending] = useActionState<PosState, FormData>(applyPrice, EMPTY);
  const [price, setPrice] = useState(String(product.price));

  const margin = marginFor(Number(price) || 0, unitCost);

  return (
    <form action={formAction} className="card p-5">
      <input type="hidden" name="productId" value={product.id} />
      <h2 className="font-display font-bold text-ocean-950">What will you charge?</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        This is your shop — the suggestion is only a starting point. Whatever
        you set here is the price at the counter and on the website.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Your price
          </span>
          <input
            name="price"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input !py-2.5 w-36 font-display text-lg font-extrabold"
          />
        </label>

        {suggested > 0 && (
          <button
            type="button"
            onClick={() => setPrice(String(suggested))}
            className="btn-secondary !py-2.5 text-sm"
          >
            Use {money(suggested)}
          </button>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary !py-2.5 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Set the price"}
        </button>
      </div>

      {Number(price) > 0 && unitCost > 0 && (
        <p
          className={`mt-3 text-sm ${
            margin.belowCost ? "font-semibold text-coral-700" : "text-slate-600"
          }`}
        >
          {margin.belowCost
            ? `⚠ That is below the ${money(unitCost)} it costs you to make.`
            : `You keep ${money(margin.profit)} of every ${money(margin.price)} — ${margin.pct.toFixed(0)}%.`}
        </p>
      )}

      {state.message && (
        <p
          role="status"
          className={`mt-2 text-sm font-semibold ${
            state.ok ? "text-emerald-700" : "text-coral-700"
          }`}
        >
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      )}
    </form>
  );
}

/* ── Make a batch ───────────────────────────────────────────────────── */

function BakeCard({
  recipe,
  product,
  supplies,
  maxBatches,
}: {
  recipe: Recipe;
  product: Product;
  supplies: Map<string, Supply>;
  maxBatches: number;
}) {
  const [state, formAction, pending] = useActionState<PosState, FormData>(makeBatch, EMPTY);
  const [batches, setBatches] = useState(1);

  // The same function the server re-runs on submit, so what is shown here
  // and what actually happens cannot disagree.
  const plan = useMemo(
    () => planProduction(recipe, supplies, batches),
    [recipe, supplies, batches],
  );

  return (
    <form action={formAction} className="card p-5">
      <input type="hidden" name="recipeId" value={recipe.id} />
      <input type="hidden" name="batches" value={batches} />

      <h2 className="font-display font-bold text-ocean-950">Made a batch?</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        This takes the ingredients off your shelf and puts the finished items
        up for sale.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-full border border-sand-200 bg-white">
          <button
            type="button"
            onClick={() => setBatches((n) => Math.max(1, n - 1))}
            aria-label="One fewer batch"
            className="h-11 w-11 rounded-full text-xl font-bold text-slate-600 hover:bg-sand-100"
          >
            −
          </button>
          <span className="w-12 text-center font-display text-lg font-extrabold tabular-nums">
            {batches}
          </span>
          <button
            type="button"
            onClick={() => setBatches((n) => n + 1)}
            aria-label="One more batch"
            className="h-11 w-11 rounded-full text-xl font-bold text-slate-600 hover:bg-sand-100"
          >
            +
          </button>
        </div>

        <p className="text-sm text-slate-600">
          makes{" "}
          <strong className="font-display text-lg text-ocean-950">
            {plan.madeQty}
          </strong>{" "}
          {product.name}
          {plan.totalCost > 0 && (
            <span className="text-slate-400"> · costs {money(plan.totalCost)}</span>
          )}
        </p>
      </div>

      {/* Exactly what leaves the shelf, before confirming. */}
      {plan.consume.length > 0 && plan.blockers.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Uses{" "}
          {plan.consume
            .map((entry) => `${trim(entry.qty)} ${entry.supply.unit} ${entry.supply.name}`)
            .join(", ")}
          .
        </p>
      )}

      {plan.blockers.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.blockers.map((blocker) => (
            <li key={blocker} className="text-sm font-semibold text-coral-700">
              ⚠ {blocker}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || plan.blockers.length > 0}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? "Working…" : `Made ${plan.madeQty} — add to stock`}
        </button>
        {maxBatches > 0 && batches < maxBatches && (
          <button
            type="button"
            onClick={() => setBatches(maxBatches)}
            className="text-xs font-bold text-ocean-700 hover:underline"
          >
            Make all {maxBatches} the pantry allows
          </button>
        )}
      </div>

      {state.message && (
        <p
          role="status"
          className={`mt-3 text-sm font-semibold ${
            state.ok ? "text-emerald-700" : "text-coral-700"
          }`}
        >
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      )}
    </form>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────── */

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "dark" | "good";
}) {
  return (
    <div
      className={`rounded-2xl p-4 text-center ${
        tone === "dark"
          ? "bg-ocean-950 text-white"
          : tone === "good"
            ? "bg-emerald-50 ring-1 ring-emerald-200"
            : "bg-white ring-1 ring-sand-200"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          tone === "dark" ? "text-ocean-200" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-display text-xl font-extrabold ${
          tone === "dark" ? "text-white" : "text-ocean-950"
        }`}
      >
        {value}
      </p>
      {note && (
        <p className={`text-[11px] ${tone === "dark" ? "text-ocean-200" : "text-slate-400"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
