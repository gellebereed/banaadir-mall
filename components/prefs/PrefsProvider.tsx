"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { LANG_COOKIE, LITE_COOKIE, translator, type Lang, type T } from "@/lib/i18n";

/**
 * The shopper's display preferences — language and light data mode — as
 * the server read them from cookies (lib/prefs-server.ts). Changing one
 * writes the cookie and re-renders the page on the server, so server and
 * client components switch together.
 */
interface Prefs {
  lang: Lang;
  lite: boolean;
  t: T;
  setLang: (lang: Lang) => void;
  setLite: (on: boolean) => void;
}

const PrefsCtx = createContext<Prefs | null>(null);

const YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

export function PrefsProvider({ lang, lite, children }: { lang: Lang; lite: boolean; children: ReactNode }) {
  const router = useRouter();
  const setLang = useCallback(
    (next: Lang) => {
      writeCookie(LANG_COOKIE, next);
      document.documentElement.lang = next;
      router.refresh();
    },
    [router],
  );
  const setLite = useCallback(
    (on: boolean) => {
      writeCookie(LITE_COOKIE, on ? "1" : "0");
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ lang, lite, t: translator(lang), setLang, setLite }), [lang, lite, setLang, setLite]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

const FALLBACK: Prefs = { lang: "en", lite: false, t: translator("en"), setLang: () => {}, setLite: () => {} };

/** Preferences, or English/full defaults outside the provider. */
export function usePrefs(): Prefs {
  return useContext(PrefsCtx) ?? FALLBACK;
}

export function useT(): T {
  return usePrefs().t;
}

/** EN | SO switch. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = usePrefs();
  return (
    <div role="group" aria-label={t("pref.language")} className={`inline-flex rounded-full bg-sand-100 p-0.5 text-xs font-bold ${className}`}>
      {(["en", "so"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => l !== lang && setLang(l)}
          aria-pressed={l === lang}
          className={`rounded-full px-2.5 py-1 transition ${l === lang ? "bg-white text-ocean-900 shadow-sm" : "text-slate-500 hover:text-ocean-700"}`}
          lang={l}
          title={l === "en" ? "English" : "Soomaali"}
        >
          {l === "en" ? "EN" : "SO"}
        </button>
      ))}
    </div>
  );
}
