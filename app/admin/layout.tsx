import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell, { type ShellItem } from "@/components/dashboard/DashboardShell";
import { getAllStores, getCustomerReviews, getFlashRequests } from "@/lib/api";
import { needsAttention } from "@/lib/review-moderation";
import { may } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Admin Panel", template: "%s · Admin · Banaadir Mall" },
};

/**
 * Admin control panel layout: dark sidebar (tab bar on mobile) + content.
 * Guarded by the demo session — only the admin role gets in
 * (ADMIN_EMAIL from lib/auth.ts / Admin@2026). Swap for real auth before launch.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");

  // Badges surface work that needs a decision without hunting for it.
  const [flashRequests, stores, reviews] = await Promise.all([
    getFlashRequests(),
    getAllStores(),
    getCustomerReviews(),
  ]);
  const pendingFlash = flashRequests.filter((r) => r.status === "pending").length;
  const reportedReviews = reviews.filter(needsAttention).length;
  const pendingStores = stores.filter((s) => s.status === "pending").length;
  const role = session.access ? `Platform staff · ${session.access}` : "Marketplace admin";
  const items: ShellItem[] = [
    { href: "/admin", icon: "dashboard", label: "Dashboard", exact: true, tab: true },
    { href: "/admin/stores", icon: "stores", label: "Stores", badge: pendingStores, tab: true },
    { href: "/admin/orders", icon: "orders", label: "Orders", tab: true },
    { href: "/admin/products", icon: "products", label: "Products", tab: true },
    { href: "/admin/analytics", icon: "analytics", label: "Analytics" },
    { href: "/admin/categories", icon: "categories", label: "Categories" },
    { href: "/admin/reviews", icon: "reviews", label: "Reviews", badge: reportedReviews },
    { href: "/admin/banners", icon: "banners", label: "Home banners" },
    { href: "/admin/marketing", icon: "marketing", label: "Marketing" },
    { href: "/admin/discovery", icon: "discovery", label: "Discovery" },
    { href: "/admin/flash", icon: "flash", label: "Flash deals", badge: pendingFlash },
    // Behind settings.manage, like the page itself — a staff member who
    // cannot change the commission is not shown the door to it.
    ...(may(session, "settings.manage")
      ? [
          { href: "/admin/commissions", icon: "commission" as const, label: "Commission" },
          { href: "/admin/payouts", icon: "payouts" as const, label: "Payouts" },
        ]
      : []),
    { href: "/admin/team", icon: "team", label: "Team" },
    { href: "/admin/activity", icon: "activity", label: "Activity log" },
    // The main administrator only: setting a password is becoming that
    // person, so no staff role grants it.
    ...(!session.access
      ? [{ href: "/admin/accounts", icon: "accounts" as const, label: "Accounts & owners" }]
      : []),
    { href: "/account/security", icon: "account", label: "My account" },
  ];

  return (
    <DashboardShell
      brand={<span className="truncate font-display text-sm font-extrabold">Control panel</span>}
      subtitle={role}
      items={items}
      viewStoreHref="/"
      user={{ name: session.name, email: session.email, role }}
    >
      {children}
    </DashboardShell>
  );
}
