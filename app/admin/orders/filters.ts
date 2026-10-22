import type { Order, OrderStatus } from "@/lib/types";

/**
 * The admin orders list's filters, shared by the page and the CSV export
 * so "export" always means "exactly what I'm looking at".
 */
export interface OrderFilters {
  status: OrderStatus | "attention" | "";
  store: string;
  q: string;
  range: "7" | "30" | "90" | "all";
}

export const STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

export function readFilters(params: Record<string, string | undefined>): OrderFilters {
  const status = (params.status ?? "") as OrderFilters["status"];
  const range = (["7", "30", "90", "all"] as const).find((r) => r === params.range) ?? "all";
  return {
    status: status === "attention" || STATUSES.includes(status as OrderStatus) ? status : "",
    store: params.store ?? "",
    q: (params.q ?? "").trim().slice(0, 80),
    range,
  };
}

const DAY = 86_400_000;

/**
 * Needs a look: waiting to be packed for more than two days, or marked on
 * the way with no driver the customer could call.
 */
export function needsAttention(order: Order, now = Date.now()): boolean {
  const age = now - Date.parse(order.date);
  if ((order.status === "pending" || order.status === "processing") && age > 2 * DAY) return true;
  return order.status === "shipped" && !order.delivery?.courier?.phone;
}

/** Orders in the date range, before the status/store/search filters. */
export function inRange(orders: Order[], range: OrderFilters["range"], now = Date.now()): Order[] {
  if (range === "all") return orders;
  const since = now - Number(range) * DAY;
  return orders.filter((o) => Date.parse(o.date) >= since);
}

export function applyFilters(orders: Order[], f: OrderFilters, storeName: (slug: string) => string): Order[] {
  const q = f.q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  return orders.filter((o) => {
    if (f.status === "attention" ? !needsAttention(o) : f.status && o.status !== f.status) return false;
    if (f.store && o.store !== f.store) return false;
    if (!q) return true;
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer.toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (digits.length >= 3 && (o.phone ?? "").replace(/\D/g, "").includes(digits)) ||
      (o.city ?? "").toLowerCase().includes(q) ||
      storeName(o.store).toLowerCase().includes(q) ||
      o.items.some((i) => (i.name ?? "").toLowerCase().includes(q))
    );
  });
}
