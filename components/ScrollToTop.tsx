"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Scrolls to the top on every navigation.
 *
 * Next.js normally handles this, but these pages stream (every route has a
 * loading.tsx), so the browser can restore the previous scroll position
 * before the new content has any height — which lands you halfway down a
 * store's product grid instead of at its banner. Forcing the reset after
 * the route commits makes navigation behave like a normal website.
 *
 * In-page anchors (#reviews) are respected and left alone.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, searchParams]);

  return null;
}
