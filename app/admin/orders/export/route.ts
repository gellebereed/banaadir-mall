import { getOrders, getStores } from "@/lib/api";
import { getSession } from "@/lib/session";
import { applyFilters, inRange, readFilters } from "../filters";

/**
 * The admin orders list as a CSV, with the same filters as the page —
 * for the accountant, a spreadsheet, or a courier company's manifest.
 * Admin only: it contains customers' names, phones and addresses.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Not allowed", { status: 403 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = readFilters(params);
  const [orders, stores] = await Promise.all([getOrders(), getStores()]);
  const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name ?? slug;
  const rows = applyFilters(inRange(orders, filters.range), filters, storeName);

  const cell = (v: unknown) => {
    const text = String(v ?? "");
    // Quote everything; neutralise formulas a spreadsheet would run.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["Order", "Date", "Status", "Store", "Customer", "Phone", "Email", "City", "Address", "Items", "Total"];
  const lines = rows.map((o) =>
    [
      o.id,
      o.date,
      o.status,
      storeName(o.store),
      o.customer,
      o.phone,
      o.email,
      o.city,
      o.address,
      o.items.map((i) => `${i.qty} x ${i.name ?? i.productId}`).join("; "),
      o.total.toFixed(2),
    ]
      .map(cell)
      .join(","),
  );

  return new Response([header.map(cell).join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
