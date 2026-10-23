"use client";

import { Suspense, useEffect, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { scopedKey } from "@/lib/storage-scope";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/dashboard/StatusBadge";
import ParcelCard from "@/components/track/ParcelCard";
import type { OrderParcel } from "@/app/actions";
import { LiveIndicator } from "@/components/track/OrderProgress";
import { sharedCourierGroups } from "@/lib/delivery";
import { useLiveOrder } from "@/lib/use-live-order";
import { money, shortDate } from "@/lib/format";
import { useT } from "@/components/prefs/PrefsProvider";
import { getUserOrdersAction } from "@/app/actions";
import { whatsappLink } from "@/lib/whatsapp";
import Link from "next/link";

/** Only a real, configured number — never the code's placeholder. */
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

/** "10240", "bm 10240", "BM-10240" → "BM-10240". */
function normaliseOrderId(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{4,}$/.test(v)) return `BM-${v}`;
  return v.replace(/^BM(?=\d)/, "BM-");
}
import type { Order, OrderStatus } from "@/lib/types";

// The journey steps live in lib/delivery.ts (JOURNEY_STEPS) and are rendered
// per parcel by ParcelCard — there is no order-wide timeline to define here.

function TrackContent() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id") || "";

  const t = useT();
  const { scope } = useCart();
  const [copied, setCopied] = useState(false);
  /** Signed in: the account's own orders, newest first (server). */
  const [mine, setMine] = useState<Order[]>([]);
  useEffect(() => {
    getUserOrdersAction()
      .then((list) => setMine([...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)))
      .catch(() => setMine([]));
  }, [scope]);
  // The browser-side order copy is per account — see lib/storage-scope.ts.
  const ordersKey = scopedKey("banaadir_user_orders", scope);
  const [input, setInput] = useState(queryId);
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [fetchedParcels, setFetchedParcels] = useState<OrderParcel[]>([]);
  const [brandStatuses, setBrandStatuses] = useState<
    Record<
      string,
      {
        status: OrderStatus;
        store: string;
        storeName: string;
        storeIcon: string;
        storeLogo?: string;
        orderId: string;
        total: number;
      }
    >
  >({});

  /*
   * The orders placed on this device (saved at checkout). Asking a
   * customer to type an order number they were shown once, on a screen
   * they have since closed, is where tracking usually ends.
   */
  const [recent, setRecent] = useState<Order[]>([]);
  useEffect(() => {
    let local: Order[] = [];
    try {
      local = JSON.parse(localStorage.getItem(ordersKey) || "[]");
    } catch {
      local = [];
    }
    const latest = [...local].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    setRecent(latest);
    // The saved copy has the status at checkout; ask the server for now.
    let cancelled = false;
    (async () => {
      const { getOrderAction } = await import("@/app/actions");
      const fresh = await Promise.all(latest.map((o) => getOrderAction(o.id).catch(() => undefined)));
      if (!cancelled) {
        setRecent(latest.map((o, i) => (fresh[i] ? { ...o, status: fresh[i]!.status } : o)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ordersKey]);

  async function performLookup(rawId: string) {
    const searchId = normaliseOrderId(rawId);
    if (!searchId) return;
    setInput(searchId);
    setIsSearching(true);
    setNotFound(false);

    const cleanId = searchId.trim().toLowerCase();
    let foundOrder: Order | null = null;

    // 1. Check local storage user orders first
    try {
      const localOrders: Order[] = JSON.parse(localStorage.getItem(ordersKey) || "[]");
      const localFound = localOrders.find((o) => o.id.toLowerCase() === cleanId);
      if (localFound) {
        foundOrder = localFound;
      }
    } catch {
      // Ignore
    }

    // 3. Fallback to Server Action lookup
    if (!foundOrder) {
      try {
        const { getOrderAction } = await import("@/app/actions");
        const fetched = await getOrderAction(cleanId);
        if (fetched) {
          foundOrder = fetched;
        }
      } catch {
        // Ignore
      }
    }

    if (foundOrder) {
      setOrder(foundOrder);
      setIsSearching(false);

      // The parcels themselves — each with its own courier, timeline and
      // estimate. This is the authoritative view; the localStorage copy
      // above only exists so the page works before the order syncs.
      try {
        const { getOrderParcelsAction, getBrandOrderStatusesAction } =
          await import("@/app/actions");
        const [fetched, statuses] = await Promise.all([
          getOrderParcelsAction(foundOrder.id),
          getBrandOrderStatusesAction(foundOrder.id),
        ]);
        setFetchedParcels(fetched);
        setBrandStatuses(statuses);
      } catch {
        // Ignore
      }
    } else {
      setOrder(null);
      setNotFound(true);
      setIsSearching(false);
    }
  }

  useEffect(() => {
    if (queryId) {
      setInput(queryId);
      void performLookup(queryId);
    }
  }, [queryId]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLookup(input);
  }

  /**
   * Keep the parcels current while the page is open.
   *
   * A customer who has just been told "your order is on the way" leaves
   * this tab open. Without polling, the seller marking it delivered ten
   * minutes later changes nothing on their screen, and the page quietly
   * becomes wrong while looking perfectly fine.
   */
  const liveOrder = useLiveOrder(order?.id, fetchedParcels);
  const parcels = liveOrder.parcels;

  /**
   * The parcels to show, one per store.
   *
   * Items are grouped by their own `store` when they carry one — that's the
   * case for the copy saved in this browser at checkout. An order fetched
   * from the server has items of just {productId, qty}, so grouping them
   * would collapse every parcel into one; there we build the list from the
   * per-parcel statuses instead, which always know their store.
   */
  const itemsWithStore = order?.items || [];
  const groupedStores: Record<string, typeof itemsWithStore> = {};
  for (const item of itemsWithStore) {
    if (!item.store) continue;
    groupedStores[item.store] = groupedStores[item.store] || [];
    groupedStores[item.store].push(item);
  }

  const storeEntries =
    Object.keys(groupedStores).length > 0
      ? Object.entries(groupedStores)
      : Object.keys(brandStatuses).map(
          (slug) => [slug, [] as typeof itemsWithStore] as const,
        );

  /**
   * Parcels sharing one driver, so the customer is told once instead of
   * being shown the same number three times and left to work out it's one
   * person making one trip.
   */
  const shared = sharedCourierGroups(
    parcels.map((p) => ({ order: p.order, storeName: p.storeName })),
  );
  const sharedWith = (storeSlug: string): string[] => {
    const group = shared.find((g) =>
      g.parcels.some((p) => p.order.store === storeSlug),
    );
    return group
      ? group.parcels.filter((p) => p.order.store !== storeSlug).map((p) => p.storeName)
      : [];
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ocean-50 text-3xl" aria-hidden>
          📦
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">{t("track.title")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("track.sub")}</p>
      </div>

      <form onSubmit={handleFormSubmit} className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="BM-12345"
          aria-label={t("track.title")}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono text-base font-semibold tracking-wide"
        />
        <button type="submit" disabled={isSearching} className="btn-primary shrink-0 !px-6 !py-2.5 disabled:opacity-50">
          {isSearching ? t("track.searching") : t("track.button")}
        </button>
      </form>

      <details className="mt-3 text-center text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-ocean-700">{t("track.where")}</summary>
        <p className="mx-auto mt-1.5 max-w-md">{t("track.whereAns")}</p>
      </details>

      {notFound && (
        <div className="mt-4 rounded-2xl border border-coral-200 bg-coral-50 p-4 text-sm font-semibold text-coral-800 animate-fade-up">
          ⚠️ {t("track.notFound", { id: input })}
        </div>
      )}

      {!order && (mine.length > 0 || recent.length > 0) && (
        <section className="mt-8">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-slate-500">
            {mine.length > 0 ? t("track.yours") : t("track.recent")}
          </h2>
          <ul className="mt-3 space-y-2">
            {(mine.length > 0
              ? // Still on the way first — that's what someone opening a tracker wants.
                [...mine].sort((a, b) => Number(a.status === "delivered" || a.status === "cancelled") - Number(b.status === "delivered" || b.status === "cancelled"))
              : recent
            ).map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    setInput(o.id);
                    void performLookup(o.id);
                  }}
                  className="card flex w-full items-center justify-between gap-3 p-4 text-left transition hover:border-ocean-300"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-bold text-ocean-950">{o.id}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {shortDate(o.date)} · {o.items.length} item{o.items.length === 1 ? "" : "s"} · {money(o.total)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={o.status} t={t} />
                    <span className="text-sm font-semibold text-ocean-700">Track →</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {mine.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              <Link href="/login?next=/track" className="font-semibold text-ocean-700 hover:underline">
                {t("track.signIn")}
              </Link>
            </p>
          )}
        </section>
      )}

      {order && (
        <div className="card mt-8 p-6 animate-fade-up space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-4">
            <div>
              <p className="font-display text-xl font-extrabold text-ocean-950">
                Order #{order.id}
              </p>
              <p className="text-xs text-slate-500">
                Placed {shortDate(order.date)} · Deliver to {order.city} ·{" "}
                {money(order.total)}
              </p>
            </div>
            <StatusBadge status={order.status} t={t} />
          </div>

          {/* The whole order in one line, then help and sharing. */}
          {parcels.length > 1 && (
            <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
              parcels.every((p) => p.order.status === "delivered") ? "bg-emerald-50 text-emerald-800" : "bg-ocean-50 text-ocean-900"
            }`}>
              {parcels.every((p) => p.order.status === "delivered")
                ? t("track.allDelivered")
                : `📦 ${t("track.summary", {
                    done: parcels.filter((p) => p.order.status === "delivered").length,
                    total: parcels.length,
                  })}`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/track?id=${order.id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // No clipboard (old browser / http): nothing to do.
                }
              }}
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ocean-800 ring-1 ring-sand-200 hover:ring-ocean-300"
            >
              🔗 {copied ? t("track.copied") : t("track.copy")}
            </button>
            {SUPPORT ? (
              <a
                href={whatsappLink(SUPPORT, `Hello Banaadir Mall, I have a question about my order ${order.id}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:brightness-95"
              >
                💬 {t("track.whatsapp")}
              </a>
            ) : (
              <Link href="/help" className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ocean-800 ring-1 ring-sand-200">
                💬 {t("track.help")}
              </Link>
            )}
          </div>

          {/*
            There is deliberately NO order-wide timeline here.

            Progress belongs to a parcel, not an order: one shop can have
            delivered while another hasn't packed. A single combined
            timeline has to pick one of those to display, and it was
            actively contradicting the cards below it — the order read
            "Processing" while the parcel underneath said "On the way".
            Each parcel now carries its own, which is also how every large
            marketplace presents a multi-seller order.
          */}
          {order.status === "cancelled" && (
            <p className="mt-5 text-sm text-slate-500">
              This order was cancelled. If that doesn&apos;t look right,
              contact us via the Help page and we&apos;ll sort it out.
            </p>
          )}

          {/* Per-parcel status, courier and journey */}
          {storeEntries.length > 0 && (
            <div className="border-t border-sand-200 pt-6">
              <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-slate-400 mb-1">
                {storeEntries.length > 1
                  ? `Your ${storeEntries.length} parcels`
                  : "Your parcel"}
              </h3>
              {storeEntries.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  Each store ships separately, so your parcels may arrive on
                  different days.
                </p>
              )}
              {/* Same driver across several parcels — say it once, at the
                  top, instead of repeating the number on each card. */}
              {shared.map((group) => (
                <p
                  key={group.courier.phone}
                  className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900"
                >
                  🚚 <strong>{group.courier.name}</strong> is bringing{" "}
                  {group.parcels.length} of your parcels together —{" "}
                  {group.parcels.map((p) => p.storeName).join(", ")}. One
                  delivery, one number to call.
                </p>
              ))}

              <div className="space-y-4">
                {/* The server's parcels carry courier, timeline and estimate.
                    Before an order syncs (or without Supabase) fall back to
                    the copy saved in this browser, which has the items but
                    no dispatch details yet. */}
                {parcels.length > 0
                  ? parcels.map((p, i) => (
                      <ParcelCard
                        key={p.order.id}
                        order={p.order}
                        storeName={p.storeName}
                        storeIcon={p.storeIcon}
                        storeLogo={p.storeLogo}
                        items={groupedStores[p.order.store] ?? p.order.items}
                        index={i + 1}
                        total={parcels.length}
                        sharedWith={sharedWith(p.order.store)}
                      />
                    ))
                  : storeEntries.map(([storeSlug, storeItems], i) => {
                      const brand = brandStatuses[storeSlug];
                      const storeName =
                        brand?.storeName ??
                        storeItems.find((it) => it.storeName)?.storeName ??
                        storeSlug.replace(/-/g, " ");
                      return (
                        <ParcelCard
                          key={storeSlug}
                          order={{
                            ...order,
                            id: brand?.orderId ?? order.id,
                            store: storeSlug,
                            status: brand?.status ?? order.status,
                          }}
                          storeName={storeName}
                          storeIcon={brand?.storeIcon}
                          storeLogo={brand?.storeLogo}
                          items={storeItems}
                          index={i + 1}
                          total={storeEntries.length}
                        />
                      );
                    })}
              </div>

              <div className="mt-4">
                <LiveIndicator
                  live={liveOrder.live}
                  lastCheckedAt={liveOrder.lastCheckedAt}
                  onRefresh={liveOrder.refresh}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading order tracker…</div>}>
      <TrackContent />
    </Suspense>
  );
}
