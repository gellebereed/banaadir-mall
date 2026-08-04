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
  LOW_STOCK_THRESHOLD,
  parseRange,
  resolvePeriod,
  soldProductIds,
  summariseCatalogue,
  summariseSales,
} from "@/lib/analytics";
import {
  getAllProducts,
  getAllStores,
  getCategories,
  getFlashRequests,
  getOrders,
} from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { totalStock } from "@/lib/product-utils";

export const metadata: Metadata = { title: "Dashboard" };

const TABS: TabDef[] = [
  { key: "sales", label: "Sales", icon: "💰" },
  { key: "stores", label: "Stores", icon: "🏪" },
  { key: "products", label: "Products", icon: "📦" },
  { key: "orders", label: "Orders", icon: "🧾" },
];

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ADMIN DASHBOARD — the whole marketplace, in one place.
 * ─────────────────────────────────────────────────────────────────────────
 * Same structure as the seller's, one level up: the approval queue first
 * (the only things that BLOCK other people from working), then the numbers
 * for the chosen period, then a view the admin picks.
 *
 * Every figure runs through lib/analytics.ts, so a store's revenue here and
 * the same store's revenue on its own dashboard are computed by identical
 * code — they cannot disagree.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "sales";
  const period = resolvePeriod(range);

  const [orders, stores, products, flashRequests, categories] = await Promise.all([
    getOrders(),
    getAllStores(),
    getAllProducts(),
    getFlashRequests(),
    getCategories(true),
  ]);

  const sales = summariseSales({ orders, products, stores, period });
  const health = summariseCatalogue(products, soldProductIds(orders));

  const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));
  const storesBySlug = new Map(stores.map((store) => [store.slug, store]));
  const productsById = new Map(products.map((product) => [product.id, product]));

  const pendingStores = stores.filter((store) => store.status === "pending").length;
  const pendingFlash = flashRequests.filter((request) => request.status === "pending").length;
  const suspendedStores = stores.filter((store) => store.status === "suspended").length;
  const unseenOrders = orders.filter((order) => !order.seenAt).length;
  const stuckOrders = orders.filter((order) => order.status === "pending").length;

  const attention: AttentionItem[] = [
    { icon: "🏪", label: "Store applications to review", count: pendingStores, href: "/admin/stores", tone: "urgent" },
    { icon: "⚡", label: "Flash-deal applications", count: pendingFlash, href: "/admin/flash", tone: "urgent" },
    { icon: "⏳", label: "Orders still pending", count: stuckOrders, href: "/admin/orders", tone: "warn" },
    { icon: "🆕", label: "Orders no seller has opened", count: unseenOrders, href: "/admin/orders", tone: "warn" },
    { icon: "🚫", label: "Suspended stores", count: suspendedStores, href: "/admin/stores", tone: "info" },
    { icon: "📸", label: "Products with no photo", count: health.missingPhotos, href: "/admin/products", tone: "info" },
    { icon: "🙈", label: "Products hidden from the storefront", count: health.hidden, href: "/admin/products", tone: "info" },
  ];

  const periodLabel = period.unbounded ? "all time" : `last ${period.label}`;

  // Product counts per store, for the leaderboard.
  const productsByStore = new Map<string, number>();
  for (const product of products) {
    productsByStore.set(product.store, (productsByStore.get(product.store) ?? 0) + 1);
  }

  return (
    <div>
      {/* ── Head ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything across Banaadir Mall — {periodLabel}
            {!period.unbounded && (
              <span className="text-slate-400">
                {" "}
                ({shortDate(period.start)} – {shortDate(period.end)})
              </span>
            )}
          </p>
        </div>
        <RangeFilter basePath="/admin" range={range} tab={tab} />
      </div>

      <AttentionPanel items={attention} />

      {/* ── Headline numbers ─────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          icon="💰"
          label="Marketplace revenue"
          value={money(sales.revenue)}
          delta={sales.revenueDelta}
          note={period.unbounded ? undefined : `was ${money(sales.revenueDelta.previous)}`}
        />
        <KpiCard
          icon="🧾"
          label="Orders"
          value={String(sales.orders)}
          delta={sales.ordersDelta}
          href="/admin/orders"
        />
        <KpiCard
          icon="👥"
          label="Buyers"
          value={String(sales.customers)}
          note="distinct customers in this period"
        />
        <KpiCard icon="💳" label="Average order" value={money(sales.aov)} delta={sales.aovDelta} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <TrendChart
          series={sales.series}
          title="Marketplace revenue"
          subtitle={
            period.unbounded
              ? "Every order ever placed"
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
          href="/admin/orders"
          hrefLabel="All orders"
        />
      </div>

      {/* ── Section tabs ─────────────────────────────────────────── */}
      <div className="mt-8">
        <TabFilter basePath="/admin" tabs={TABS} active={tab} range={range} />
      </div>

      {tab === "sales" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <RankedList
              title="Revenue by store"
              rows={sales.topStores}
              href="/admin/stores"
              hrefLabel="All stores"
              renderHref={(row) => `/store/${row.id}`}
              emptyText="No sales in this period."
            />
            <RankedList
              title="Revenue by category"
              rows={sales.topCategories.map((row) => ({
                ...row,
                label: categoryNames.get(row.id) ?? row.label,
              }))}
              emptyText="No sales in this period."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankedList
              title="Best-selling products"
              rows={sales.topProducts.map((row) => ({
                ...row,
                sublabel: storesBySlug.get(productsById.get(row.id)?.store ?? "")?.name,
              }))}
              limit={8}
              href="/admin/products"
              hrefLabel="All products"
              emptyText="No sales in this period."
            />
            <div className="card p-5">
              <h3 className="font-display font-bold text-ocean-950">Orders by city</h3>
              {sales.topCities.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No orders in this period.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {sales.topCities.slice(0, 8).map((city) => (
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
              Some orders predate per-item price capture, so product and category
              splits use current catalogue prices. Headline revenue is unaffected.
            </Footnote>
          )}
        </div>
      )}

      {tab === "stores" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat
              label="Active"
              value={String(stores.filter((s) => s.status === "active").length)}
              tone="good"
            />
            <MiniStat
              label="Pending approval"
              value={String(pendingStores)}
              tone={pendingStores > 0 ? "warn" : undefined}
            />
            <MiniStat
              label="Suspended or rejected"
              value={String(
                stores.filter((s) => s.status === "suspended" || s.status === "rejected").length,
              )}
            />
            <MiniStat
              label="Sold in this period"
              value={`${sales.topStores.length} of ${stores.length}`}
              note="stores with at least one order"
            />
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-sand-200 p-5">
              <h3 className="font-display font-bold text-ocean-950">
                Store leaderboard — {periodLabel}
              </h3>
              <Link href="/admin/stores" className="text-xs font-bold text-ocean-700 hover:underline">
                Manage stores →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Store</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Products</th>
                    <th className="px-5 py-3 text-right">Orders</th>
                    <th className="px-5 py-3 text-right">Units</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stores
                    .map((store) => {
                      const ranked = sales.topStores.find((row) => row.id === store.slug);
                      return {
                        store,
                        revenue: ranked?.revenue ?? 0,
                        orders: ranked?.orders ?? 0,
                        units: ranked?.units ?? 0,
                      };
                    })
                    .sort((a, b) => b.revenue - a.revenue)
                    .map(({ store, revenue, orders: orderCount, units }) => (
                      <tr key={store.slug} className="border-t border-sand-100 hover:bg-sand-50">
                        <td className="px-5 py-3">
                          <Link href={`/store/${store.slug}`} className="flex items-center gap-2 hover:underline">
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                              style={{
                                background: `linear-gradient(135deg, ${store.art.from}, ${store.art.to})`,
                              }}
                            >
                              {store.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-800">
                                {store.name}
                              </span>
                              <span className="block truncate text-xs text-slate-400">
                                {store.city}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-semibold capitalize " +
                              (store.status === "active"
                                ? "bg-emerald-100 text-emerald-700"
                                : store.status === "pending"
                                  ? "bg-mango-100 text-mango-800"
                                  : "bg-coral-100 text-coral-700")
                            }
                          >
                            {store.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {productsByStore.get(store.slug) ?? 0}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">{orderCount}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{units}</td>
                        <td className="px-5 py-3 text-right font-semibold text-ocean-950">
                          {money(revenue)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500">
                          {sales.revenue > 0 ? `${Math.round((revenue / sales.revenue) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "products" && (
        <div className="mt-4 space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-bold text-ocean-950">
              Catalogue health — all {health.total} products
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              The whole marketplace, regardless of the selected period.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Live" value={String(health.live)} tone="good" />
              <MiniStat label="Hidden" value={String(health.hidden)} />
              <MiniStat
                label="No photo"
                value={String(health.missingPhotos)}
                tone={health.missingPhotos > 0 ? "warn" : undefined}
              />
              <MiniStat label="No barcode" value={String(health.missingBarcode)} />
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
              <MiniStat label="Never sold" value={String(health.neverSold)} />
              <MiniStat label="Stock on hand" value={`${health.stockUnits} units`} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-display font-bold text-ocean-950">Inventory value</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat label="At cost" value={money(health.stockAtCost)} />
                <MiniStat label="At retail" value={money(health.stockAtRetail)} tone="good" />
                <MiniStat
                  label="Potential margin"
                  value={health.potentialMargin === null ? "—" : money(health.potentialMargin)}
                />
              </div>
              <Footnote>
                Cost is known for {health.costKnownFor} of {health.total} products —
                it arrives with supplier imports and is never shown to customers.
                Margin covers only those, so it is not diluted by products whose
                cost has never been recorded.
              </Footnote>
            </div>

            <div className="card p-5">
              <h3 className="font-display font-bold text-ocean-950">Products per store</h3>
              <ul className="mt-4 space-y-2">
                {[...productsByStore.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([slug, count]) => (
                    <li key={slug} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">
                        {storesBySlug.get(slug)?.name ?? slug}
                      </span>
                      <span className="shrink-0 font-semibold text-ocean-950">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-ocean-950">Needs restocking</h3>
              <Link href="/admin/products" className="text-xs font-bold text-ocean-700 hover:underline">
                All products →
              </Link>
            </div>
            {(() => {
              const low = products
                .filter((product) => !product.hidden)
                .map((product) => ({ product, stock: totalStock(product) }))
                .filter((entry) => entry.stock <= LOW_STOCK_THRESHOLD)
                .sort((a, b) => a.stock - b.stock)
                .slice(0, 10);

              if (low.length === 0) {
                return (
                  <p className="mt-4 text-sm text-slate-400">
                    Every visible product has more than {LOW_STOCK_THRESHOLD} units.
                  </p>
                );
              }

              return (
                <ul className="mt-4 space-y-2">
                  {low.map(({ product, stock }) => (
                    <li key={product.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-100">
                        {product.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{product.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {storesBySlug.get(product.store)?.name ?? product.store}
                      </span>
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold " +
                          (stock === 0
                            ? "bg-coral-100 text-coral-700"
                            : "bg-mango-100 text-mango-800")
                        }
                      >
                        {stock === 0 ? "Out" : `${stock} left`}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-4">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-sand-200 p-5">
              <h3 className="font-display font-bold text-ocean-950">
                Orders in {periodLabel} ({sales.orders + sales.cancelled})
              </h3>
              <Link href="/admin/orders" className="text-xs font-bold text-ocean-700 hover:underline">
                Manage orders →
              </Link>
            </div>

            {orders.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No orders yet.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3">Store</th>
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
                      .slice(0, 50)
                      .map((order) => (
                        <tr key={order.id} className="border-t border-sand-100 hover:bg-sand-50">
                          <td className="px-5 py-3 font-bold text-ocean-800">{order.id}</td>
                          <td className="px-5 py-3 text-slate-600">
                            {storesBySlug.get(order.store)?.name ?? order.store}
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
    </div>
  );
}
