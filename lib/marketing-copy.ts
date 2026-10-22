import type { Lang } from "./i18n";
import type { MarketingCopyField, MarketingSettings } from "./types";

/**
 * The storefront copy the admin writes (/admin/marketing), in the
 * shopper's language.
 *
 * It used to be shown in English whatever the language switch said — the
 * first thing a Somali-speaking shopper read on the home page was English.
 *
 * Somali comes from the admin's own Somali text when they have written it.
 * Failing that, the shipped Somali is used ONLY while the English is still
 * the shipped English: once an admin has written their own English, an
 * old translation of different words would be wrong, so English is shown.
 */
const SHIPPED: Record<MarketingCopyField, { en: string; so: string }> = {
  announcement: {
    en: "Free delivery in Mogadishu on orders over $25 · Pay with EVC Plus, Zaad & eDahab",
    so: "Keenis bilaash ah Muqdisho dalabyada ka badan $25 · Ku bixi EVC Plus, Zaad & eDahab",
  },
  heroBadge: {
    en: "🇸🇴 Proudly Somali · 8 categories · Trusted local stores",
    so: "🇸🇴 Soomaali ku faan · 8 qaybood · Dukaamo maxalli ah oo la aamini karo",
  },
  heroTitleTop: { en: "The whole market,", so: "Suuqa oo dhan," },
  heroTitleHighlight: { en: "in your pocket.", so: "jeebkaaga ayuu ku jiraa." },
  heroSubtitle: {
    en: "Shop electronics, fashion, beauty and more from Somalia's best stores. Pay with EVC Plus, Zaad, eDahab or cash on delivery.",
    so: "Ka iibso elektaroonig, dhar, qurxin iyo wax ka badan dukaamada ugu fiican Soomaaliya. Ku bixi EVC Plus, Zaad, eDahab ama lacag caddaan ah marka laguu keeno.",
  },
};

export const MARKETING_COPY_FIELDS = Object.keys(SHIPPED) as MarketingCopyField[];

export function localizeMarketing(marketing: MarketingSettings, lang: Lang): MarketingSettings {
  if (lang !== "so") return marketing;
  const out = { ...marketing };
  for (const field of MARKETING_COPY_FIELDS) {
    const own = marketing.translations?.so?.[field]?.trim();
    if (own) out[field] = own;
    else if (marketing[field]?.trim() === SHIPPED[field].en) out[field] = SHIPPED[field].so;
  }
  return out;
}
