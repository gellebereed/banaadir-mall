"use client";

/**
 * Checkout: delivery details -> payment method -> review -> success.
 * This is a demo flow — "Place Order" clears the cart and shows a
 * confirmation with a generated order number. Wire the submit handler to
 * a real backend (e.g. create a sale.order in Odoo) when ready.
 *
 * NOTE: Real payment collection (EVC/Zaad USSD push, card gateway) must be
 * integrated server-side — never handle card numbers in this client code.
 */

import Link from "next/link";
import { useState } from "react";
import ProductImage from "@/components/ProductImage";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import type { MarketingSettings } from "@/lib/types";

const PAYMENT_METHODS = [
  { id: "evc", icon: "📲", name: "EVC Plus", note: "Pay from your Hormuud mobile money" },
  { id: "zaad", icon: "📱", name: "Zaad", note: "Pay from your Telesom Zaad wallet" },
  { id: "edahab", icon: "💳", name: "eDahab", note: "Pay from your Somtel eDahab wallet" },
  { id: "cod", icon: "💵", name: "Cash on Delivery", note: "Pay when your order arrives" },
] as const;

const CITIES = ["Mogadishu", "Hargeisa", "Kismayo", "Baidoa", "Garowe", "Bosaso", "Beledweyne", "Jowhar"];

export default function CheckoutClient({ settings }: { settings: MarketingSettings }) {
  const { fee, freeThreshold, estimate } = settings.delivery;
  const { lines, subtotal, clearCart } = useCart();
  const [payment, setPayment] = useState<string>("evc");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const delivery = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : fee;
  const total = subtotal + delivery;

  function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    // Demo: generate an order number and clear the cart.
    setPlacedOrderId(`BM-${Math.floor(10000 + Math.random() * 90000)}`);
    clearCart();
    window.scrollTo({ top: 0 });
  }

  // ── Success screen ───────────────────────────────────────────────
  if (placedOrderId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl">
          🎉
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-ocean-950">
          Order placed!
        </h1>
        <p className="mt-3 text-slate-500">
          Thank you for shopping local. Your order number is{" "}
          <strong className="text-ocean-800">{placedOrderId}</strong>. We&apos;ve
          sent the details to your phone.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/track" className="btn-secondary !py-2.5 text-sm">
            Track Order
          </Link>
          <Link href="/products" className="btn-primary !py-2.5 text-sm">
            Keep Shopping
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty cart guard ─────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="text-7xl">🧾</span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ocean-950">
          Nothing to check out
        </h1>
        <p className="mt-2 text-sm text-slate-500">Your cart is empty.</p>
        <Link href="/products" className="btn-primary mt-6">
          Browse Products
        </Link>
      </div>
    );
  }

  // ── Checkout form ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold text-ocean-950">Checkout</h1>

      <form onSubmit={placeOrder} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6 self-start">
          {/* Step 1 — delivery details */}
          <section className="card p-5 sm:p-6">
            <StepTitle n={1} title="Delivery Details" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">Full name</label>
                <input id="name" required placeholder="Ayaan Warsame" className="input" />
              </div>
              <div>
                <label htmlFor="phone" className="label">Phone number</label>
                <input id="phone" required type="tel" placeholder="+252 61 000 0000" className="input" />
              </div>
              <div>
                <label htmlFor="city" className="label">City</label>
                <select id="city" required className="input">
                  {CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="district" className="label">District / neighbourhood</label>
                <input id="district" required placeholder="Hodan, near KM4" className="input" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="label">
                  Delivery notes <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea id="notes" rows={2} placeholder="Landmarks, best time to deliver…" className="input resize-none" />
              </div>
            </div>
          </section>

          {/* Step 2 — payment method */}
          <section className="card p-5 sm:p-6">
            <StepTitle n={2} title="Payment Method" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition ${
                    payment === m.id
                      ? "border-ocean-700 bg-ocean-50"
                      : "border-sand-200 bg-white hover:border-ocean-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={m.id}
                    checked={payment === m.id}
                    onChange={() => setPayment(m.id)}
                    className="sr-only"
                  />
                  <span className="text-2xl">{m.icon}</span>
                  <span>
                    <span className="block text-sm font-bold text-ocean-950">{m.name}</span>
                    <span className="block text-xs text-slate-500">{m.note}</span>
                  </span>
                  {payment === m.id && (
                    <span className="ml-auto text-ocean-700">●</span>
                  )}
                </label>
              ))}
            </div>
            {payment !== "cod" && (
              <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-500">
                You&apos;ll receive a payment confirmation prompt on your phone
                after placing the order.
              </p>
            )}
          </section>
        </div>

        {/* Order summary */}
        <aside className="card sticky top-40 self-start p-5">
          <h2 className="font-display text-lg font-bold text-ocean-950">Your Order</h2>
          <ul className="mt-4 space-y-3">
            {lines.map((line) => (
              <li key={line.productId} className="flex items-center gap-3 text-sm">
                <ProductImage product={line.product} iconClass="text-sm" className="h-9 w-9 shrink-0 rounded-lg" sizes="36px" />
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {line.product.name}
                </span>
                <span className="shrink-0 text-slate-400">×{line.qty}</span>
                <span className="shrink-0 font-semibold">
                  {money(line.product.price * line.qty)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2.5 border-t border-sand-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-semibold">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Delivery</dt>
              <dd className="font-semibold">
                {delivery === 0 ? <span className="text-emerald-600">Free</span> : money(delivery)}
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-base">
              <dt className="font-bold text-ocean-950">Total</dt>
              <dd className="font-display text-xl font-extrabold text-ocean-950">
                {money(total)}
              </dd>
            </div>
          </dl>
          <button type="submit" className="btn-primary mt-5 w-full">
            Place Order · {money(total)}
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">
            🛡️ Protected by Banaadir Mall buyer guarantee
          </p>
        </aside>
      </form>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-lg font-bold text-ocean-950">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ocean-700 text-sm text-white">
        {n}
      </span>
      {title}
    </h2>
  );
}
