import { cookies, headers } from "next/headers";
import { isLang, LANG_COOKIE, LITE_COOKIE, translator, type Lang } from "./i18n";

/** The shopper's language: their cookie, else English. */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "en";
}

/** A translator for server components. */
export async function getT() {
  return translator(await getLang());
}

/**
 * Light data mode: the shopper's own switch, else on when the browser
 * asks to save data (the `Save-Data: on` header phones send in their
 * data-saver mode).
 */
export async function getLite(): Promise<boolean> {
  const value = (await cookies()).get(LITE_COOKIE)?.value;
  if (value === "1") return true;
  if (value === "0") return false;
  return (await headers()).get("save-data") === "on";
}
