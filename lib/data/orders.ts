import type { Order, OrderStatus } from "../types";
import { products } from "./products";

/**
 * Demo orders powering the admin panel, vendor dashboard and order tracking.
 * In Odoo these map to `sale.order` records.
 *
 * Orders are generated deterministically (seeded PRNG, fixed base date) so
 * server and client always render identical numbers — no hydration issues.
 */

const CUSTOMERS = [
  "Ayaan Warsame", "Mohamed Ali", "Fartuun Ahmed", "Hassan Abdi",
  "Hodan Yusuf", "Abdullahi Noor", "Nasteexo Cali", "Khadar Omar",
  "Ifrah Hussein", "Liibaan Farah", "Sagal Mohamud", "Yusuf Ibrahim",
];

const CITIES = [
  "Mogadishu", "Hargeisa", "Kismayo", "Baidoa",
  "Garowe", "Bosaso", "Beledweyne", "Jowhar",
];

const STATUSES: OrderStatus[] = [
  "delivered", "delivered", "delivered", "shipped",
  "processing", "pending", "delivered", "shipped",
  "processing", "cancelled",
];

/** Small deterministic PRNG (mulberry32) — same orders on every render. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildOrders(): Order[] {
  const rnd = mulberry32(20260731);
  const orders: Order[] = [];

  for (let i = 0; i < 48; i++) {
    const product = products[Math.floor(rnd() * products.length)];
    const qty = 1 + Math.floor(rnd() * 3);
    // Spread order dates over the 30 days before the demo "today".
    const daysAgo = Math.floor(rnd() * 30);
    const date = new Date(Date.UTC(2026, 6, 31) - daysAgo * 86400000)
      .toISOString()
      .slice(0, 10);

    orders.push({
      id: `BM-${String(10240 + i)}`,
      customer: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)],
      city: CITIES[Math.floor(rnd() * CITIES.length)],
      store: product.store,
      items: [{ productId: product.id, qty }],
      total: Math.round(product.price * qty * 100) / 100,
      status: STATUSES[Math.floor(rnd() * STATUSES.length)],
      date,
    });
  }

  // Newest first — every table in the app expects this ordering.
  return orders.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const orders: Order[] = buildOrders();
