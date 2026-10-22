/**
 * Shop time — schedules are typed in Mogadishu, the server runs in UTC.
 *
 * A `datetime-local` field sends "2026-10-22T10:00" with no time zone. The
 * server used to read that as 10:00 UTC — 13:00 in Mogadishu — so an offer
 * set to start at 10:00 sat on "Scheduled" for three hours after its start
 * time had passed. Every schedule comparison goes through here instead.
 *
 * Somalia is UTC+3 all year (no daylight saving), so a fixed offset is exact.
 */
export const SHOP_TIME_ZONE = "Africa/Mogadishu";
const SHOP_OFFSET = "+03:00";

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Milliseconds since epoch; a zoneless value is read as Mogadishu time. */
export function parseShopTime(value: string): number {
  const v = value.trim();
  if (!v) return NaN;
  if (HAS_ZONE.test(v)) return Date.parse(v);
  // "2026-10-22" alone means the start of that day, in Mogadishu.
  const withTime = /T\d{2}:\d{2}/.test(v) ? v : `${v}T00:00`;
  return Date.parse(withTime + SHOP_OFFSET);
}

/** A form value as an exact ISO moment, or undefined when empty/invalid. */
export function normaliseShopTime(value: unknown): string | undefined {
  const v = String(value ?? "").trim();
  if (!v) return undefined;
  const ms = parseShopTime(v);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** Is a schedule window open at `now`? Empty ends mean "no limit". */
export function inShopWindow(startsAt: string | undefined, endsAt: string | undefined, now = Date.now()): boolean {
  if (startsAt && parseShopTime(startsAt) > now) return false;
  if (endsAt && parseShopTime(endsAt) < now) return false;
  return true;
}

/** "22 Oct, 10:00" in Mogadishu time — what a seller typed, shown back. */
export function formatShopTime(value: string): string {
  const ms = parseShopTime(value);
  if (Number.isNaN(ms)) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
}
