"use client";

import { useActionState, useMemo, useState } from "react";
import { ringUpSale, type SaleResult } from "@/app/vendor/pos/actions";
import { money } from "@/lib/format";
import { PAYMENT_LABELS, changeDue, tillTotals } from "@/lib/pos";
import type { PaymentMethod, PosSettings, Product } from "@/lib/types";

const EMPTY: SaleResult = { ok: false, message: "" };

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE TILL
 * ─────────────────────────────────────────────────────────────────────────
 * Tap the thing, see the total, take the money. That is the whole screen.
 *
 * ── Designed for one hand and a queue ────────────────────────────────────
 * Every target is at least 44px. There is no search box, no barcode field,
 * no customer lookup and no discount dialog — a shop selling four things
 * across a counter does not have time for any of them, and each one is a
 * place to get stuck in front of a waiting customer.
 *
 * The receipt after a sale is deliberately loud and slow to dismiss: the
 * change owed is the number most often got wrong in a hurry, so it fills
 * the screen until somebody acknowledges it.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function TillClient({
  products,
  settings,
}: {
  products: Product[];
  settings: PosSettings;
}) {
  const [state, formAction, pending] = useActionState<SaleResult, FormData>(
    ringUpSale,
    EMPTY,
  );

  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>(settings.methods[0] ?? "cash");
  const [cashGiven, setCashGiven] = useState("");

  const lines = useMemo(
    () =>
      products
        .filter((product) => (qtyById[product.id] ?? 0) > 0)
        .map((product) => ({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: qtyById[product.id],
        })),
    [products, qtyById],
  );

  const totals = tillTotals(lines);
  const change = changeDue(totals.total, Number(cashGiven) || 0);

  function add(product: Product) {
    setQtyById((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  }

  function sub(productId: string) {
    setQtyById((current) => {
      const next = (current[productId] ?? 0) - 1;
      if (next <= 0) {
        const { [productId]: _gone, ...rest } = current;
        return rest;
      }
      return { ...current, [productId]: next };
    });
  }

  function clear() {
    setQtyById({});
    setCashGiven("");
  }

  // ── The receipt ─────────────────────────────────────────────────────
  if (state.ok && state.orderId) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="card p-8">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
            ✓
          </span>
          <h2 className="mt-4 font-display text-2xl font-extrabold text-ocean-950">
            Sold — {money(state.total ?? 0)}
          </h2>

          {state.change !== undefined && state.change >= 0 && (
            <div className="mt-5 rounded-2xl bg-mango-50 p-5">
              <p className="text-sm font-semibold text-mango-900">Change to give back</p>
              <p className="font-display text-4xl font-extrabold text-mango-900">
                {money(state.change)}
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">Receipt {state.orderId}</p>

          <button
            onClick={() => {
              clear();
              // A full reload is the honest reset here: the stock counts on
              // every tile have just changed, and a stale tile is how the
              // counter sells the last roll twice.
              window.location.reload();
            }}
            className="btn-primary mt-6 w-full !py-4 text-lg"
          >
            Next customer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* ── What is for sale ─────────────────────────────────────── */}
      <div>
        {products.length === 0 ? (
          <div className="card p-8 text-center">
            <span className="text-4xl">📦</span>
            <p className="mt-3 font-display font-bold text-ocean-950">
              Nothing to sell yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              Add a product, then make a batch on the Recipes screen — anything
              in stock shows up here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((product) => {
              const qty = qtyById[product.id] ?? 0;
              const left = (product.stock ?? 0) - qty;
              const soldOut = left <= 0;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => !soldOut && add(product)}
                  disabled={soldOut}
                  className={`relative flex min-h-[112px] flex-col items-center justify-center gap-1 rounded-2xl p-3 text-center transition active:scale-95 ${
                    qty > 0
                      ? "bg-ocean-950 text-white shadow-md"
                      : soldOut
                        ? "cursor-not-allowed bg-sand-100 text-slate-400"
                        : "bg-white text-slate-800 shadow-sm ring-1 ring-sand-200 hover:ring-ocean-400"
                  }`}
                >
                  {qty > 0 && (
                    <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-mango-500 px-1.5 font-display text-sm font-extrabold text-white">
                      {qty}
                    </span>
                  )}

                  <span className="text-3xl">{product.icon || "🥐"}</span>
                  <span className="line-clamp-2 text-xs font-bold leading-tight">
                    {product.name}
                  </span>
                  <span
                    className={`font-display text-sm font-extrabold ${
                      qty > 0 ? "text-mango-300" : "text-ocean-800"
                    }`}
                  >
                    {money(product.price)}
                  </span>
                  <span
                    className={`text-[10px] ${
                      soldOut
                        ? "font-bold text-coral-600"
                        : qty > 0
                          ? "text-ocean-200"
                          : "text-slate-400"
                    }`}
                  >
                    {soldOut ? "Sold out" : `${left} left`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── The counter ──────────────────────────────────────────── */}
      <form action={formAction} className="lg:sticky lg:top-24 lg:self-start">
        <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
        <input type="hidden" name="payment" value={method} />
        <input type="hidden" name="cashGiven" value={cashGiven} />

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-sand-200 p-4">
            <h2 className="font-display font-bold text-ocean-950">This sale</h2>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-xs font-bold text-slate-400 hover:text-coral-600"
              >
                Clear
              </button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">
              Tap what the customer is buying.
            </p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {lines.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {line.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {money(line.price)} each
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sub(line.productId)}
                      aria-label={`One fewer ${line.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 text-lg font-bold text-slate-600 active:scale-95"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-display font-extrabold tabular-nums">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        add(products.find((p) => p.id === line.productId)!)
                      }
                      aria-label={`One more ${line.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 text-lg font-bold text-slate-600 active:scale-95"
                    >
                      +
                    </button>
                  </div>

                  <p className="w-16 shrink-0 text-right font-display text-sm font-extrabold text-ocean-950">
                    {money(line.price * line.qty)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-sand-200 bg-sand-50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display font-bold text-slate-600">Total</span>
              <span className="font-display text-3xl font-extrabold text-ocean-950">
                {money(totals.total)}
              </span>
            </div>

            {lines.length > 0 && (
              <>
                {/* How they are paying */}
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Paying with
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {settings.methods.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setMethod(option)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                          method === option
                            ? "bg-ocean-950 text-white"
                            : "bg-white text-slate-600 ring-1 ring-sand-200"
                        }`}
                      >
                        <span aria-hidden>{PAYMENT_LABELS[option]?.icon}</span>
                        {PAYMENT_LABELS[option]?.label ?? option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash: work out the change before they hand it over. */}
                {method === "cash" && (
                  <div className="mt-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Cash given{" "}
                        <span className="font-normal normal-case text-slate-400">
                          (optional)
                        </span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        placeholder={String(Math.ceil(totals.total / 100) * 100)}
                        className="input !py-2.5 font-display text-lg font-extrabold"
                      />
                    </label>

                    {Number(cashGiven) > 0 && (
                      <p
                        className={`mt-2 text-center font-display text-lg font-extrabold ${
                          change < 0 ? "text-coral-700" : "text-emerald-700"
                        }`}
                      >
                        {change < 0
                          ? `${money(-change)} short`
                          : `Change ${money(change)}`}
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pending || (method === "cash" && Number(cashGiven) > 0 && change < 0)}
                  className="btn-primary mt-4 w-full !py-4 text-lg disabled:opacity-50"
                >
                  {pending ? "Recording…" : `Take ${money(totals.total)}`}
                </button>
              </>
            )}

            {state.message && !state.ok && (
              <p role="status" className="mt-3 text-sm font-semibold text-coral-700">
                ✕ {state.message}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
