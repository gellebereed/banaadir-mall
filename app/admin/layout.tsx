import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { getAllStores, getFlashRequests } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Admin Panel", template: "%s · Admin · Banaadir Mall" },
};

/**
 * Admin control panel layout: dark sidebar (tab bar on mobile) + content.
 * Guarded by the demo session — only the admin role gets in
 * (admin@banaadirmall.com / Admin@2026). Swap for real auth before launch.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");

  // Badges surface work that needs a decision without hunting for it.
  const [flashRequests, stores] = await Promise.all([getFlashRequests(), getAllStores()]);
  const pendingFlash = flashRequests.filter((r) => r.status === "pending").length;
  const pendingStores = stores.filter((s) => s.status === "pending").length;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <div className="rounded-2xl bg-ocean-950 p-3 lg:sticky lg:top-40 lg:flex lg:min-h-[70vh] lg:flex-col">
          <div className="mb-2 hidden items-center gap-2 px-3 pt-2 lg:flex">
            <span className="text-xl">🛡️</span>
            <div>
              <p className="font-display text-sm font-extrabold text-white">Control Panel</p>
              <p className="text-[10px] text-ocean-300">
                {session.access ? `Staff · ${session.access}` : "Marketplace admin"}
              </p>
            </div>
          </div>
          <DashboardSidebar
            items={[
              { href: "/admin", icon: "📊", label: "Dashboard", exact: true },
              { href: "/admin/stores", icon: "🏪", label: "Stores", badge: pendingStores },
              { href: "/admin/products", icon: "📦", label: "Products" },
              { href: "/admin/orders", icon: "🧾", label: "Orders" },
              { href: "/admin/categories", icon: "🏷️", label: "Categories" },
              { href: "/admin/marketing", icon: "📣", label: "Marketing" },
              { href: "/admin/discovery", icon: "🧭", label: "Discovery" },
              { href: "/admin/flash", icon: "⚡", label: "Flash Deals", badge: pendingFlash },
              { href: "/admin/team", icon: "👥", label: "Team" },
            ]}
          />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
