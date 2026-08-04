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
