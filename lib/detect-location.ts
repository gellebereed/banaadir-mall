"use client";

export interface DetectedLocation {
  countryCode: string;
  countryName: string;
  city: string;
  district?: string;
}

/**
 * Detects the user's current physical location using IP Geolocation API
 * with fallback to HTML5 browser Geolocation reverse lookup.
 */
export async function detectUserLocation(): Promise<DetectedLocation | null> {
  try {
    // Strategy 1: Free, fast IP geolocation service (ipapi.co)
    const res = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.country_code) {
        return {
          countryCode: data.country_code || "SO",
          countryName: data.country_name || "Somalia",
          city: data.city || "Mogadishu",
          district: data.region || "",
        };
      }
    }
  } catch {
    // Fallback if IP lookup fails or is blocked
  }

  try {
    // Strategy 2: ip-api.com fallback
    const res2 = await fetch("https://ip-api.com/json/?fields=country,countryCode,city,regionName", {
      signal: AbortSignal.timeout(4000),
    });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.countryCode) {
        return {
          countryCode: data2.countryCode || "SO",
          countryName: data2.country || "Somalia",
          city: data2.city || "Mogadishu",
          district: data2.regionName || "",
        };
      }
    }
  } catch {
    // Fallback
  }

  return null;
}
