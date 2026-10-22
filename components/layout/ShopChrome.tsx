"use client";

import { usePathname } from "next/navigation";

/** Routes that draw their own frame (components/dashboard/DashboardShell). */
export function isDashboardPath(pathname: string | null): boolean {
  return Boolean(pathname && /^\/(vendor|admin)(\/|$)/.test(pathname));
}

/**
 * The shop's header, footer and tab bar — hidden on the dashboards.
 *
 * Decided on the client from the live pathname, not in the root layout:
 * Next keeps the root layout across in-app navigation, so a server-side
 * check would leave the dashboard's "no header" state in place after
 * clicking back into the shop (and vice versa).
 */
export default function ShopChrome({
  children,
  hideOnCheckout = false,
}: {
  children: React.ReactNode;
  /**
   * Also hide on /checkout. Checkout is a focused page — no footer, tab bar
   * or install banner offering a way out halfway through paying.
   */
  hideOnCheckout?: boolean;
}) {
  const pathname = usePathname();
  if (isDashboardPath(pathname)) return null;
  if (hideOnCheckout && isCheckoutPath(pathname)) return null;
  return <>{children}</>;
}

export function isCheckoutPath(pathname: string | null): boolean {
  return pathname === "/checkout";
}
