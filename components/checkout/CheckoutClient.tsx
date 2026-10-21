"use client";

/**
 * Checkout: delivery details -> payment method -> review -> success.
 * Fully supports local & global orders with country selection, complete Somali city dropdown,
 * auto-location detection, and address memory.
 */

import { deliveryTimeFor, localiseTime, readDeliveryCity, shortName } from "@/components/layout/DeliveryCity";
import { usePrefs } from "@/components/prefs/PrefsProvider";
import StoreAvatar from "@/components/StoreAvatar";
import { promoMatches, readAppliedPromo, writeAppliedPromo } from "@/lib/promo";
import { attributePurchase } from "@/lib/reco/metrics-client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import OrderConfirmation, {
  type PlacedOrder,
  type PlacedParcel,
} from "@/components/checkout/OrderConfirmation";
import ProductImage from "@/components/ProductImage";
import { CartSkeleton } from "@/components/cart/CartClient";
import { useReco } from "@/components/reco/RecoProvider";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import type { CartLineRef } from "@/lib/reco/types";
import { scopedKey } from "@/lib/storage-scope";
import {
  formatAddress,
  makeDefault,
  readAddresses,
  removeAddress,
  sortAddresses,
  upsertAddress,
  writeAddresses,
  type SavedAddress,
} from "@/lib/addresses";
import type { CheckoutDefaults } from "@/app/checkout/page";
import { groupByStore, vendorOrderIds } from "@/lib/order-utils";
import { defaultVariant, findVariant, variantLabel } from "@/lib/product-utils";
import type { MarketingSettings, Store } from "@/lib/types";
import { COUNTRIES, GLOBAL_CITIES, SOMALI_REGIONS_CITIES } from "@/lib/data/locations";
import { detectUserLocation } from "@/lib/detect-location";

const PAYMENT_METHODS = [
  { id: "evc", icon: "📲", name: "EVC Plus", note: "checkout.pay.evc" },
  { id: "zaad", icon: "📱", name: "Zaad", note: "checkout.pay.zaad" },
  { id: "edahab", icon: "💳", name: "eDahab", note: "checkout.pay.edahab" },
  { id: "cod", icon: "💵", name: "Cash on Delivery", note: "checkout.pay.cod" },
] as const;

type Field = "name" | "email" | "phone" | "city" | "district";
/** Top-to-bottom form order — the first one wrong is the one scrolled to. */
const FIELD_ORDER: Field[] = ["name", "email", "phone", "city", "district"];

export default function CheckoutClient({
  settings,
  stores,
  defaults,
}: {
  settings: MarketingSettings;
  stores: Store[];
  /** What the marketplace already knows — see app/checkout/page.tsx. */
  defaults?: CheckoutDefaults;
}) {
  const { fee, freeThreshold, estimate } = settings.delivery;
  const promo = settings.promo;
  const { t, lang } = usePrefs();
  const { lines, ready, clearCart, scope } = useCart();

  /*
   * Today's prices. The cart remembers what things cost when they were
   * added; the server charges the catalogue's current price. Asking for a
   * quote keeps the total on this page the total that gets recorded, and
   * lets a changed price be pointed out rather than discovered afterwards.
   */
  const [quoted, setQuoted] = useState<Record<string, number> | null>(null);
  const quoteKey = lines.map((l) => `${l.productId}|${l.color ?? ""}|${l.size ?? ""}`).join(",");
  useEffect(() => {
    if (!quoteKey) return;
    let live = true;
    import("@/app/actions")
      .then(({ quoteCartAction }) =>
        quoteCartAction(lines.map((l) => ({ productId: l.productId, selectedColor: l.color, selectedSize: l.size }))),
      )
      .then((quote) => live && setQuoted(quote))
      .catch(() => {
        // Offline: the cart's own prices stand; the server still decides.
      });
    return () => {
      live = false;
    };
    // `lines` is captured through quoteKey; qty changes don't move prices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);
  const priceOf = (line: (typeof lines)[number]) => quoted?.[line.productId] ?? line.product.price;
  const subtotal = lines.reduce((sum, l) => sum + priceOf(l) * l.qty, 0);
  const repriced = lines.filter(
    (l) => quoted?.[l.productId] !== undefined && Math.abs(quoted[l.productId] - l.product.price) > 0.004,
  );
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

  /*
   * Delivery form, seeded from what we already know.
   *
   * The server supplies the account's name and email, plus the phone and
   * city from their most recent order (app/checkout/page.tsx). A returning
   * customer should arrive at a form that is already filled in — every
   * field they have to retype is a place the order gets abandoned.
   */
  const [name, setName] = useState(defaults?.name ?? "");
  /**
   * Optional, and the reason it exists: an order is tied to the person who
   * placed it by email. Matching on name alone means every customer called
   * "Ahmed" shares an order history.
   */
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [countryCode, setCountryCode] = useState(defaults?.countryCode || "SO");
  const [city, setCity] = useState(defaults?.city || "Mogadishu (Xamar)");
  const [customCity, setCustomCity] = useState("");
  const [district, setDistrict] = useState(defaults?.district ?? "");
  const [notes, setNotes] = useState("");

  // Location detection states
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [detectTone, setDetectTone] = useState<"ok" | "warn" | "info">("info");

  // ── The address book ───────────────────────────────────────────────
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);
  /** True while entering details that aren't one of the saved addresses. */
  const [editingAddress, setEditingAddress] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");

  const applyAddress = useCallback((address: SavedAddress) => {
    setName(address.name);
    setPhone(address.phone);
    setCountryCode(address.countryCode);
    setCity(address.city);
    setCustomCity(address.customCity ?? "");
    setDistrict(address.district ?? "");
    setActiveAddressId(address.id);
    setEditingAddress(false);
  }, []);

  /*
   * Load the book on mount and whenever the account changes.
   *
   * A saved address wins over the server defaults: it is the more specific
   * statement of where THIS delivery goes, and it is what the shopper
   * chose last time. The old single-address key is migrated in on first
   * run so nobody loses the address they already had.
   */
  useEffect(() => {
    let book = readAddresses(scope);

    if (book.length === 0) {
      try {
        const legacy = localStorage.getItem(addressKey);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (parsed?.city) {
            book = upsertAddress([], {
              label: "Home",
              name: parsed.name ?? "",
              phone: parsed.phone ?? "",
              countryCode: parsed.countryCode ?? "SO",
              city: parsed.city,
              customCity: parsed.customCity,
              district: parsed.district,
              isDefault: true,
            });
            writeAddresses(scope, book);
          }
        }
      } catch {
        // A malformed legacy entry is not worth failing a checkout over.
      }
    }

    const sorted = sortAddresses(book);
    setAddresses(sorted);

    if (sorted.length > 0) {
      applyAddress(sorted[0]);
    } else {
      setEditingAddress(true);
      // No saved address: start from the city picked in the header's
      // "Deliver to" (components/layout/DeliveryCity), unless the account
      // already supplied one.
      const preferred = readDeliveryCity();
      if (preferred && !defaults?.city && (defaults?.countryCode || "SO") === "SO") setCity(preferred);
    }
    // `defaults` is server-provided and fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, addressKey, applyAddress]);

  /**
   * Fill in the delivery city from the device's location.
   *
   * ── What changed, and why it mattered ────────────────────────────────
   * This used to ask an IP-geolocation service and report the answer as
   * "✓ Location filled" — confirmed, done. Somali mobile traffic is routed
   * through a handful of gateways that frequently resolve to the wrong
   * city or the wrong country entirely, so a shopper in Hargeisa got
   * "Mogadishu" stated as fact, and on a cash-on-delivery order that is a
   * parcel driven to the wrong town.
   *
   * lib/detect-location.ts now asks the DEVICE first (GPS), and marks
   * anything it isn't sure about as approximate. This function's job is to
   * pass that uncertainty on honestly rather than launder it into a tick.
   */
  async function handleAutoDetectLocation() {
    setIsDetecting(true);
    setDetectTone("info");
    setDetectStatus("Finding your location…");

    const loc = await detectUserLocation();
    setIsDetecting(false);

    if (!loc) {
      setDetectTone("warn");
      setDetectStatus(
        "Couldn't find your location. Allow location access in your browser, or just pick your city below.",
      );
      return;
    }

    const matchedCountry = COUNTRIES.find((c) => c.code === loc.countryCode)
      ? loc.countryCode
      : "SO";
    setCountryCode(matchedCountry);

    if (matchedCountry === "SO") {
      const match = matchSomaliCity(loc.city);
      if (match) {
        setCity(match);
        setCustomCity("");
      } else {
        setCity("Other");
        setCustomCity(loc.city);
      }
    } else {
      setCustomCity(loc.city);
    }

    // Never overwrite a district the customer typed themselves — theirs is
    // the local knowledge, ours is a guess from a coordinate.
    if (loc.district && !district.trim()) setDistrict(loc.district);

    // Detected details describe a new place, so this is no longer the
    // saved address that was selected.
    setActiveAddressId(null);
    setEditingAddress(true);

    if (loc.source === "gps" && !loc.approximate) {
      setDetectTone("ok");
      setDetectStatus(`Found you in ${loc.city}. Check the district below before you order.`);
    } else if (loc.source === "gps") {
      setDetectTone("warn");
      setDetectStatus(
        `Roughly ${loc.city} — the signal was weak${loc.accuracyMeters ? ` (±${Math.round(loc.accuracyMeters / 1000)}km)` : ""}. Please confirm your city.`,
      );
    } else {
      setDetectTone("warn");
      setDetectStatus(
        `Guessed ${loc.city || "your area"} from your connection — this is often wrong in Somalia. Please check it.`,
      );
    }
  }

  /**
   * Match a detected city name to the dropdown.
   *
   * The old code used `dropdownCity.includes(detected)`, which matches on
   * any fragment: a detected "Bari" quietly selected "Baridhaale". Exact
   * match first, then a whole-word check, then nothing — leaving it blank
   * and letting the customer choose is far better than choosing wrong.
   */
  function matchSomaliCity(detected: string): string | undefined {
    const needle = detected.trim().toLowerCase();
    if (!needle) return undefined;

    const cities = SOMALI_REGIONS_CITIES.flatMap((region) => region.cities);

    const exact = cities.find((c) => c.toLowerCase() === needle);
    if (exact) return exact;

    // "Mogadishu" should still find "Mogadishu (Xamar)".
    const parenthesised = cities.find((c) => {
      const base = c.toLowerCase().replace(/\s*\(.*\)\s*/, "").trim();
      return base === needle;
    });
    if (parenthesised) return parenthesised;

    return cities.find((c) => {
      const words = c.toLowerCase().replace(/[()]/g, "").split(/\s+/);
      return words.includes(needle);
    });
  }

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  const globalCityOptions = GLOBAL_CITIES[countryCode] || [];

  const delivery = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : fee;

  // ── Promo code, carried over from the cart (lib/promo.ts) ───────────
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState(false);
  useEffect(() => setAppliedPromo(readAppliedPromo(promo)), [promo]);

  function applyPromo() {
    if (promoMatches(promoInput, promo)) {
      const code = promoInput.trim().toUpperCase();
      setAppliedPromo(code);
      writeAppliedPromo(code);
      setPromoOpen(false);
      setPromoError(false);
    } else {
      setPromoError(true);
    }
  }

  const discount = appliedPromo ? Math.round(subtotal * promo.pct) / 100 : 0;
  const total = subtotal - discount + delivery;

  const destination = city === "Other" ? customCity : city;
  const arrival = localiseTime(deliveryTimeFor(settings.delivery, city, countryCode), lang);

  const parcels = useMemo(
    () => [...groupByStore(lines.map((l) => ({ ...l, store: l.product.store }))).entries()],
    [lines],
  );
  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ── Validation ──────────────────────────────────────────────────────
  // Our own messages instead of the browser's bubbles: they speak the
  // shopper's language, say what is wrong, and every problem shows at once.
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const clearError = (field: Field) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (name.trim().length < 2) found.name = t("checkout.err.name");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = t("checkout.err.email");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 13) found.phone = t("checkout.err.phone");
    if (!destination.trim()) found.city = t("checkout.err.city");
    if (!district.trim()) found.district = t("checkout.err.district");
    return found;
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    const found = validate();
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      const el = document.getElementById(first === "city" && city === "Other" ? "customCity" : first)
        ?? document.getElementById("cityInput");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }

    setIsSubmitting(true);

    const orderId = `BM-${Math.floor(10000 + Math.random() * 90000)}`;
    const fullPhone = `${selectedCountry.phoneCode} ${phone}`;
    const destinationCity = city === "Other" ? customCity : city;
    const fullAddress = `${district ? district + ", " : ""}${destinationCity}, ${selectedCountry.name}`;

    /*
     * File this address in the book.
     *
     * upsertAddress matches on the delivery details, so ordering to the
     * same house every week keeps ONE entry rather than accumulating a
     * list of near-identical ones. A label is only asked for when the
     * customer chose to enter a new address.
     */
    try {
      const book = upsertAddress(readAddresses(scope), {
        id: activeAddressId ?? undefined,
        label: saveLabel.trim() || defaultLabel(district, destinationCity),
        name,
        phone,
        countryCode,
        city,
        customCity,
        district,
        isDefault: addresses.length === 0,
      });
      writeAddresses(scope, book);

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
          price: priceOf(l),
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
    // The discount the server actually honoured. Assumed to be the one
    // shown if the call fails — the order then never reached it anyway.
    let honouredPct = appliedPromo ? promo.pct : 0;

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
            price: priceOf(l),
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
        promoCode: appliedPromo ?? undefined,
      });
      if (result?.parcels?.length) serverParcels = result.parcels;
      if (typeof result?.discountPct === "number") honouredPct = result.discountPct;
    } catch (err) {
      console.warn("Order submission sync warning:", err);
    }

    // Snapshot the order BEFORE clearing the cart — the confirmation screen
    // builds each vendor's message from it, and `lines` is empty by then.
    const grouped = groupByStore(lines.map((l) => ({ ...l, store: l.product.store })));
    const parcelIds = vendorOrderIds(orderId, [...grouped.keys()]);
    const paymentLabel =
      PAYMENT_METHODS.find((m) => m.id === payment)?.name ?? payment;
    const placedDiscount = Math.round(subtotal * honouredPct) / 100;
    const keep = 1 - honouredPct / 100;

    setPlacedOrder({
      baseId: orderId,
      placedAt: new Date().toISOString(),
      customerName: name,
      customerPhone: fullPhone,
      address: fullAddress,
      city: destinationCity,
      paymentLabel,
      subtotal,
      discount: placedDiscount,
      discountPct: honouredPct,
      delivery,
      total: subtotal - placedDiscount + delivery,
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
          subtotal:
            Math.round(storeLines.reduce((sum, l) => sum + priceOf(l) * l.qty, 0) * keep * 100) / 100,
          lines: storeLines.map((l) => {
            // The variant the customer actually chose decides both the
            // options label and which SKU the vendor should pick.
            const variant =
              findVariant(l.product, l.color, l.size) ?? defaultVariant(l.product);
            return {
              name: l.product.name,
              qty: l.qty,
              price: priceOf(l),
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
    // Credit any shelf that surfaced what was bought (shelf metrics).
    attributePurchase(lines.map((l) => ({ productId: l.productId, revenue: priceOf(l) * l.qty })));

    clearCart();
    writeAppliedPromo(null);
    setIsSubmitting(false);
    window.scrollTo({ top: 0 });
  }

  // ── Success screen ───────────────────────────────────────────────
  if (placedOrder) {
    return (
      <OrderConfirmation
        order={placedOrder}
        deliveryEstimate={arrival || estimate}
        purchased={purchased}
      />
    );
  }

  if (!ready) return <CartSkeleton />;

  // ── Empty cart guard ─────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-sand-100 text-6xl" aria-hidden>
          🧾
        </span>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-ocean-950">{t("checkout.nothing")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("cart.empty")}</p>
        <Link href="/products" className="btn-primary mt-6">
          {t("cart.startShopping")}
        </Link>
      </div>
    );
  }

  const errorClass = (field: Field) =>
    errors[field] ? "!border-coral-500 !ring-2 !ring-coral-100" : "";
  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`${field}-error`} className="mt-1 text-xs font-semibold text-coral-600" role="alert">
        {errors[field]}
      </p>
    ) : null;
  const hasErrors = FIELD_ORDER.some((f) => errors[f]);
  const optional = <span className="font-normal text-slate-400">{t("checkout.optional")}</span>;

  /** The lines, one block per shop — each shop sends its own parcel. */
  const orderLines = (
    <div className="space-y-4">
      {repriced.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          🏷️ {t("checkout.repriced")}
        </p>
      )}
      {parcels.length > 1 && (
        <p className="rounded-xl bg-ocean-50 px-3 py-2 text-xs text-ocean-900 ring-1 ring-ocean-100">
          📦 {t("cart.parcelsNote", { n: parcels.length })}
        </p>
      )}
      {parcels.map(([slug, storeLines], index) => {
        const store = stores.find((s) => s.slug === slug);
        const storeName = store?.name ?? (slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Banaadir Mall");
        return (
          <div key={slug || "none"}>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
              <StoreAvatar store={store ?? { name: storeName, icon: "🏪" }} size={20} className="h-5 w-5 rounded-md" />
              <span className="min-w-0 flex-1 truncate">{storeName}</span>
              {parcels.length > 1 && (
                <span className="shrink-0 font-semibold normal-case text-slate-400">
                  {t("cart.parcel", { n: index + 1, total: parcels.length })}
                </span>
              )}
            </p>
            <ul className="space-y-3">
              {storeLines.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 text-sm">
                  <span className="relative shrink-0">
                    <ProductImage
                      product={line.product}
                      iconClass="text-lg"
                      className="h-12 w-12 rounded-lg ring-1 ring-sand-200"
                      sizes="48px"
                    />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700 px-1 text-[10px] font-bold text-white">
                      {line.qty}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 leading-snug text-slate-700">{line.product.name}</span>
                    {(line.color || line.size) && (
                      <span className="block text-xs text-slate-400">
                        {[line.color, line.size].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right font-semibold tabular-nums">
                    {repriced.some((r) => r.productId === line.productId) && (
                      <span className="block text-[11px] font-normal text-slate-400 line-through">
                        {money(line.product.price * line.qty)}
                      </span>
                    )}
                    {money(priceOf(line) * line.qty)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );

  /** Subtotal → total, with the promo field and the delivery promise. */
  const totals = (
    <>
      {promo.code && promo.pct > 0 && !appliedPromo && (
        <div className="mt-4">
          {promoOpen ? (
            <div>
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value);
                    setPromoError(false);
                  }}
                  onKeyDown={(e) => {
                    // Enter here means "apply", not "place the order".
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyPromo();
                    }
                  }}
                  placeholder={t("cart.promoPlaceholder")}
                  aria-label={t("cart.promoPlaceholder")}
                  aria-invalid={promoError}
                  autoCapitalize="characters"
                  className={`input !py-2.5 uppercase ${promoError ? "!border-coral-500" : ""}`}
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  className="shrink-0 rounded-xl bg-ocean-700 px-4 text-sm font-bold text-white hover:bg-ocean-800"
                >
                  {t("cart.apply")}
                </button>
              </div>
              {promoError && (
                <p className="mt-1.5 text-xs font-semibold text-coral-600" role="alert">
                  {t("cart.promoInvalid")}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="text-sm font-semibold text-ocean-700 hover:underline"
            >
              🏷️ {t("cart.promoAsk")}
            </button>
          )}
        </div>
      )}
      <dl className="mt-4 space-y-2.5 border-t border-sand-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">
            {t("cart.subtotal")} · {units === 1 ? t("cart.itemsOne") : t("cart.itemsMany", { n: units })}
          </dt>
          <dd className="font-semibold tabular-nums">{money(subtotal)}</dd>
        </div>
        {appliedPromo && discount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt className="flex items-center gap-2">
              {t("cart.discount", { code: appliedPromo, pct: promo.pct })}
              <button
                type="button"
                onClick={() => {
                  setAppliedPromo(null);
                  writeAppliedPromo(null);
                }}
                className="text-[11px] font-semibold text-slate-400 underline hover:text-coral-600"
              >
                {t("cart.remove")}
              </button>
            </dt>
            <dd className="font-semibold tabular-nums">−{money(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">
            {t("cart.delivery")}
            {destination.trim() && arrival && (
              <span className="block text-xs text-slate-400">
                🚚 {t("checkout.arrives", { city: shortName(destination), time: arrival })}
              </span>
            )}
          </dt>
          <dd className="font-semibold tabular-nums">
            {delivery === 0 ? <span className="text-emerald-600">{t("cart.free")}</span> : money(delivery)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-sand-200 pt-3">
          <dt className="font-bold text-ocean-950">{t("cart.total")}</dt>
          <dd className="font-display text-2xl font-extrabold tabular-nums text-ocean-950">{money(total)}</dd>
        </div>
      </dl>
    </>
  );

  const guarantee = (
    <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
      <span aria-hidden>🛡️</span> {t("checkout.guarantee")}
    </p>
  );

  // ── Checkout form ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:pt-8 md:pb-12">
      <h1 className="mb-4 font-display text-2xl font-extrabold text-ocean-950 sm:mb-6 sm:text-3xl">
        {t("checkout.title")}
      </h1>

      {/* Phone: the order, folded away at the top — the total is always
          visible, the lines one tap away (the desktop has them alongside). */}
      <div className="card mb-5 overflow-hidden lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          aria-expanded={summaryOpen}
          className="flex w-full items-center gap-3 bg-sand-50/70 px-4 py-3.5 text-left"
        >
          <span aria-hidden>🛒</span>
          <span className="flex-1 text-sm font-semibold text-ocean-800">
            {summaryOpen ? t("checkout.hideSummary") : t("checkout.showSummary")}
            <span className={`ml-1 inline-block transition-transform ${summaryOpen ? "rotate-180" : ""}`} aria-hidden>
              ▾
            </span>
          </span>
          <span className="font-display text-lg font-extrabold tabular-nums text-ocean-950">{money(total)}</span>
        </button>
        {summaryOpen && (
          <div className="animate-fade-up border-t border-sand-100 px-4 pb-4 pt-4">
            {orderLines}
            {totals}
            <Link href="/cart" className="mt-3 inline-block text-xs font-semibold text-ocean-700 hover:underline">
              {t("checkout.edit")}
            </Link>
          </div>
        )}
      </div>

      <form onSubmit={placeOrder} noValidate className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6 self-start">
          {hasErrors && (
            <p className="rounded-2xl border border-coral-100 bg-coral-100/60 px-4 py-3 text-sm font-semibold text-coral-700" role="alert">
              {t("checkout.err.summary")}
            </p>
          )}

          {/* Step 1 — delivery details */}
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepTitle n={1} title={t("checkout.details")} />

              <button
                type="button"
                onClick={handleAutoDetectLocation}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-full border border-ocean-300 bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-100 disabled:opacity-50"
              >
                <span aria-hidden>{isDetecting ? "⏳" : "📍"}</span>
                <span>{isDetecting ? t("checkout.detecting") : t("checkout.autoFill")}</span>
              </button>
            </div>

            {detectStatus && (
              <div
                className={`mt-3 animate-fade-up rounded-xl border px-3.5 py-2 text-xs font-medium ${
                  detectTone === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : detectTone === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-sand-200 bg-sand-50 text-slate-600"
                }`}
              >
                {detectStatus}
              </div>
            )}

            {/* ── Saved addresses ─────────────────────────────────── */}
            {addresses.length > 0 && (
              <div className="mt-4">
                <p className="label">{t("checkout.deliverTo")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {addresses.map((address) => {
                    const selected = address.id === activeAddressId;
                    return (
                      <div
                        key={address.id}
                        className={`relative rounded-2xl border p-3 text-left transition ${
                          selected
                            ? "border-ocean-600 bg-ocean-50 ring-1 ring-ocean-600"
                            : "border-sand-200 bg-white hover:border-ocean-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            applyAddress(address);
                            setErrors({});
                          }}
                          aria-pressed={selected}
                          className="block w-full text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                                selected ? "border-ocean-700" : "border-slate-300"
                              }`}
                              aria-hidden
                            >
                              {selected && <span className="h-2 w-2 rounded-full bg-ocean-700" />}
                            </span>
                            <span className="text-sm font-bold text-ocean-950">{address.label}</span>
                            {address.isDefault && (
                              <span className="rounded-full bg-ocean-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                {t("checkout.default")}
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block truncate pl-5.5 text-xs text-slate-500">
                            {address.name} · {address.phone}
                          </span>
                          <span className="mt-0.5 block truncate pl-5.5 text-xs text-slate-400">
                            {formatAddress(
                              address,
                              COUNTRIES.find((c) => c.code === address.countryCode)?.name ?? "",
                            )}
                          </span>
                        </button>

                        <div className="mt-2 flex gap-3 border-t border-sand-100 pt-2 pl-5.5">
                          {!address.isDefault && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = makeDefault(addresses, address.id);
                                setAddresses(sortAddresses(next));
                                writeAddresses(scope, next);
                              }}
                              className="text-[11px] font-semibold text-slate-500 transition hover:text-ocean-700"
                            >
                              {t("checkout.makeDefault")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const next = removeAddress(addresses, address.id);
                              setAddresses(sortAddresses(next));
                              writeAddresses(scope, next);
                              if (activeAddressId === address.id) {
                                if (next.length > 0) applyAddress(sortAddresses(next)[0]);
                                else setEditingAddress(true);
                              }
                            }}
                            className="text-[11px] font-semibold text-slate-500 transition hover:text-coral-600"
                          >
                            {t("cart.remove")}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveAddressId(null);
                      setEditingAddress(true);
                      setDistrict("");
                      setCustomCity("");
                      setSaveLabel("");
                    }}
                    className={`rounded-2xl border border-dashed p-3 text-left transition ${
                      editingAddress
                        ? "border-ocean-600 bg-ocean-50"
                        : "border-sand-300 hover:border-ocean-400 hover:bg-sand-50"
                    }`}
                  >
                    <span className="text-sm font-bold text-ocean-900">{t("checkout.newAddress")}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{t("checkout.newAddressSub")}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">{t("checkout.name")}</label>
                {/* `name` + `autoComplete` let the phone offer the details it
                    already knows — a checkout typed on a small screen is where
                    shoppers give up. */}
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  autoCapitalize="words"
                  required
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearError("name");
                  }}
                  placeholder="Ayaan Warsame"
                  className={`input ${errorClass("name")}`}
                />
                {fieldError("name")}
              </div>

              <div>
                <label htmlFor="email" className="label">
                  {t("checkout.email")} {optional}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  placeholder="you@example.com"
                  className={`input ${errorClass("email")}`}
                />
                {/* Not required — plenty of customers here shop without one.
                    When given, it is what ties this order to an account, so
                    it appears under "My Orders" instead of only being
                    findable by its order number. */}
                {fieldError("email") ?? (
                  <p className="mt-1 text-[11px] text-slate-400">{t("checkout.emailHint")}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="label">{t("checkout.phone")}</label>
                <div className="flex items-center gap-2">
                  <span className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-sand-50 px-3 text-xs font-bold text-slate-600">
                    {selectedCountry.phoneCode}
                  </span>
                  <input
                    id="phone"
                    name="phone"
                    required
                    type="tel"
                    autoComplete="tel-national"
                    inputMode="tel"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      clearError("phone");
                    }}
                    placeholder="61 000 0000"
                    className={`input ${errorClass("phone")}`}
                  />
                </div>
                {fieldError("phone") ?? (
                  <p className="mt-1 text-[11px] text-slate-400">{t("checkout.phoneHint")}</p>
                )}
              </div>

              {/* Country Selector */}
              <div>
                <label htmlFor="country" className="label">{t("checkout.country")}</label>
                <select
                  id="country"
                  name="country"
                  autoComplete="country"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    clearError("city");
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
                <label htmlFor={countryCode === "SO" || globalCityOptions.length > 0 ? "city" : "cityInput"} className="label">
                  {t("checkout.city")}
                </label>
                {countryCode === "SO" ? (
                  <select
                    id="city"
                    required
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      clearError("city");
                    }}
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
                    onChange={(e) => {
                      setCity(e.target.value);
                      clearError("city");
                    }}
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
                    name="city"
                    autoComplete="address-level2"
                    required
                    aria-invalid={Boolean(errors.city)}
                    value={customCity}
                    onChange={(e) => {
                      setCustomCity(e.target.value);
                      clearError("city");
                    }}
                    placeholder="Enter city / town name"
                    className={`input ${errorClass("city")}`}
                  />
                )}
                {city !== "Other" && fieldError("city")}
              </div>

              {/* Custom City input if 'Other' is selected */}
              {city === "Other" && (countryCode === "SO" || globalCityOptions.length > 0) && (
                <div className="sm:col-span-2">
                  <label htmlFor="customCity" className="label">{t("checkout.otherCity")}</label>
                  <input
                    id="customCity"
                    name="city"
                    autoComplete="address-level2"
                    required
                    aria-invalid={Boolean(errors.city)}
                    value={customCity}
                    onChange={(e) => {
                      setCustomCity(e.target.value);
                      clearError("city");
                    }}
                    placeholder="e.g. Afmadow, Harardhere, Qoryoley..."
                    className={`input ${errorClass("city")}`}
                  />
                  {fieldError("city")}
                </div>
              )}

              <div>
                <label htmlFor="district" className="label">{t("checkout.district")}</label>
                <input
                  id="district"
                  name="address"
                  autoComplete="street-address"
                  required
                  aria-invalid={Boolean(errors.district)}
                  aria-describedby={errors.district ? "district-error" : undefined}
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    clearError("district");
                  }}
                  placeholder={t("checkout.districtPh")}
                  className={`input ${errorClass("district")}`}
                />
                {fieldError("district")}
              </div>

              {/* Only asked when this is a NEW address. Naming an address
                  you already have saved is a question with no purpose. */}
              {(editingAddress || addresses.length === 0) && (
                <div>
                  <label htmlFor="saveLabel" className="label">
                    {t("checkout.saveAs")} {optional}
                  </label>
                  <input
                    id="saveLabel"
                    autoComplete="off"
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Home, The shop, Mum's place…"
                    maxLength={30}
                    className="input"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">{t("checkout.saveHint")}</p>
                </div>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="notes" className="label">
                  {t("checkout.notes")} {optional}
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("checkout.notesPh")}
                  className="input resize-none"
                />
              </div>
            </div>
          </section>

          {/* Step 2 — payment method */}
          <section className="card p-5 sm:p-6">
            <StepTitle n={2} title={t("checkout.payment")} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("checkout.payment")}>
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ocean-300 ${
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
                  <span className="text-2xl" aria-hidden>{m.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ocean-950">
                      {m.id === "cod" ? t("checkout.pay.codName") : m.name}
                    </span>
                    <span className="block text-xs text-slate-500">{t(m.note)}</span>
                  </span>
                  <span
                    className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      payment === m.id ? "border-ocean-700" : "border-slate-300"
                    }`}
                    aria-hidden
                  >
                    {payment === m.id && <span className="h-2.5 w-2.5 rounded-full bg-ocean-700" />}
                  </span>
                </label>
              ))}
            </div>
            {payment !== "cod" && (
              <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-xs text-slate-600">
                📲 {t("checkout.payPrompt")}
              </p>
            )}
          </section>

          {/* Phone: the bill before the button — the lines are folded away
              at the top, the totals belong right here. */}
          <section className="card p-5 lg:hidden">
            <StepTitle n={3} title={t("checkout.yourOrder")} />
            {totals}
            {guarantee}
          </section>
        </div>

        {/* Order summary — desktop */}
        <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ocean-950">{t("checkout.yourOrder")}</h2>
              <Link href="/cart" className="text-xs font-semibold text-ocean-700 hover:underline">
                {t("checkout.edit")}
              </Link>
            </div>
            <div className="max-h-[46vh] overflow-y-auto overscroll-contain pr-1 pt-2">{orderLines}</div>
            {totals}
            <button type="submit" disabled={isSubmitting} className="btn-primary mt-5 w-full !py-3.5 text-base disabled:opacity-70">
              {isSubmitting ? t("checkout.placing") : `🔒 ${t("checkout.place", { total: money(total) })}`}
            </button>
            {guarantee}
          </div>
        </aside>

        {/* Phone: Place order always in reach. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white/95 px-4 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-500">{t("cart.total")}</p>
              <p className="font-display text-lg font-extrabold leading-tight tabular-nums text-ocean-950">{money(total)}</p>
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary shrink-0 !px-6 disabled:opacity-70">
              {isSubmitting ? t("checkout.placing") : `🔒 ${t("checkout.placeShort")}`}
            </button>
          </div>
        </div>
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

/**
 * A name for an address the customer didn't label.
 *
 * The district is what people actually use to distinguish places ("Hodan",
 * "Waberi"), so it leads. Falling back to the city keeps the card readable
 * rather than showing an empty title.
 */
function defaultLabel(district: string, city: string): string {
  const cleanDistrict = district.trim();
  if (cleanDistrict) return cleanDistrict;
  return city.trim() || "My address";
}
