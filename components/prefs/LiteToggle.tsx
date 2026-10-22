"use client";

import { usePrefs } from "./PrefsProvider";

/**
 * Light data mode switch. On: smaller, more compressed photos and no
 * auto-advancing banner — for shoppers on expensive or slow mobile data.
 * Turned on automatically when the phone's own data saver is on, until
 * the shopper chooses (lib/prefs-server.ts#getLite).
 */
export default function LiteToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { lite, setLite, t } = usePrefs();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={lite}
      onClick={() => setLite(!lite)}
      title={lite ? t("pref.lite.on") : t("pref.lite.off")}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        variant === "dark" ? "bg-white/10 text-ocean-100 hover:bg-white/20" : "bg-sand-100 text-slate-600 hover:bg-sand-200"
      }`}
    >
      📶 {t("pref.lite")}
      <span
        aria-hidden
        className={`relative inline-block h-4 w-7 rounded-full transition ${lite ? "bg-mango-500" : variant === "dark" ? "bg-white/25" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${lite ? "left-3.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}
