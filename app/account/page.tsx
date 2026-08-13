import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrders, getStore, getVendorStats } from "@/lib/api";
import { money } from "@/lib/format";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import StoreAvatar from "@/components/StoreAvatar";
import AccountOrdersClient from "@/components/account/AccountOrdersClient";
import AccountStats from "@/components/account/AccountStats";
import RecoControls from "@/components/reco/RecoControls";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "My Account" };

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  MY ACCOUNT — the shopper's relationship with the shop, on one screen.
 * ─────────────────────────────────────────────────────────────────────────
 * ── What this replaced, and why ──────────────────────────────────────────
 * A profile card and four grey link tiles. Everything on it was navigation:
 * nothing told you anything you did not already know. The account page in
 * every shopping app worth copying answers three questions before you
 * scroll — what do I have, where are my orders, and who do I ask — and the
 * order of those questions is the layout.
 *
 * So: a coloured header carrying the four numbers that ARE the answer to
 * "what do I have", then order status at a glance, then help, then the
 * long tail.
 *
 * ── Every figure here is real ────────────────────────────────────────────
 * The reference app this was modelled on shows Coupons, Points and a VIP
 * savings tier. Banaadir Mall has no points scheme, no coupon wallet and no
 * membership tiers, so those tiles are not here. Inventing a "460 Points"
 * chip that counts nothing would look the part exactly until somebody
 * tapped it. What IS shown — orders, saved items, basket, lifetime spend,
 * per-status counts — is read from real data.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The order journey, in the order it actually happens. */
const ORDER_STAGES: { status: OrderStatus; label: string; icon: string }[] = [
  { status: "pending", label: "Pending", icon: "🕒" },
  { status: "processing", label: "Processing", icon: "📦" },
  { status: "shipped", label: "On the way", icon: "🚚" },
  { status: "delivered", label: "Delivered", icon: "✓" },
];

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSeller = session.role === "seller";
  const isAdmin = session.role === "admin";

  const store = isSeller && session.store ? await getStore(session.store) : undefined;
  const stats = store ? await getVendorStats(store.slug) : undefined;

  const allOrders = await getOrders();
  const cleanEmail = session.email.trim().toLowerCase();
  const cleanName = session.name.trim().toLowerCase();

  const serverOrders = allOrders.filter((o) => {
    if (o.email && o.email.trim().toLowerCase() === cleanEmail) return true;
    if (o.customer && o.customer.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  // Cancelled orders are excluded from spend — money that came back is not
  // money spent, and a lifetime total that counts it is simply wrong.
  const spent = serverOrders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + (order.total || 0), 0);

  const countByStatus = (status: OrderStatus) =>
    serverOrders.filter((order) => order.status === status).length;

  /** Help and housekeeping. Every one of these is a page that exists. */
  const services = [
    { href: "/track", icon: "📍", label: "Track Order" },
    { href: "/help", icon: "💬", label: "Get Help" },
    { href: "/learn", icon: "📚", label: "Guides" },
    { href: "/stores", icon: "🏪", label: "All Stores" },
    { href: "/wishlist", icon: "♡", label: "Wishlist" },
    { href: "/sell", icon: "✦", label: "Sell With Us" },
  ];

  return (
    <div className="pb-10">
      {/* ── Header ───────────────────────────────────────────────────
          Full-bleed and deeply padded at the bottom, so the first white
          card can be pulled up over its lower edge. That overlap is the
          whole trick: it makes the page read as one object with a coloured
          top rather than as a coloured strip with cards under it. */}
      <header className="relative overflow-hidden bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 px-4 pb-24 pt-6">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.07]" />
        <div className="pointer-events-none absolute -bottom-28 -left-10 h-64 w-64 rounded-full bg-mango-400/10" />

        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              {store ? (
                <StoreAvatar
                  store={store}
                  size={64}
                  className="h-16 w-16 shrink-0 rounded-2xl text-3xl ring-2 ring-white/30"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 font-display text-2xl font-extrabold text-white ring-2 ring-white/30 backdrop-blur-sm">
                  {session.name.charAt(0).toUpperCase()}
                </span>
              )}

              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-extrabold text-white">
                  {session.name}
                </h1>
                <p className="truncate text-sm text-ocean-100">{session.email}</p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-mango-200 ring-1 ring-white/20">
                  {isAdmin
                    ? `🛡️ Administrator${session.access ? ` · ${session.access}` : ""}`
                    : isSeller
                      ? `🏪 Store owner${session.access ? ` · ${session.access}` : ""}`
                      : "⭐ Member"}
                </p>
              </div>
            </div>

            <Link
              href="/help"
              aria-label="Get help"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-base text-white ring-1 ring-white/20 transition hover:bg-white/25"
            >
              ?
            </Link>
          </div>

          <AccountStats orders={serverOrders.length} spent={spent} />
        </div>
      </header>

      <div className="mx-auto -mt-16 max-w-5xl space-y-4 px-4">
        {/* ── My orders ────────────────────────────────────────────── */}
        <section className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-ocean-950">My Orders</h2>
            <Link
              href="#my-orders"
              className="text-xs font-bold text-slate-400 transition hover:text-ocean-700"
            >
              All orders →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1">
            {ORDER_STAGES.map((stage) => {
              const count = countByStatus(stage.status);
              return (
                <Link
                  key={stage.status}
                  href="#my-orders"
                  className="group flex flex-col items-center gap-1.5 rounded-xl py-2 transition hover:bg-sand-50"
                >
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-sand-100 text-lg transition group-hover:bg-ocean-50">
                    {stage.icon}
                    {/* The badge only exists when there is something to
                        report. A row of grey zeroes trains people to stop
                        reading the row. */}
                    {count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                  <span className="text-center text-[11px] font-semibold leading-tight text-slate-600">
                    {stage.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Seller / admin dashboard ─────────────────────────────── */}
        {(isSeller || isAdmin) && (
          <Link
            href={isAdmin ? "/admin" : "/vendor"}
            className="flex flex-wrap items-center gap-5 rounded-2xl bg-gradient-to-r from-ocean-950 to-ocean-700 p-5 text-white transition hover:shadow-xl"
          >
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold">
                {isAdmin ? "Marketplace Control Panel" : `${store?.name} Dashboard`}
              </p>
              <p className="mt-0.5 text-sm text-ocean-100">
                {isAdmin
                  ? "Marketing, stores, products, orders and platform staff."
                  : "Products, photos, variants, promotions, orders and your team."}
              </p>
            </div>
            {stats && (
              <div className="flex gap-6">
                <div>
                  <p className="font-display text-xl font-extrabold">{money(stats.revenue)}</p>
                  <p className="text-[11px] text-ocean-200">Revenue (all time)</p>
                </div>
                <div>
                  <p className="font-display text-xl font-extrabold">{stats.orderCount}</p>
                  <p className="text-[11px] text-ocean-200">Orders</p>
                </div>
              </div>
            )}
            <span className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold ring-1 ring-white/25">
              Open →
            </span>
          </Link>
        )}

        {/* ── Service ──────────────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="font-display font-bold text-ocean-950">Help &amp; Services</h2>
          <div className="mt-4 grid grid-cols-3 gap-y-5 sm:grid-cols-6">
            {services.map((service) => (
              <Link
                key={service.href}
                href={service.href}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sand-100 text-lg transition group-hover:bg-ocean-50 group-active:scale-95">
                  {service.icon}
                </span>
                <span className="text-[11px] font-semibold leading-tight text-slate-600 transition group-hover:text-ocean-700">
                  {service.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Orders list ──────────────────────────────────────────── */}
        <div id="my-orders" className="scroll-mt-24">
          <AccountOrdersClient
            userName={session.name}
            userEmail={session.email}
            serverOrders={serverOrders}
          />
        </div>

        {/* ── What the recommender knows, and the button that wipes it. */}
        <RecoControls />

        {/* Sign out sits alone at the bottom, away from everything else —
            it is the one control on this page nobody wants to hit by
            accident on the way to their orders. */}
        <div className="pt-2 text-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
