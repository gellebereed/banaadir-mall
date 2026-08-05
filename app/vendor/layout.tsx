import type { Metadata } from "next";
import Image from "next/image";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import OrderNotifications from "@/components/dashboard/OrderNotifications";
import { getOrdersByStore, getStore } from "@/lib/api";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Seller Dashboard", template: "%s · Seller · Banaadir Mall" },
};

/**
 * Seller dashboard layout. Guarded by requireVendor(): sellers see their
 * own store, admins preview "sahra-fashion", customers are redirected.
 * Employee accounts see the tabs but each page enforces its access area.
 */
export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, storeSlug } = await requireVendor();
  const [store, orders] = await Promise.all([
    getStore(storeSlug),
    getOrdersByStore(storeSlug),
  ]);

  // Rendered on the server so the badge is already correct before any
  // JavaScript runs — the bell then keeps it live.
  const newOrders = orders
    .filter((o) => !o.seenAt)
    .sort((a, b) => b.id.localeCompare(a.id));

  // If seller's store is pending admin approval, block dashboard access and show notice
  if (session.role !== "admin" && store?.status === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/80 p-8 shadow-sm animate-fade-up">
          <span className="text-5xl">⏳</span>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-amber-950">
            Store Application Pending Review
          </h1>
          <p className="mt-2 text-sm text-amber-900 font-medium">
            Your store application for <strong className="text-amber-950">&quot;{store.name}&quot;</strong> has been received and is currently undergoing review by the Banaadir Mall administration team.
          </p>
          <div className="mt-6 rounded-2xl bg-white p-4 text-xs text-slate-600 border border-amber-200/80 text-left space-y-2">
            <p>• <strong>Status:</strong> <span className="text-amber-700 font-bold uppercase">Pending Approval</span></p>
            <p>• <strong>Location:</strong> {store.city}</p>
            <p>• <strong>Submitted:</strong> {store.joinedYear ? `Year ${store.joinedYear}` : "Recently"}</p>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Once an admin approves your store in the control panel, your product management dashboard will unlock automatically.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/"
              className="rounded-full bg-amber-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-amber-700"
            >
              Return to Mall
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If seller's store is suspended or rejected, block dashboard access
  if (session.role !== "admin" && store && (store.status === "suspended" || store.status === "rejected")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-3xl border-2 border-coral-300 bg-coral-50/80 p-8 shadow-sm">
          <span className="text-5xl">❌</span>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-coral-950">
            Store Account Inactive
          </h1>
          <p className="mt-2 text-sm text-coral-900">
            The store application for <strong className="text-coral-950">&quot;{store.name}&quot;</strong> is currently inactive or has been suspended.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            If you believe this is an error, please contact Banaadir Mall merchant support.
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-full bg-ocean-800 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-ocean-900"
          >
            Return to Storefront
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <div className="rounded-2xl bg-ocean-950 p-3 lg:sticky lg:top-40 lg:flex lg:min-h-[70vh] lg:flex-col">
          {/*
            ONE header row for both breakpoints — the logo and role hide on
            mobile, the row itself does not.

            This used to be two rows (a desktop one and a mobile one), which
            put two live OrderNotifications on the page. `supabase.channel()`
            returns the EXISTING channel for a topic, and subscribing to the
            same channel twice throws — which took the whole dashboard down
            with a client-side exception. Keep this to a single instance.
          */}
          <div className="mb-2 flex items-center gap-2 px-1 pt-1 lg:px-3 lg:pt-2">
            {store?.logo ? (
              <Image
                src={store.logo}
                alt=""
                width={28}
                height={28}
                className="hidden h-7 w-7 shrink-0 rounded-lg object-cover lg:block"
              />
            ) : (
              <span className="hidden text-xl lg:inline">{store?.icon ?? "🏪"}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-extrabold text-white">
                {store?.name ?? "My Store"}
              </p>
              <p className="hidden truncate text-[10px] text-ocean-300 lg:block">
                {session.access ? `Employee · ${session.access}` : "Store owner"}
              </p>
            </div>
            <OrderNotifications storeSlug={storeSlug} initialNewOrders={newOrders} />
          </div>
          <DashboardSidebar
            items={[
              { href: "/vendor", icon: "📊", label: "Dashboard", exact: true },
              { href: "/vendor/products", icon: "📦", label: "Products" },
              { href: "/vendor/photos", icon: "📸", label: "Bulk Photos" },
              { href: "/vendor/orders", icon: "🧾", label: "Orders", badge: newOrders.length },
              { href: "/vendor/promotions", icon: "🏷️", label: "Promotions" },
              { href: "/vendor/flash", icon: "⚡", label: "Flash Deals" },
              { href: "/vendor/team", icon: "👥", label: "Team" },
              { href: "/vendor/settings", icon: "⚙️", label: "Settings" },
            ]}
          />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
