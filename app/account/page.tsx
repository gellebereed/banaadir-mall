import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrders, getStore, getVendorStats } from "@/lib/api";
import { money } from "@/lib/format";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import StoreAvatar from "@/components/StoreAvatar";
import AccountOrdersClient from "@/components/account/AccountOrdersClient";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSeller = session.role === "seller";
  const isAdmin = session.role === "admin";

  const store = isSeller && session.store ? await getStore(session.store) : undefined;
  const stats = store ? await getVendorStats(store.slug) : undefined;

  const serverOrders = await getOrders();

  const quickLinks = isAdmin
    ? [
        { href: "/admin", icon: "📊", label: "Control Panel" },
        { href: "/admin/marketing", icon: "📣", label: "Marketing" },
        { href: "/admin/stores", icon: "🏪", label: "Stores" },
        { href: "/admin/orders", icon: "🧾", label: "All Orders" },
      ]
    : isSeller
      ? [
          { href: "/vendor", icon: "📊", label: "My Dashboard" },
          { href: "/vendor/products", icon: "📦", label: "My Products" },
          { href: "/vendor/orders", icon: "🧾", label: "Store Orders" },
          { href: "/vendor/settings", icon: "⚙️", label: "Store Settings" },
        ]
      : [
          { href: "/track", icon: "📦", label: "Track Order" },
          { href: "/cart", icon: "🛒", label: "My Cart" },
          { href: "/help", icon: "💬", label: "Get Help" },
          { href: "/sell", icon: "🏪", label: "Become a Seller" },
        ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Profile head */}
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        {store ? (
          <StoreAvatar store={store} size={80} className="h-20 w-20 shrink-0 rounded-3xl text-4xl" />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-ocean-600 to-ocean-900 font-display text-3xl font-extrabold text-white">
            {session.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            {session.name}
          </h1>
          <p className="truncate text-sm text-slate-500">{session.email}</p>
          <p className="mt-1 text-xs font-semibold text-mango-600">
            {isAdmin
              ? `🛡️ Administrator${session.access ? ` · ${session.access}` : ""}`
              : isSeller
                ? `🏪 Store owner${session.access ? ` · ${session.access}` : ""} · ${stats?.productCount ?? 0} products`
                : `⭐ Gold member`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/wishlist" className="btn-secondary !px-4 !py-2 text-sm">
            ♡ Wishlist
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Seller / admin dashboard callout */}
      {(isSeller || isAdmin) && (
        <Link
          href={isAdmin ? "/admin" : "/vendor"}
          className="mt-4 flex flex-wrap items-center gap-5 rounded-2xl bg-gradient-to-r from-ocean-900 to-ocean-700 p-6 text-white transition hover:shadow-xl"
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
                <p className="text-[11px] text-ocean-200">Revenue (30d)</p>
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

      {/* Quick links */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickLinks.map((l) => (
          <Link key={l.href} href={l.href} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
            <span className="text-2xl">{l.icon}</span>
            <span className="text-sm font-semibold text-slate-700">{l.label}</span>
          </Link>
        ))}
      </div>

      {/* Orders with per-brand status breakdown */}
      <AccountOrdersClient
        userName={session.name}
        userEmail={session.email}
        serverOrders={serverOrders}
      />
    </div>
  );
}
