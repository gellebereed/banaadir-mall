/** Shared formatting helpers so prices/numbers look identical everywhere. */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$49" / "$49.99" / "$118.80" — cents are shown in full or not at all. */
export function money(n: number): string {
  const cents = Math.round(n * 100);
  return cents % 100 === 0 ? usd.format(cents / 100) : usdCents.format(cents / 100);
}

/** "2.3k" style compact counters for sold/followers numbers. */
export function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Discount percentage between the old and current price, e.g. 38. */
export function discountPct(price: number, compareAt: number): number {
  return Math.round((1 - price / compareAt) * 100);
}

/** "Jul 28" from an ISO date string. */
export function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
