"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  LOCATION DETECTION — device GPS first, IP only as a last resort.
 * ─────────────────────────────────────────────────────────────────────────
 * This used to ask an IP-geolocation service and present the answer as
 * fact: "✓ Location filled: Mogadishu, Somalia". For this marketplace that
 * is close to the worst possible design.
 *
 * ── Why IP geolocation is wrong HERE specifically ────────────────────────
 * Somali mobile traffic is carried by a small number of operators whose
 * public address space is routed through a handful of gateways — often
 * registered abroad. An IP lookup for a shopper standing in Hargeisa
 * commonly returns Mogadishu, Nairobi, Dubai, or simply "Somalia" with no
 * city at all. The service reports this with total confidence, the old code
 * repeated that confidence to the customer, and the result is a delivery
 * address quietly filled in with the wrong city.
 *
 * A wrong address on a cash-on-delivery order is not a cosmetic bug. It is
 * a parcel driven to the wrong town.
 *
 * ── What this does instead ───────────────────────────────────────────────
 * 1. Asks the DEVICE (navigator.geolocation). On a phone that is GPS: tens
 *    of metres, not hundreds of kilometres. It needs permission, which is
 *    the honest trade — the shopper is asked, and can say no.
 * 2. Reverse-geocodes those coordinates to a city name.
 * 3. Falls back to IP only if permission is refused or unavailable, and
 *    labels the result `approximate` so the UI can say so rather than
 *    claiming a confirmed location.
 *
 * Nothing here ever silently overwrites something the customer typed —
 * that decision belongs to the caller, which asks first.
 */

export interface DetectedLocation {
  countryCode: string;
  countryName: string;
  city: string;
  district?: string;
  /** Where the answer came from — drives what the UI is allowed to claim. */
  source: "gps" | "ip";
  /** GPS accuracy in metres, when the device reported one. */
  accuracyMeters?: number;
  /**
   * True when this is a best guess rather than a confirmed position. Always
   * true for IP results. The UI must not present these as verified.
   */
  approximate: boolean;
}

/** Long enough for a GPS fix on a phone, short enough not to feel broken. */
const GPS_TIMEOUT_MS = 12_000;
const NETWORK_TIMEOUT_MS = 6_000;

/**
 * A GPS fix worse than this is no better than an IP lookup, so it is
 * treated as approximate rather than presented as confirmed.
 */
const TRUSTWORTHY_ACCURACY_M = 5_000;

export async function detectUserLocation(): Promise<DetectedLocation | null> {
  const fix = await currentPosition();
  if (fix) {
    const place = await reverseGeocode(fix.coords.latitude, fix.coords.longitude);
    if (place) {
      const accuracy = fix.coords.accuracy;
      return {
        ...place,
        source: "gps",
        accuracyMeters: Math.round(accuracy),
        approximate: accuracy > TRUSTWORTHY_ACCURACY_M,
      };
    }
  }

  const byIp = await locateByIp();
  return byIp ? { ...byIp, source: "ip", approximate: true } : null;
}

/** Has the shopper already granted (or refused) location permission? */
export async function locationPermission(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      // Denied, unavailable or timed out — all handled the same way: fall
      // through to IP rather than leave the shopper with nothing.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

type Place = Pick<DetectedLocation, "countryCode" | "countryName" | "city" | "district">;

/**
 * Coordinates → a place name.
 *
 * BigDataCloud's client endpoint is used because it needs no API key, sets
 * CORS headers, and — unlike most free geocoders — has usable coverage of
 * Somali localities. Nominatim is the backstop; its usage policy makes it
 * unsuitable as a primary for a storefront.
 */
async function reverseGeocode(latitude: number, longitude: number): Promise<Place | null> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
    );
    if (response.ok) {
      const data = await response.json();
      const city = data.city || data.locality || data.principalSubdivision;
      if (city) {
        return {
          countryCode: data.countryCode || "SO",
          countryName: data.countryName || "Somalia",
          city,
          district: data.locality && data.locality !== city ? data.locality : undefined,
        };
      }
    }
  } catch {
    // Fall through.
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=12`,
      { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
    );
    if (response.ok) {
      const data = await response.json();
      const address = data.address ?? {};
      const city = address.city || address.town || address.village || address.state;
      if (city) {
        return {
          countryCode: (address.country_code || "so").toUpperCase(),
          countryName: address.country || "Somalia",
          city,
          district: address.suburb || address.neighbourhood || undefined,
        };
      }
    }
  } catch {
    // No reverse geocode available.
  }

  return null;
}

/** The old behaviour, kept only as the fallback it should always have been. */
async function locateByIp(): Promise<Place | null> {
  try {
    const response = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.country_code) {
        return {
          countryCode: data.country_code,
          countryName: data.country_name || "Somalia",
          city: data.city || "",
          district: data.region || undefined,
        };
      }
    }
  } catch {
    // Try the second service.
  }

  try {
    const response = await fetch(
      "https://ip-api.com/json/?fields=country,countryCode,city,regionName",
      { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
    );
    if (response.ok) {
      const data = await response.json();
      if (data.countryCode) {
        return {
          countryCode: data.countryCode,
          countryName: data.country || "Somalia",
          city: data.city || "",
          district: data.regionName || undefined,
        };
      }
    }
  } catch {
    // Nothing available.
  }

  return null;
}
