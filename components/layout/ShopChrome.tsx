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
export default function ShopChrome({ children }: { children: React.ReactNode }) {
  return isDashboardPath(usePathname()) ? null : <>{children}</>;
}
