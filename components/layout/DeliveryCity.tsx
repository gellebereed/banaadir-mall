"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePrefs } from "@/components/prefs/PrefsProvider";
import { SOMALI_REGIONS_CITIES } from "@/lib/data/locations";
import type { Lang } from "@/lib/i18n";
import type { MarketingSettings } from "@/lib/types";

/** Read by checkout to pre-fill the city (components/checkout/CheckoutClient). */
export const DELIVERY_CITY_KEY = "bm-city";
const DEFAULT_CITY = "Mogadishu (Xamar)";
const LOCAL_REGION = "Banaadir";
const CHANGE_EVENT = "bm-city-change";

/** "Burco (Burao)" → "Burco": the bracket is a spelling aid for the list, not a name. */
export const shortName = (city: string) => city.replace(/\s*\(.*\)\s*$/, "");

export function readDeliveryCity(): string | null {
  try {
    const city = localStorage.getItem(DELIVERY_CITY_KEY);
    return city && SOMALI_REGIONS_CITIES.some((r) => r.cities.includes(city)) ? city : null;
  } catch {
    return null;
  }
}

/**
 * How long delivery takes to `city`: the admin's local time for the
 * capital, the national time anywhere else in Somalia, and the general
 * estimate for an address abroad. Shared with the cart and checkout so all
 * three quote the same promise.
 */
export function deliveryTimeFor(
  delivery: MarketingSettings["delivery"],
  city: string,
  countryCode = "SO",
): string {
  if (countryCode !== "SO") return delivery.estimate;
  const local = SOMALI_REGIONS_CITIES.find((r) => r.region === LOCAL_REGION)?.cities.includes(city) ?? false;
  return (local ? delivery.localTime : delivery.nationalTime) || delivery.estimate;
}

/**
 * The admin's delivery times are free text ("Same day", "2–4 days"); the
 * common words are put into Somali so the header doesn't switch language
 * mid-line. Anything unrecognised is shown as written.
 */
export function localiseTime(text: string, lang: Lang): string {
  if (lang !== "so") return text;
  return text
    .replace(/same[- ]day/i, "Isla maalinta")
    .replace(/next[- ]day/i, "Maalinta xigta")
    .replace(/\bdays\b/i, "maalmood")
    .replace(/\bday\b/i, "maalin")
    .replace(/\bhours\b/i, "saacadood");
}

/**
 * "📍 Deliver to Mogadishu · Delivery: Same day". Answers the two questions
 * a shopper outside the capital has before anything else — do you deliver
 * to me, and how long — and remembers the answer for checkout.
 */
export default function DeliveryCity({
  delivery,
  variant,
}: {
  delivery: MarketingSettings["delivery"];
  variant: "bar" | "compact";
}) {
  const { t, lang } = usePrefs();
  const [city, setCity] = useState(DEFAULT_CITY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const sync = () => setCity(readDeliveryCity() ?? DEFAULT_CITY);
    sync();
    // Two instances (phone bar, desktop header) stay in step.
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const time = deliveryTimeFor(delivery, city);

  const regions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOMALI_REGIONS_CITIES.map((r) => ({
      ...r,
      cities: q ? r.cities.filter((c) => c.toLowerCase().includes(q)) : r.cities,
    })).filter((r) => r.cities.length > 0);
  }, [query]);

  const choose = (next: string) => {
    try {
      localStorage.setItem(DELIVERY_CITY_KEY, next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    setCity(next);
    setOpen(false);
    setQuery("");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <>
      {variant === "bar" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 truncate text-left text-xs text-slate-600"
        >
          <span aria-hidden>📍</span>
          <span className="truncate">
            <span className="font-semibold text-ocean-900">{t("delivery.to", { city: shortName(city) })}</span>
            {time && <span className="text-slate-500"> · {t("delivery.time", { time: localiseTime(time, lang) })}</span>}
          </span>
          <span aria-hidden className="ml-auto text-slate-400">▾</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden shrink-0 flex-col items-start rounded-xl px-2 py-1 text-left leading-tight hover:bg-sand-100 lg:flex"
          title={time ? t("delivery.time", { time: localiseTime(time, lang) }) : undefined}
        >
          <span className="text-[11px] text-slate-500">📍 {t("delivery.toLabel")}</span>
          <span className="text-sm font-bold text-ocean-950">{shortName(city)}</span>
        </button>
      )}

      {/* Portalled to <body>: the header's backdrop blur makes it the
          containing block for fixed children, which squeezed the sheet
          into the header's own box. */}
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("delivery.choose")}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-sand-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-extrabold text-ocean-950">{t("delivery.choose")}</h2>
                  <p className="mt-1 text-xs text-slate-500">{t("delivery.chooseHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("delivery.close")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-sand-100"
                >
                  ✕
                </button>
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("delivery.search")}
                aria-label={t("delivery.search")}
                className="input mt-3"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto p-3">
              {regions.map((r) => {
                const regionTime =
                  (r.region === LOCAL_REGION ? delivery.localTime : delivery.nationalTime) || "";
                return (
                  <div key={r.region} className="mb-3">
                    <p className="flex items-baseline justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {r.region}
                      {regionTime && (
                        <span className="normal-case tracking-normal">{localiseTime(regionTime, lang)}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {r.cities.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => choose(c)}
                          aria-pressed={c === city}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                            c === city
                              ? "bg-ocean-800 text-white"
                              : "bg-sand-50 text-slate-700 ring-1 ring-sand-200 hover:ring-ocean-300"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
