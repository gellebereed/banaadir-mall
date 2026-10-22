"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/prefs/PrefsProvider";

/** Chrome's install event — not in the DOM lib types. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "bm-install-dismissed";
const VIEWS_KEY = "bm-install-views";
const QUIET_DAYS = 14;
const DELAY_MS = 25_000;
/** Pages where a card over the bottom of the screen would cover buying. */
const NEVER_ON = ["/product/", "/cart", "/checkout", "/login", "/register", "/admin", "/vendor"];

function standalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** iPhone/iPad Safari: no install event, so the card explains the two taps. */
function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/**
 * "Get the Banaadir Mall app" — the installable app the manifest and icons
 * (app/manifest.ts) made possible. Asks once the visitor has shown some
 * interest (a second page, or 25 seconds), never on the buying pages,
 * never inside the installed app, and stays quiet for two weeks after
 * "Not now".
 */
export default function InstallPrompt() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [visible, setVisible] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  // Capture Chrome's event as soon as it fires (it fires once per load).
  useEffect(() => {
    if (standalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setMode("android");
    };
    const onInstalled = () => {
      setVisible(false);
      try {
        localStorage.setItem(DISMISSED_KEY, String(Date.now() + 3650 * 86_400_000));
      } catch {}
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (iosSafari()) setMode("ios");
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Count page views this visit; show from the second, or after a delay.
  useEffect(() => {
    if (!mode || standalone() || recentlyDismissed()) return;
    if (NEVER_ON.some((p) => pathname.startsWith(p))) {
      setVisible(false);
      return;
    }
    let views = 1;
    try {
      views = Number(sessionStorage.getItem(VIEWS_KEY) || 0) + 1;
      sessionStorage.setItem(VIEWS_KEY, String(views));
    } catch {}
    if (views >= 2) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, pathname]);

  // Lets the WhatsApp button step aside while the card is up.
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.dataset.installOpen = "";
    else delete root.dataset.installOpen;
    return () => {
      delete root.dataset.installOpen;
    };
  }, [visible]);

  if (!visible || !mode) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
  };

  const install = async () => {
    const event = deferred.current;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred.current = null;
    if (outcome === "accepted") setVisible(false);
    else dismiss();
  };

  return (
    <div
      role="dialog"
      aria-label={t("install.title")}
      className="fixed inset-x-3 bottom-[calc(4.4rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-sm"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-sand-200">
        <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-lg" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-extrabold text-ocean-950">{t("install.title")}</p>
        <p className="text-xs leading-snug text-slate-500">{mode === "ios" ? t("install.ios") : t("install.text")}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {mode === "android" && (
          <button type="button" onClick={install} className="btn-primary !px-4 !py-1.5 text-xs">
            {t("install.button")}
          </button>
        )}
        <button type="button" onClick={dismiss} className="px-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
          {t("install.dismiss")}
        </button>
      </div>
    </div>
  );
}
