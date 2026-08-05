"use client";

/**
 * Checkout: delivery details -> payment method -> review -> success.
 * Fully supports local & global orders with country selection, complete Somali city dropdown,
 * auto-location detection, and address memory.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import OrderConfirmation, {
  type PlacedOrder,
  type PlacedParcel,
} from "@/components/checkout/OrderConfirmation";
import ProductImage from "@/components/ProductImage";
import { useReco } from "@/components/reco/RecoProvider";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import type { CartLineRef } from "@/lib/reco/types";
import { scopedKey } from "@/lib/storage-scope";
import { groupByStore, vendorOrderIds } from "@/lib/order-utils";
import { defaultVariant, findVariant, variantLabel } from "@/lib/product-utils";
import type { MarketingSettings, Store } from "@/lib/types";
import { COUNTRIES, GLOBAL_CITIES, SOMALI_REGIONS_CITIES } from "@/lib/data/locations";
import { detectUserLocation } from "@/lib/detect-location";

const PAYMENT_METHODS = [
  { id: "evc", icon: "📲", name: "EVC Plus", note: "Pay from your Hormuud mobile money" },
  { id: "zaad", icon: "📱", name: "Zaad", note: "Pay from your Telesom Zaad wallet" },
  { id: "edahab", icon: "💳", name: "eDahab", note: "Pay from your Somtel eDahab wallet" },
  { id: "cod", icon: "💵", name: "Cash on Delivery", note: "Pay when your order arrives" },
] as const;

export default function CheckoutClient({
  settings,
  stores,
}: {
  settings: MarketingSettings;
  stores: Store[];
}) {
  const { fee, freeThreshold, estimate } = settings.delivery;
  const { lines, subtotal, clearCart, scope } = useCart();
  /*
   * Saved delivery details and the browser-side order history, namespaced
   * per account. Unscoped, the next person to sign in on a shared phone
   * got the previous person's name, phone number and address pre-filled
   * into their checkout — a disclosure, and a misdelivery waiting to
   * happen. See lib/storage-scope.ts.
   */
  const addressKey = scopedKey("banaadir_delivery_address", scope);
  const ordersKey = scopedKey("banaadir_user_orders", scope);
  const { trackPurchase } = useReco();
  const [payment, setPayment] = useState<string>("evc");
  /**
   * What was bought, kept for the confirmation screen's recommendations.
   * The cart is empty by then, so "goes with what you just ordered" has
   * nothing to work from otherwise.
   */
  const [purchased, setPurchased] = useState<CartLineRef[]>([]);
  /**
   * A full snapshot of what was ordered, captured BEFORE the cart is
   * cleared. The confirmation screen needs the items to build each
   * vendor's WhatsApp message, and by the time it renders `lines` is
   * already empty — which is why the old screen could only ever send a
   * message with no items in it.
   */
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  // Delivery form states
  const [name, setName] = useState("");
  /**
   * Optional, and the reason it exists: an order is tied to the person who
   * placed it by email. Matching on name alone means every customer called
   * "Ahmed" shares an order history.
   */
  const [email, setEmail] = useState("");
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
      const saved = localStorage.getItem(addressKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) setName(parsed.name);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.countryCode) setCountryCode(parsed.countryCode);
        if (parsed.city) setCity(parsed.city);
        if (parsed.customCity) setCustomCity(parsed.customCity);
        if (parsed.district) setDistrict(parsed.district);
      }
    } catch {
      // Ignore storage errors
    }
  }, [addressKey]);

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
        addressKey,
        JSON.stringify({
          name,
          email,
          phone,
          countryCode,
          city,
          customCity,
          district,
        })
      );

      // Save order to user's order history
      const existingUserOrders = JSON.parse(localStorage.getItem(ordersKey) || "[]");
      const newOrderEntry = {
        id: orderId,
        date: new Date().toISOString().slice(0, 10),
        customer: name,
        // Stored alongside the name because the account page matches on it
        // first — without it, this browser-side copy can only ever be found
        // by name, which is not unique.
        email,
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
          // Captured now so tracking can name the shop properly later,
          // without depending on the order having reached the server.
          storeName: stores.find((s) => s.slug === l.product.store)?.name,
          image: l.product.images?.[0] || l.product.art?.from,
          selectedColor: l.color,
          selectedSize: l.size,
        })),
      };
      localStorage.setItem(ordersKey, JSON.stringify([newOrderEntry, ...existingUserOrders]));
    } catch {
      // Ignore storage errors
    }

    // Parcels as the SERVER resolved them — authoritative, because it looks
    // every product up in the catalogue instead of trusting a cart snapshot
    // that may carry no store at all.
    let serverParcels: PlacedParcel[] | undefined;

    try {
      const { submitOrderAction } = await import("@/app/actions");
      const result = await submitOrderAction({
        id: orderId,
        customerName: name,
        customerPhone: fullPhone,
        customerEmail: email,
        address: fullAddress,
        city: destinationCity,
        items: lines.map((l) => {
          const variant = findVariant(l.product, l.color, l.size) ?? defaultVariant(l.product);
          return {
            productId: l.product.id,
            name: l.product.name,
            price: l.product.price,
            qty: l.qty,
            store: l.product.store,
            image: l.product.images?.[0],
            // Carried through to the order record so the picker, the
            // tracking page and the vendor's message all agree on which
            // colour and size was actually bought.
            selectedColor: l.color,
            selectedSize: l.size,
            reference: variant?.sku || l.product.internalReference,
          };
        }),
        subtotal,
        deliveryFee: delivery,
        total,
        paymentMethod: payment,
      });
      if (result?.parcels?.length) serverParcels = result.parcels;
    } catch (err) {
      console.warn("Order submission sync warning:", err);
    }

    // Snapshot the order BEFORE clearing the cart — the confirmation screen
    // builds each vendor's message from it, and `lines` is empty by then.
    const grouped = groupByStore(lines.map((l) => ({ ...l, store: l.product.store })));
    const parcelIds = vendorOrderIds(orderId, [...grouped.keys()]);
    const paymentLabel =
      PAYMENT_METHODS.find((m) => m.id === payment)?.name ?? payment;

    setPlacedOrder({
      baseId: orderId,
      placedAt: new Date().toISOString(),
      customerName: name,
      customerPhone: fullPhone,
      address: fullAddress,
      city: destinationCity,
      paymentLabel,
      subtotal,
      delivery,
      total,
      // Fall back to the local split only when the server call failed —
      // offline, or a network blip. It is the same shape, just derived from
      // data the browser already had.
      parcels: serverParcels ?? [...grouped.entries()].map(([storeSlug, storeLines]) => {
        const store = stores.find((s) => s.slug === storeSlug);
        return {
          storeSlug,
          // A store missing from the list (deactivated mid-checkout) still
          // gets a readable name rather than a raw slug.
          storeName: store?.name ?? storeSlug.replace(/-/g, " "),
          storeIcon: store?.icon ?? "🏪",
          storeLogo: store?.logo,
          whatsapp: store?.whatsapp,
          orderId: parcelIds.get(storeSlug) ?? orderId,
          subtotal: storeLines.reduce((sum, l) => sum + l.product.price * l.qty, 0),
          lines: storeLines.map((l) => {
            // The variant the customer actually chose decides both the
            // options label and which SKU the vendor should pick.
            const variant =
              findVariant(l.product, l.color, l.size) ?? defaultVariant(l.product);
            return {
              name: l.product.name,
              qty: l.qty,
              price: l.product.price,
              options: variant ? variantLabel(variant) : undefined,
              reference: variant?.sku || l.product.internalReference,
              image: l.product.images?.[0],
            };
          }),
        };
      }),
    });

    // Record the purchase BEFORE the cart is cleared — a completed order is
    // the strongest and longest-lived taste signal there is, and it is the
    // only one the tracker cannot infer from a cart diff (an emptied cart
    // looks identical whether it was bought or abandoned).
    setPurchased(lines.map((l) => ({ productId: l.productId, qty: l.qty })));
    trackPurchase(lines.map((l) => l.productId));

    clearCart();
    setIsSubmitting(false);
    window.scrollTo({ top: 0 });
  }

  // ── Success screen ───────────────────────────────────────────────
  if (placedOrder) {
    return (
      <OrderConfirmation
        order={placedOrder}
        deliveryEstimate={estimate}
        purchased={purchased}
      />
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
                <label htmlFor="email" className="label">
                  Email <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                />
                {/* Not required — plenty of customers here shop without one.
                    When given, it is what ties this order to an account, so
                    it appears under "My Orders" instead of only being
                    findable by its order number. */}
                <p className="mt-1 text-[11px] text-slate-400">
                  Lets you see this order in your account.
                </p>
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
