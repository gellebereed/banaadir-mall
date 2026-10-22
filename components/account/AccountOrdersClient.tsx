"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/dashboard/StatusBadge";
import OrderVendorSections from "@/components/account/OrderVendorSections";
import { useT } from "@/components/prefs/PrefsProvider";
import { getUserOrdersAction } from "@/app/actions";
import { useCart } from "@/lib/cart-context";
import { scopedKey } from "@/lib/storage-scope";
import { money, shortDate } from "@/lib/format";
import { orderBelongsTo } from "@/lib/order-utils";
import type { Order, OrderStatus } from "@/lib/types";

interface OrderItemExt {
  productId: string;
  name: string;
  price: number;
  qty: number;
  store?: string;
  /** The shop's display name, captured on the order. */
  storeName?: string;
  image?: string;
  selectedColor?: string;
  selectedSize?: string;
  offer?: string;
}

interface LocalOrderEntry {
  id: string;
  date: string;
  customer?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  total: number;
  status: OrderStatus;
  items: OrderItemExt[];
}

type Tab = "all" | "active" | "delivered" | "cancelled";
const TABS: Tab[] = ["all", "active", "delivered", "cancelled"];
const PAGE = 8;

/** The journey, for the small progress line on each card. */
const STEPS: OrderStatus[] = ["pending", "processing", "shipped", "delivered"];

/**
 * Map a stored order line to what this screen renders. Orders carry their
 * own name, price and photo (see submitOrderAction); this only falls back
 * for records written before that.
 */
function orderLine(order: Order) {
  return (item: Order["items"][number]): OrderItemExt => ({
    productId: item.productId,
    name: item.name ?? `Product ${item.productId}`,
    price: item.price ?? order.total / Math.max(1, item.qty),
    qty: item.qty,
    store: item.store ?? order.store,
    storeName: item.storeName,
    image: item.image,
    selectedColor: item.selectedColor,
    selectedSize: item.selectedSize,
    offer: item.offer,
  });
}

const isActive = (status: OrderStatus) => status !== "delivered" && status !== "cancelled";

/**
 * MY ORDERS — every order this shopper has placed, newest first.
 *
 * Each card answers "where is it and what can I do?" at a glance: the
 * photos, the total, where it has got to, and the one action that fits —
 * Track while it's coming, Buy again once it's here. The per-shop detail
 * (parcels, couriers, "contact the shop") opens on demand, and only an
 * open card keeps polling the server for changes.
 */
export default function AccountOrdersClient({
  userName,
  userEmail,
  serverOrders = [],
  slugs = {},
}: {
  userName: string;
  userEmail: string;
  serverOrders?: Order[];
  /** productId → slug, for "Write a review" links. */
  slugs?: Record<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const { scope, addToCart } = useCart();
  const [orders, setOrders] = useState<LocalOrderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [reordering, setReordering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);

  const user = useMemo(() => ({ name: userName, email: userEmail }), [userName, userEmail]);

  useEffect(() => {
    async function loadMergedOrders() {
      setLoading(true);
      const merged = new Map<string, LocalOrderEntry>();

      // 1. This device's copies, saved at checkout (only this user's).
      try {
        const local: LocalOrderEntry[] = JSON.parse(
          localStorage.getItem(scopedKey("banaadir_user_orders", scope)) || "[]",
        );
        local.filter((o) => orderBelongsTo(o, user)).forEach((o) => o.id && merged.set(o.id.toLowerCase(), o));
      } catch {
        // A malformed local copy is not worth failing the page over.
      }

      // 2. The server's records — the truth for status.
      const fromServer = (o: Order) => {
        const base = o.id.split("-").slice(0, 2).join("-").toLowerCase();
        const existing = merged.get(o.id.toLowerCase()) ?? merged.get(base);
        if (existing) {
          existing.status = o.status;
          return;
        }
        merged.set(o.id.toLowerCase(), {
          id: o.id,
          date: o.date,
          customer: o.customer,
          email: o.email,
          city: o.city,
          total: o.total,
          status: o.status,
          items: (o.items || []).map(orderLine(o)),
        });
      };
      serverOrders.filter((o) => orderBelongsTo(o, user)).forEach(fromServer);
      try {
        (await getUserOrdersAction()).forEach((o) => !merged.has(o.id.toLowerCase()) && fromServer(o));
      } catch {
        // Offline: what we have is still worth showing.
      }

      setOrders([...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
      setLoading(false);
    }
    void loadMergedOrders();
  }, [user, serverOrders, scope]);

  // The status row at the top of the account page links here with a hash
  // (#orders-active …) — pick the matching tab.
  useEffect(() => {
    const fromHash = () => {
      const wanted = window.location.hash.replace("#orders-", "") as Tab;
      if (TABS.includes(wanted)) {
        setTab(wanted);
        setShown(PAGE);
        document.getElementById("my-orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const counts: Record<Tab, number> = {
    all: orders.length,
    active: orders.filter((o) => isActive(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  const filtered = orders.filter((o) => {
    if (tab === "active" && !isActive(o.status)) return false;
    if (tab === "delivered" && o.status !== "delivered") return false;
    if (tab === "cancelled" && o.status !== "cancelled") return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      o.id.toLowerCase().includes(q) ||
      (o.city ?? "").toLowerCase().includes(q) ||
      o.items.some(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.storeName ?? i.store ?? "").toLowerCase().includes(q),
      )
    );
  });

  async function buyAgain(order: LocalOrderEntry) {
    setReordering(order.id);
    setNotice(null);
    try {
      const { reorderItemsAction } = await import("@/app/actions");
      const { lines, unavailable } = await reorderItemsAction(
        order.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          selectedColor: i.selectedColor,
          selectedSize: i.selectedSize,
        })),
      );
      lines.forEach((line) => addToCart(line));
      if (unavailable.length) setNotice({ id: order.id, text: t("orders.unavailable", { items: unavailable.join(", ") }) });
      if (lines.length) router.push("/cart");
    } finally {
      setReordering(null);
    }
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold text-ocean-950">
            {t("orders.title")} {!loading && <span className="text-base text-slate-400">({orders.length})</span>}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("orders.sub")}</p>
        </div>
        {orders.length > 3 && (
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={t("orders.search")}
            aria-label={t("orders.search")}
            className="input !py-2 text-sm sm:max-w-xs"
          />
        )}
      </div>

      {orders.length > 0 && (
        <div role="tablist" className="rail-scroll -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setShown(PAGE);
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                tab === key ? "bg-ocean-800 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
              }`}
            >
              {t(`orders.tab.${key}`)}
              <span className={`ml-1.5 text-xs ${tab === key ? "text-ocean-100" : "text-slate-400"}`}>{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-sand-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-10 text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sand-100 text-4xl" aria-hidden>
            🛍️
          </span>
          <p className="mt-4 font-display text-lg font-bold text-ocean-950">{t("orders.empty")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("orders.emptySub")}</p>
          <Link href="/products" className="btn-primary mt-5 inline-flex">
            {t("cart.startShopping")} →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t("orders.noMatch")}</div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, shown).map((order) => {
            const units = order.items.reduce((sum, i) => sum + i.qty, 0);
            const shopSlugs = [...new Set(order.items.map((i) => i.store || "unknown-store"))];
            const expanded = open.has(order.id);
            const step = STEPS.indexOf(order.status);
            const reviewSlug = slugs[order.items[0]?.productId ?? ""];

            const groups: Record<string, OrderItemExt[]> = {};
            for (const item of order.items) (groups[item.store || "unknown-store"] ??= []).push(item);
            const storeLabel = (slug: string, items: OrderItemExt[]) =>
              items.find((i) => i.storeName)?.storeName ??
              (slug === "unknown-store" ? "Banaadir Mall" : slug.replace(/-/g, " "));

            return (
              <article key={order.id} className="card overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">
                        {t("orders.placed", { date: shortDate(order.date) })}
                        {order.city && ` · ${order.city}`}
                      </p>
                      <p className="font-mono text-sm font-bold text-ocean-950">{t("orders.order", { id: order.id })}</p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  {/* What's in it — the photos say more than a list. */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex shrink-0 -space-x-3">
                      {order.items.slice(0, 4).map((item, i) => (
                        <span
                          key={i}
                          className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-xl ring-2 ring-white"
                        >
                          {item.image ? (
                            <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />
                          ) : (
                            "🛍️"
                          )}
                        </span>
                      ))}
                      {order.items.length > 4 && (
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-sand-200 text-xs font-bold text-slate-600 ring-2 ring-white">
                          +{order.items.length - 4}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">
                        {order.items[0]?.name}
                        {order.items.length > 1 && <span className="text-slate-400"> +{order.items.length - 1}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {units === 1 ? t("cart.itemsOne") : t("cart.itemsMany", { n: units })}
                        {shopSlugs.length > 1 && ` · ${t("orders.shops", { n: shopSlugs.length })}`}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-lg font-extrabold tabular-nums text-ocean-950">{money(order.total)}</p>
                  </div>

                  {/* Where it has got to. */}
                  {order.status !== "cancelled" && (
                    <div className="mt-4">
                      <div className="flex gap-1" aria-hidden>
                        {STEPS.map((s, i) => (
                          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? (order.status === "delivered" ? "bg-emerald-500" : "bg-ocean-600") : "bg-sand-200"}`} />
                        ))}
                      </div>
                      <p className={`mt-1.5 text-xs font-semibold ${order.status === "delivered" ? "text-emerald-700" : "text-ocean-800"}`}>
                        {t(`orders.status.${order.status}`)}
                      </p>
                    </div>
                  )}

                  {notice?.id === order.id && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice.text}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isActive(order.status) ? (
                      <Link href={`/track?id=${order.id}`} className="btn-primary !px-5 !py-2 text-sm">
                        📍 {t("orders.track")}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => buyAgain(order)}
                        disabled={reordering === order.id}
                        className="btn-primary !px-5 !py-2 text-sm disabled:opacity-60"
                      >
                        🔁 {reordering === order.id ? t("orders.adding") : t("orders.buyAgain")}
                      </button>
                    )}
                    {order.status === "delivered" && reviewSlug && (
                      <Link
                        href={`/product/${reviewSlug}#reviews`}
                        className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ocean-800 ring-1 ring-sand-200 hover:ring-ocean-300"
                      >
                        ⭐ {t("orders.review")}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => toggle(order.id)}
                      aria-expanded={expanded}
                      className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
                    >
                      {expanded ? t("orders.hide") : t("orders.details")} {expanded ? "▴" : "▾"}
                    </button>
                  </div>
                </div>

                {/* Parcels, couriers and "contact the shop" — mounted only
                    when open, so a long history isn't polling the server. */}
                {expanded && (
                  <div className="border-t border-sand-100 bg-sand-50/40">
                    <OrderVendorSections
                      orderId={order.id}
                      groups={Object.entries(groups)}
                      fallbackStatus={order.status}
                      storeLabel={storeLabel}
                    />
                  </div>
                )}
              </article>
            );
          })}

          {filtered.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-ocean-700 ring-1 ring-sand-200 hover:ring-ocean-300"
            >
              {t("orders.showMore", { n: filtered.length - shown })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
