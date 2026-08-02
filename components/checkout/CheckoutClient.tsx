"use client";

/**
 * Checkout: delivery details -> payment method -> review -> success.
 * Fully supports local & global orders with country selection, complete Somali city dropdown,
 * auto-location detection, and address memory.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductImage from "@/components/ProductImage";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import type { MarketingSettings } from "@/lib/types";
import { COUNTRIES, GLOBAL_CITIES, SOMALI_REGIONS_CITIES } from "@/lib/data/locations";
import { detectUserLocation } from "@/lib/detect-location";

const PAYMENT_METHODS = [
  { id: "evc", icon: "📲", name: "EVC Plus", note: "Pay from your Hormuud mobile money" },
  { id: "zaad", icon: "📱", name: "Zaad", note: "Pay from your Telesom Zaad wallet" },
  { id: "edahab", icon: "💳", name: "eDahab", note: "Pay from your Somtel eDahab wallet" },
  { id: "cod", icon: "💵", name: "Cash on Delivery", note: "Pay when your order arrives" },
] as const;

export default function CheckoutClient({ settings }: { settings: MarketingSettings }) {
  const { fee, freeThreshold, estimate } = settings.delivery;
  const { lines, subtotal, clearCart } = useCart();
  const [payment, setPayment] = useState<string>("evc");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Delivery form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("SO");
  const [city, setCity] = useState("Mogadishu (Xamar)");
  const [customCity, setCustomCity] = useState("");
  const [district, setDistrict] = useState("");
  const [notes, setNotes] = useState("");

  // Location detection states
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  // Load saved delivery address on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("banaadir_delivery_address");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) setName(parsed.name);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.countryCode) setCountryCode(parsed.countryCode);
        if (parsed.city) setCity(parsed.city);
        if (parsed.customCity) setCustomCity(parsed.customCity);
        if (parsed.district) setDistrict(parsed.district);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Handle location auto-detection
  async function handleAutoDetectLocation() {
    setIsDetecting(true);
    setDetectStatus("Detecting location…");

    const loc = await detectUserLocation();

    setIsDetecting(false);
    if (loc) {
      // Find matching country code or default to SO
      const matchedCountry = COUNTRIES.find((c) => c.code === loc.countryCode) ? loc.countryCode : "SO";
      setCountryCode(matchedCountry);

      if (matchedCountry === "SO") {
        // Try to match Somali city
        const somaliCities = SOMALI_REGIONS_CITIES.flatMap((r) => r.cities);
        const match = somaliCities.find((c) => c.toLowerCase().includes(loc.city.toLowerCase()));
        if (match) {
          setCity(match);
        } else {
          setCity("Other");
          setCustomCity(loc.city);
        }
      } else {
        setCustomCity(loc.city);
      }

      if (loc.district) {
        setDistrict(loc.district);
      }

      setDetectStatus(`✓ Location filled: ${loc.city}, ${loc.countryName}`);
      setTimeout(() => setDetectStatus(null), 5000);
    } else {
      setDetectStatus("⚠️ Could not auto-detect location. Please select manually.");
      setTimeout(() => setDetectStatus(null), 4000);
    }
  }

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  const globalCityOptions = GLOBAL_CITIES[countryCode] || [];

  const delivery = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : fee;
  const total = subtotal + delivery;

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const orderId = `BM-${Math.floor(10000 + Math.random() * 90000)}`;
    const fullPhone = `${selectedCountry.phoneCode} ${phone}`;
    const destinationCity = city === "Other" ? customCity : city;
    const fullAddress = `${district ? district + ", " : ""}${destinationCity}, ${selectedCountry.name}`;

    // Save address to localStorage for future orders
    try {
      localStorage.setItem(
        "banaadir_delivery_address",
        JSON.stringify({
          name,
          phone,
          countryCode,
          city,
          customCity,
          district,
        })
      );

      // Save order to user's order history
      const existingUserOrders = JSON.parse(localStorage.getItem("banaadir_user_orders") || "[]");
      const newOrderEntry = {
        id: orderId,
        date: new Date().toISOString().slice(0, 10),
        customer: name,
        phone: fullPhone,
        city: destinationCity,
        address: fullAddress,
        total,
        status: "pending",
        items: lines.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          price: l.product.price,
          qty: l.qty,
          store: l.product.store,
          image: l.product.images?.[0] || l.product.art?.from,
          selectedColor: l.color,
          selectedSize: l.size,
        })),
      };
      localStorage.setItem("banaadir_user_orders", JSON.stringify([newOrderEntry, ...existingUserOrders]));
    } catch {
      // Ignore storage errors
    }

    try {
      const { submitOrderAction } = await import("@/app/actions");
      await submitOrderAction({
        id: orderId,
        customerName: name,
        customerPhone: fullPhone,
        address: fullAddress,
        city: destinationCity,
        items: lines.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          price: l.product.price,
          qty: l.qty,
          store: l.product.store,
          image: l.product.images?.[0],
        })),
        subtotal,
        deliveryFee: delivery,
        total,
        paymentMethod: payment,
      });
    } catch (err) {
      console.warn("Order submission sync warning:", err);
    }

    setPlacedOrderId(orderId);
    clearCart();
    setIsSubmitting(false);
    window.scrollTo({ top: 0 });
  }

  // ── Success screen ───────────────────────────────────────────────
  if (placedOrderId) {
    const waText = encodeURIComponent(
      `Hello Banaadir Mall / Vendor! 🛍️\n\nI just placed order *${placedOrderId}* on Banaadir Mall.\n\n👤 *Customer:* ${name}\n📞 *Phone:* ${selectedCountry.phoneCode} ${phone}\n📍 *Delivery:* ${city === "Other" ? customCity : city}, ${selectedCountry.name}\n💰 *Total:* $${total.toFixed(2)}\n\nPlease confirm my order delivery status. Thank you!`
    );

    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center animate-fade-up">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl shadow-sm">
          🎉
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-ocean-950">
          Order Placed Successfully!
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Thank you for shopping on Banaadir Mall. Your order number is{" "}
          <strong className="rounded-lg bg-sand-100 px-2 py-1 font-mono text-base font-bold text-ocean-900">
            {placedOrderId}
          </strong>.
        </p>

        {/* WhatsApp Seller Notification Button */}
        <div className="mt-6 w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
            ⚡ Instant Vendor Notification
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Send order confirmation directly to the vendor via WhatsApp for faster processing & live updates.
          </p>
          <a
            href={`https://wa.me/252610000000?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700"
          >
            <span>💬 Notify Vendor on WhatsApp</span>
          </a>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/track?id=${placedOrderId}`} className="btn-primary !py-2.5 text-sm">
            📦 Track Order Status
          </Link>
          <Link href="/products" className="btn-secondary !py-2.5 text-sm">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepTitle n={1} title="Delivery Details" />

              {/* Auto-location detection button */}
              <button
                type="button"
                onClick={handleAutoDetectLocation}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-full border border-ocean-300 bg-ocean-50 px-3 py-1 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-100 disabled:opacity-50"
              >
                <span>{isDetecting ? "⏳" : "📍"}</span>
                <span>{isDetecting ? "Detecting…" : "Auto-Fill My Location"}</span>
              </button>
            </div>

            {detectStatus && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 border border-emerald-200 animate-fade-up">
                {detectStatus}
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">Full name</label>
                <input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ayaan Warsame"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="phone" className="label">Phone number</label>
                <div className="flex items-center gap-2">
                  <span className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-sand-50 px-3 text-xs font-bold text-slate-600">
                    {selectedCountry.phoneCode}
                  </span>
                  <input
                    id="phone"
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="61 000 0000"
                    className="input"
                  />
                </div>
              </div>

              {/* Country Selector */}
              <div>
                <label htmlFor="country" className="label">Country</label>
                <select
                  id="country"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    if (e.target.value === "SO") {
                      setCity("Mogadishu (Xamar)");
                    } else if (GLOBAL_CITIES[e.target.value]?.length) {
                      setCity(GLOBAL_CITIES[e.target.value][0]);
                    } else {
                      setCity("Other");
                    }
                  }}
                  className="input font-medium"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* City Selector */}
              <div>
                <label htmlFor="city" className="label">City / Region</label>
                {countryCode === "SO" ? (
                  <select
                    id="city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input font-medium"
                  >
                    {SOMALI_REGIONS_CITIES.map((group) => (
                      <optgroup key={group.region} label={`── ${group.region} ──`}>
                        {group.cities.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="Other">Other City / Town (Custom)</option>
                  </select>
                ) : globalCityOptions.length > 0 ? (
                  <select
                    id="city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input font-medium"
                  >
                    {globalCityOptions.map((gc) => (
                      <option key={gc} value={gc}>
                        {gc}
                      </option>
                    ))}
                    <option value="Other">Other City (Type below)</option>
                  </select>
                ) : (
                  <input
                    id="cityInput"
                    required
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Enter city / town name"
                    className="input"
                  />
                )}
              </div>

              {/* Custom City input if 'Other' is selected */}
              {(city === "Other" || (countryCode === "SO" && city === "Other")) && (
                <div className="sm:col-span-2">
                  <label htmlFor="customCity" className="label">Specify City / Town Name</label>
                  <input
                    id="customCity"
                    required
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="e.g. Afmadow, Harardhere, Qoryoley..."
                    className="input"
                  />
                </div>
              )}

              <div>
                <label htmlFor="district" className="label">District / Neighbourhood / Area</label>
                <input
                  id="district"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Hodan, near KM4 / Eastleigh / Garissa Road"
                  className="input"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="notes" className="label">
                  Delivery notes <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Landmarks, house number, best time to deliver…"
                  className="input resize-none"
                />
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
