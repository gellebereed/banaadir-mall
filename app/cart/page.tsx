"use client";

import Link from "next/link";
import { useState } from "react";
import ProductImage from "@/components/ProductImage";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";

const FREE_DELIVERY_THRESHOLD = 25;
const DELIVERY_FEE = 3;
/** Demo promo code — gives 10% off. */
const PROMO_CODE = "BANAADIR10";

export default function CartPage() {
  const { lines, subtotal, updateQty, removeFromCart } = useCart();
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState(false);

  const discount = promoApplied ? subtotal * 0.1 : 0;
  const delivery = subtotal >= FREE_DELIVERY_THRESHOLD || lines.length === 0 ? 0 : DELIVERY_FEE;
  const total = subtotal - discount + delivery;

  function applyPromo() {
    const ok = promoInput.trim().toUpperCase() === PROMO_CODE;
    setPromoApplied(ok);
    setPromoError(!ok);
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="text-7xl">🛒</span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ocean-950">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Fill it with things you love — flash deals are waiting.
        </p>
        <Link href="/products" className="btn-primary mt-6">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold text-ocean-950">
        Shopping Cart{" "}
        <span className="text-lg font-semibold text-slate-400">
          ({lines.length} item{lines.length === 1 ? "" : "s"})
        </span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Cart lines */}
        <div className="space-y-3 self-start">
          {lines.map((line) => (
            <div key={line.productId} className="card flex gap-4 p-4">
              <Link href={`/product/${line.product.slug}`} className="shrink-0">
                <ProductImage
                  product={line.product}
                  iconClass="text-4xl"
                  className="h-24 w-24 rounded-xl"
                />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/product/${line.product.slug}`}
                    className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-ocean-700"
                  >
                    {line.product.name}
                  </Link>
                  <button
                    aria-label="Remove from cart"
                    onClick={() => removeFromCart(line.productId)}
                    className="text-slate-300 transition hover:text-coral-500"
                  >
                    ✕
                  </button>
                </div>
                {(line.color || line.size) && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {[line.color, line.size].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center rounded-full border border-sand-200">
                    <button
                      aria-label="Decrease quantity"
                      onClick={() => updateQty(line.productId, line.qty - 1)}
                      className="h-8 w-8 rounded-full text-sm font-bold text-slate-600 hover:bg-sand-100"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">
                      {line.qty}
                    </span>
                    <button
                      aria-label="Increase quantity"
                      onClick={() => updateQty(line.productId, line.qty + 1)}
                      className="h-8 w-8 rounded-full text-sm font-bold text-slate-600 hover:bg-sand-100"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-display text-lg font-bold text-ocean-950">
                    {money(line.product.price * line.qty)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <aside className="card sticky top-40 self-start p-5">
          <h2 className="font-display text-lg font-bold text-ocean-950">Order Summary</h2>

          {/* Promo code */}
          <div className="mt-4 flex gap-2">
            <input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              placeholder="Promo code"
              className="input !py-2.5"
            />
            <button
              onClick={applyPromo}
              className="shrink-0 rounded-xl bg-ocean-700 px-4 text-sm font-bold text-white hover:bg-ocean-800"
            >
              Apply
            </button>
          </div>
          {promoApplied && (
            <p className="mt-1.5 text-xs font-semibold text-emerald-600">
              ✓ {PROMO_CODE} applied — 10% off
            </p>
          )}
          {promoError && (
            <p className="mt-1.5 text-xs font-semibold text-coral-600">
              Invalid code. Hint: try {PROMO_CODE}
            </p>
          )}

          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold">{money(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <dt>Discount (10%)</dt>
                <dd className="font-semibold">−{money(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Delivery</dt>
              <dd className="font-semibold">
                {delivery === 0 ? (
                  <span className="text-emerald-600">Free</span>
                ) : (
                  money(delivery)
                )}
              </dd>
            </div>
            {delivery > 0 && (
              <p className="rounded-lg bg-mango-50 px-3 py-2 text-xs text-mango-800">
                Add {money(FREE_DELIVERY_THRESHOLD - subtotal)} more for free
                delivery 🚚
              </p>
            )}
            <div className="flex justify-between border-t border-sand-200 pt-3 text-base">
              <dt className="font-bold text-ocean-950">Total</dt>
              <dd className="font-display text-xl font-extrabold text-ocean-950">
                {money(total)}
              </dd>
            </div>
          </dl>

          <Link href="/checkout" className="btn-primary mt-5 w-full">
            Proceed to Checkout →
          </Link>
          <Link
            href="/products"
            className="mt-3 block text-center text-sm font-semibold text-ocean-700 hover:underline"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
