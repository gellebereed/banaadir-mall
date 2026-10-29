"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar across the top of the screen from the moment a link is tapped
 * until the next page has arrived.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 * Every page here is rendered on the server, so after a tap there is a wait
 * before anything changes — and on a phone, a tap that changes nothing
 * reads as a tap that didn't register. Shoppers tapped again, or gave up.
 * The dashboards answer that with a spinner on the sidebar link
 * (DashboardShell); the shop had nothing, so this covers every link,
 * product cards and banners included.
 *
 * It listens for clicks on the document rather than wrapping <Link>, so no
 * call site has to opt in. Only a plain left click on a same-site link to a
 * DIFFERENT address starts it — a new tab, a download, an in-page #anchor or
 * the page you're already on would never finish, and the bar would hang.
 * The safety timeout covers the rest (a link whose click handler cancels the
 * navigation).
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);
  const loading = useRef(false);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const to = new URL(anchor.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;

      clearTimers();
      loading.current = true;
      setState("loading");
      // Never leave a bar on screen for a navigation that isn't coming.
      timers.current.push(
        window.setTimeout(() => {
          loading.current = false;
          setState("idle");
        }, 15000),
      );
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // The new page has committed: run the bar to the end, then fade it.
  useEffect(() => {
    if (!loading.current) return;
    loading.current = false;
    clearTimers();
    setState("done");
    timers.current.push(window.setTimeout(() => setState("idle"), 300));
  }, [pathname, searchParams]);

  useEffect(() => clearTimers, []);

  if (state === "idle") return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className={`h-full bg-mango-500 shadow-[0_0_8px_rgba(0,0,0,0.15)] ${
          state === "loading" ? "animate-nav-progress" : "w-full opacity-0 transition-opacity duration-300"
        }`}
      />
    </div>
  );
}
