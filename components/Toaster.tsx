"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { useT } from "@/components/prefs/PrefsProvider";

/**
 * Confirmations for cart and wishlist actions.
 *
 * Adding something used to change only the small header badge, which is
 * easy to miss — especially on mobile, where the button you tapped is
 * nowhere near it. Each action now slides in a card showing the actual
 * product photo, so it is obvious the tap registered and on what.
 *
 * Sits above the mobile bottom nav and is announced politely to screen
 * readers without stealing focus.
 */
export default function Toaster() {
  const { toasts, dismissToast } = useCart();
  const t = useT();
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end"
    >
      {toasts.map((toast) => {
        const isRemoval = toast.kind === "removed";
        return (
          <div
            key={toast.id}
            className="animate-toast-in pointer-events-auto flex w-full max-w-sm flex-wrap items-center gap-3 rounded-2xl border border-sand-200 bg-white p-3 shadow-xl shadow-ocean-950/10"
          >
            {/* Product thumbnail, falling back to its emoji */}
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-xl">
              {toast.image ? (
                <Image src={toast.image} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                (toast.icon ?? "🛍️")
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                {toast.kind === "cart" &&
                  (toast.undo && toast.inCart ? t("toast.inCart", { n: toast.inCart }) : t("toast.added"))}
                {toast.kind === "wishlist" && (
                  <span className="text-coral-600">{t("toast.saved")}</span>
                )}
                {isRemoval && <span className="text-slate-500">{t("toast.removed")}</span>}
              </p>
              <p className="truncate text-sm font-semibold text-ocean-950">{toast.title}</p>
              {toast.subtitle && toast.kind === "cart" && (
                <p className="truncate text-xs text-slate-400">{toast.subtitle}</p>
              )}
            </div>

            {/* With an undo there are two buttons: give them their own row. */}
            {toast.kind === "cart" && (
              <div className={`flex shrink-0 gap-2 ${toast.undo ? "order-last basis-full justify-end" : ""}`}>
                {toast.undo && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.undo?.();
                      dismissToast(toast.id);
                    }}
                    className="rounded-full border border-sand-300 px-3.5 py-2 text-xs font-bold text-ocean-800 transition hover:border-ocean-300"
                  >
                    {t("toast.undo")}
                  </button>
                )}
                <Link
                  href="/cart"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-full bg-ocean-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-mango-500"
                >
                  {t("toast.viewCart")}
                </Link>
              </div>
            )}
            {toast.kind === "wishlist" && (
              <Link
                href="/wishlist"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 rounded-full border border-coral-500 px-3.5 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
              >
                {t("toast.view")}
              </Link>
            )}

            <button
              onClick={() => dismissToast(toast.id)}
              aria-label={t("toast.dismiss")}
              className="shrink-0 px-1 text-slate-300 transition hover:text-slate-600"
            >
              ✕
            </button>
            {toast.offer && (
              <Link
                href={toast.offer.href}
                onClick={() => dismissToast(toast.id)}
                className="basis-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                🎁 {toast.offer.text} →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
