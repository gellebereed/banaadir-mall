import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/dashboard/StatusBadge";
import {
  AttentionPanel,
  BarBreakdown,
  Footnote,
  KpiCard,
  MiniStat,
  RangeFilter,
  RankedList,
  TabFilter,
  TrendChart,
  type AttentionItem,
  type TabDef,
} from "@/components/dashboard/DashboardUI";
import {
  inPeriod,
  LOW_STOCK_THRESHOLD,
  lowStockProducts,
  parseRange,
  resolvePeriod,
  soldProductIds,
  summariseCatalogue,
  summariseSales,
} from "@/lib/analytics";
import { summariseCommission } from "@/lib/commission";
import {
  getAllProductsByStore,
  getCategories,
  getCommissionSettings,
  getOrdersByStore,
  getStore,
} from "@/lib/api";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { totalStock } from "@/lib/product-utils";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

const TABS: TabDef[] = [
  { key: "sales", label: "Sales", icon: "💰" },
  { key: "products", label: "Products", icon: "📦" },
  { key: "orders", label: "Orders", icon: "🧾" },
  { key: "inventory", label: "Inventory", icon: "🏷️" },
];

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SELLER DASHBOARD — what happened, and what still needs doing.
 * ─────────────────────────────────────────────────────────────────────────
 * Two halves, deliberately. The top is fixed: what needs attention, then
 * the headline numbers for the chosen period and the trend behind them.
 * The bottom is whichever view the seller picked. Both halves obey the same
 * range filter, so a number in a tab always belongs to the same window as
 * the number in the tile above it.
 *
 * Every figure is scoped to the selected range and compared against the
 * period immediately before it. Nothing on this page is hard-coded — the
 * previous version showed "+18% vs last month" to every shop, on every day,
 * regardless of sales.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "sales";
  const period = resolvePeriod(range);

  const { session, storeSlug } = await requireVendor();
  const seesCosts = may(session, "costs.view");
  const [store, orders, products, categories, commission] = await Promise.all([
    getStore(storeSlug),
    getOrdersByStore(storeSlug),
    getAllProductsByStore(storeSlug),
    getCategories(true),
    getCommissionSettings(),
  ]);

  const sales = summariseSales({ orders, products, period });

  /*
   * The marketplace fee and what is left after it.
   *
   * Shown only when a commission is actually being charged AND the admin
   * has chosen to show it (CommissionSettings.showToSellers). It is
   * ADDITIONAL to the revenue tile rather than a change to it: "Revenue"
   * means what customers paid, here and on every other screen, and a
   * seller comparing this dashboard with their orders list has to find the
   * same number in both.
   */
  const payout =
    commission.enabled && commission.showToSellers
      ? summariseCommission(
          period.unbounded ? orders : inPeriod(orders, period.start, period.end),
          products,
          commission,
        )
      : null;
  const health = summariseCatalogue(products, soldProductIds(orders));
  const lowStock = lowStockProducts(products, 8);

  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));
  const productsById = new Map(products.map((product) => [product.id, product]));

  const unseenOrders = orders.filter((order) => !order.seenAt).length;
  const awaitingAction = orders.filter(
    (order) => order.status === "pending" || order.status === "processing",
  ).length;

  const attention: AttentionItem[] = [
    { icon: "🆕", label: "New orders not yet opened", count: unseenOrders, href: "/vendor/orders", tone: "urgent" },
    { icon: "⏳", label: "Orders awaiting action", count: awaitingAction, href: "/vendor/orders", tone: "urgent" },
    { icon: "🚫", label: "Products out of stock", count: health.outOfStock, href: "/vendor/products", tone: "warn" },
    { icon: "📉", label: `Low stock (≤${LOW_STOCK_THRESHOLD})`, count: health.lowStock, href: "/vendor/products", tone: "warn" },
    { icon: "📸", label: "Products with no photo", count: health.missingPhotos, href: "/vendor/photos", tone: "info" },
    { icon: "🙈", label: "Hidden from the storefront", count: health.hidden, href: "/vendor/products", tone: "info" },
    { icon: "🏷️", label: "Products with no barcode", count: health.missingBarcode, href: "/vendor/products", tone: "info" },
  ];

  const periodLabel = period.unbounded ? "all time" : `last ${period.label}`;

  return (
    <div>
      {/* ── Head ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {store?.name} — {periodLabel}
            {!period.unbounded && (
              <span className="text-slate-400">
                {" "}
                ({shortDate(period.start)} – {shortDate(period.end)})
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter basePath="/vendor" range={range} tab={tab} />
          <Link href={`/store/${storeSlug}`} className="btn-secondary !px-4 !py-2 text-sm">
            View store
          </Link>
          <Link href="/vendor/products/new" className="btn-primary !px-4 !py-2 text-sm">
            + Add product
          </Link>
        </div>
      </div>

      <AttentionPanel items={attention} />

      {/* ── Headline numbers ─────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          icon="💰"
          label="Revenue"
          value={money(sales.revenue)}
          delta={sales.revenueDelta}
          note={period.unbounded ? undefined : `was ${money(sales.revenueDelta.previous)}`}
        />
        <KpiCard
          icon="🧾"
          label="Orders"
          value={String(sales.orders)}
          delta={sales.ordersDelta}
          href="/vendor/orders"
        />
        <KpiCard icon="📦" label="Units sold" value={String(sales.units)} delta={sales.unitsDelta} />
        <KpiCard icon="💳" label="Average order" value={money(sales.aov)} delta={sales.aovDelta} />
      </div>

      {/* ── What you actually take home ──────────────────────────── */}
      {payout && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MiniStat
            label="Your payout"
            value={money(payout.payout)}
            tone="good"
            note={`after the marketplace fee, ${periodLabel}`}
          />
          <MiniStat
            label="Marketplace fee"
            value={money(payout.commission)}
            note={`${payout.effectivePct.toFixed(1)}% of what customers paid`}
          />
          <MiniStat
            label="Fee on an average order"
            value={money(payout.orders > 0 ? payout.commission / payout.orders : 0)}
            note={`across ${payout.orders} order${payout.orders === 1 ? "" : "s"}`}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <TrendChart
          series={sales.series}
          title="Revenue"
          subtitle={
            period.unbounded
              ? "Every order you have taken"
              : `Last ${period.label}, compared with the ${period.label} before`
          }
        />
        <BarBreakdown
          title="Orders by status"
          rows={sales.statusBreakdown.map((row) => ({
            label: row.status,
            count: row.count,
            value: row.value,
          }))}
          href="/vendor/orders"
          hrefLabel="Manage orders"
        />
      </div>

      {/* ── Section tabs ─────────────────────────────────────────── */}
      <div className="mt-8">
        <TabFilter basePath="/vendor" tabs={TABS} active={tab} range={range} />
      </div>

      {tab === "sales" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <RankedList
              title="Best sellers by revenue"
              rows={sales.topProducts}
              href="/vendor/products"
              hrefLabel="All products"
              renderHref={(row) => {
                const product = productsById.get(row.id);
                return product ? `/vendor/products/${product.id}/edit` : undefined;
              }}
              emptyText="No sales in this period yet."
            />
            <RankedList
              title="Best sellers by units"
              rows={[...sales.topProducts].sort((a, b) => b.units - a.units)}
              metric="units"
              emptyText="No sales in this period yet."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankedList
              title="Revenue by category"
              rows={sales.topCategories.map((row) => ({
                ...row,
                label: categoryNames.get(row.id) ?? row.label,
              }))}
              emptyText="No sales in this period yet."
            />
            <div className="card p-5">
              <h3 className="font-display font-bold text-ocean-950">Where your buyers are</h3>
              {sales.topCities.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No orders in this period.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {sales.topCities.slice(0, 6).map((city) => (
                    <li key={city.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">📍 {city.label}</span>
                      <span className="shrink-0 text-slate-500">
                        {city.orders} order{city.orders === 1 ? "" : "s"} ·{" "}
                        <strong className="text-ocean-950">{money(city.revenue)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {sales.cancelled > 0 && (
                <p className="mt-4 rounded-xl bg-coral-100/50 px-3 py-2 text-xs text-coral-700">
                  {sales.cancelled} cancelled order{sales.cancelled === 1 ? "" : "s"} worth{" "}
                  {money(sales.cancelledValue)} — excluded from every figure above.
                </p>
              )}
            </div>
          </div>

          {sales.estimated && (
            <Footnote>
              Some orders were placed before per-item prices were recorded, so the
              product and category splits above use each product&apos;s current
              price. Total revenue is unaffected — it comes from what customers
              were actually charged.
            </Footnote>
          )}
        </div>
      )}

      {tab === "products" && (
        <div className="mt-4 space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">Catalogue health</h3>
            <p className="mt-1 text-sm text-slate-500">
              All {health.total} products, regardless of the selected period.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Live on the storefront" value={String(health.live)} tone="good" />
              <MiniStat label="Hidden" value={String(health.hidden)} note="not visible to customers" />
              <MiniStat
                label="No photo"
                value={String(health.missingPhotos)}
                tone={health.missingPhotos > 0 ? "warn" : undefined}
                note="photos sell — these are hardest to shift"
              />
              <MiniStat
                label="No barcode"
                value={String(health.missingBarcode)}
                note="cannot be scanned at a counter"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label="Out of stock"
                value={String(health.outOfStock)}
                tone={health.outOfStock > 0 ? "bad" : "good"}
              />
              <MiniStat
                label={`Low stock (≤${LOW_STOCK_THRESHOLD})`}
                value={String(health.lowStock)}
                tone={health.lowStock > 0 ? "warn" : undefined}
              />
              <MiniStat label="Never sold" value={String(health.neverSold)} note="no order, ever" />
              <MiniStat label="Total stock" value={`${health.stockUnits} units`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/vendor/products" className="btn-secondary !px-4 !py-2 text-sm">
                Manage products
              </Link>
              <Link href="/vendor/photos" className="btn-secondary !px-4 !py-2 text-sm">
                Add photos in bulk
              </Link>
              <Link href="/vendor/products/import" className="btn-secondary !px-4 !py-2 text-sm">
                Import from file
              </Link>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankedList
              title="Your top earners"
              rows={sales.topProducts}
              limit={8}
              emptyText="No sales in this period yet."
            />
            <div className="card p-5">
              <h3 className="font-display font-bold text-ocean-950">Not selling</h3>
              <p className="mt-1 text-xs text-slate-500">
                In stock and visible, but no orders in {periodLabel}.
              </p>
              <ul className="mt-4 space-y-2">
                {products
                  .filter(
                    (product) =>
                      !product.hidden &&
                      totalStock(product) > 0 &&
                      !sales.topProducts.some((row) => row.id === product.id),
                  )
                  .slice(0, 8)
                  .map((product) => (
                    <li key={product.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-100">
                        {product.icon}
                      </span>
                      <Link
                        href={`/vendor/products/${product.id}/edit`}
                        className="min-w-0 flex-1 truncate text-slate-700 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="shrink-0 text-xs text-slate-400">
                        {totalStock(product)} in stock
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-4 space-y-4">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-sand-200 p-5">
              <h3 className="font-display font-bold text-ocean-950">
                Orders in {periodLabel} ({sales.orders + sales.cancelled})
              </h3>
              <Link href="/vendor/orders" className="text-xs font-bold text-ocean-700 hover:underline">
                Manage orders →
              </Link>
            </div>

            {orders.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No orders yet.</p>
            ) : (
              <div className="max-h-[30rem] overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">City</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Total</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders
                      .filter(
                        (order) =>
                          period.unbounded ||
                          (order.date >= period.start && order.date <= period.end),
                      )
                      .slice(0, 40)
                      .map((order) => (
                        <tr
                          key={order.id}
                          className="border-t border-sand-100 hover:bg-sand-50"
                        >
                          <td className="px-5 py-3 font-bold text-ocean-800">
                            {order.id}
                            {!order.seenAt && (
                              <span className="ml-2 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                NEW
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-600">{order.customer}</td>
                          <td className="px-5 py-3 text-slate-500">{order.city}</td>
                          <td className="px-5 py-3 text-slate-500">{shortDate(order.date)}</td>
                          <td className="px-5 py-3 text-right font-semibold">
                            {money(order.total)}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={order.status} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div className="mt-4 space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">What your stock is worth</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Units on hand" value={String(health.stockUnits)} />
              {/*
                Cost and margin are behind `costs.view`, which no role grants
                by default. Everything else on this page is about what the
                shop sells; these two are about what the owner pays, and an
                employee with no reason to know it should not learn it from
                a dashboard tile.
              */}
              {seesCosts && (
                <MiniStat
                  label="At cost"
                  value={money(health.stockAtCost)}
                  note={
                    health.costKnownFor < health.total
                      ? `cost known for ${health.costKnownFor} of ${health.total}`
                      : "all products"
                  }
                />
              )}
              <MiniStat label="At retail" value={money(health.stockAtRetail)} tone="good" />
              {seesCosts && (
                <MiniStat
                  label="Potential margin"
                  value={health.potentialMargin === null ? "—" : money(health.potentialMargin)}
                  note={
                    health.potentialMargin === null
                      ? "no cost recorded yet"
                      : `on the ${health.costKnownFor} products with a cost`
                  }
                />
              )}
            </div>
            <Footnote>
              {seesCosts ? (
                <>
                  Cost comes from imported supplier files and is never shown to
                  customers. Margin is calculated only across products that have
                  one — counting the rest would report their full price as profit.
                </>
              ) : (
                <>
                  Retail value only. Cost price and profit are not part of your
                  access — ask the store owner if you need them.
                </>
              )}
            </Footnote>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-ocean-950">Running low</h3>
              <Link
                href="/vendor/products"
                className="text-xs font-bold text-ocean-700 hover:underline"
              >
                Restock →
              </Link>
            </div>
            {lowStock.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                Nothing is low on stock. Every visible product has more than{" "}
                {LOW_STOCK_THRESHOLD} units.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {lowStock.map(({ product, stock }) => (
                  <li key={product.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-100">
                      {product.icon}
                    </span>
                    <Link
                      href={`/vendor/products/${product.id}/edit`}
                      className="min-w-0 flex-1 truncate text-slate-700 hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold " +
                        (stock === 0
                          ? "bg-coral-100 text-coral-700"
                          : "bg-mango-100 text-mango-800")
                      }
                    >
                      {stock === 0 ? "Out of stock" : `${stock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
