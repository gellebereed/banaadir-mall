import Image from "next/image";
import Link from "next/link";

import type { Session } from "@/lib/auth";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/prefs-server";
import { LanguageToggle } from "@/components/prefs/PrefsProvider";
import LiteToggle from "@/components/prefs/LiteToggle";
import { SOCIAL_PROFILES, socialName } from "@/lib/seo";

/**
 * Footer link columns. The "Sell" column only offers links the visitor can
 * actually open — no dead ends into guarded dashboards.
 */
function columns(session: Session | null, t: T) {
  const sellLinks =
    session?.role === "admin"
      ? [
          { label: "Control Panel", href: "/admin" },
          { label: "Marketing", href: "/admin/marketing" },
          { label: "Stores", href: "/admin/stores" },
        ]
      : session?.role === "seller"
        ? [
            { label: "My Dashboard", href: "/vendor" },
            { label: "My Products", href: "/vendor/products" },
            { label: "Store Settings", href: "/vendor/settings" },
          ]
        : [
            { label: t("footer.openStore"), href: "/sell" },
            { label: t("footer.sellerSignIn"), href: "/login" },
          ];

  return [
    {
      title: t("footer.shop"),
      links: [
        { label: t("nav.allProducts"), href: "/products" },
        { label: t("footer.flash"), href: "/flash" },
        { label: t("footer.bestsellers"), href: "/products?sort=sold" },
        { label: t("nav.allStores"), href: "/stores" },
      ],
    },
    { title: t("footer.sell"), links: sellLinks },
    {
      title: t("footer.help"),
      links: [
        { label: t("footer.track"), href: "/track" },
        { label: t("footer.faq"), href: "/help" },
        { label: session ? t("footer.myAccount") : t("nav.signIn"), href: session ? "/account" : "/login" },
      ],
    },
  ];
}

export default async function Footer({ session }: { session: Session | null }) {
  const t = await getT();
  const COLUMNS = columns(session, t);

  return (
    <footer className="mt-16 bg-ocean-950 text-ocean-100">
      {/*
        The seller invitation, moved here from the header and the home page.
        The marketplace is recruiting SHOPPERS right now, so the loudest
        thing on a customer's screen should not be an offer to become a
        supplier. It stays a real, findable route — at the bottom, where
        somebody who came looking for it will look.
      */}
      {!session && (
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg ring-1 ring-inset ring-white/15">
                🏪
              </span>
              <div>
                <p className="font-display text-sm font-extrabold text-white">
                  {t("footer.sellBand.title")}
                </p>
                <p className="text-xs text-ocean-200">
                  {t("footer.sellBand.text")}
                </p>
              </div>
            </div>
            <Link
              href="/sell"
              className="shrink-0 rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white hover:text-ocean-950"
            >
              {t("footer.sellBand.cta")}
            </Link>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-12">
        {/* grid-cols-1, not the implicit column: that one sizes to its widest
            unbreakable line, which pushed 320px phones sideways on every page. */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand + newsletter */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-1.5">
                <Image
                  src="/banaadir-bag.png"
                  alt="Banaadir Mall logo"
                  width={36}
                  height={36}
                  className="h-full w-auto"
                />
              </span>
              <span className="font-display text-xl font-extrabold text-white">
                Banaadir<span className="text-mango-400">Mall</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-ocean-200">
              {t("footer.tagline")}
            </p>
            {/* Where else to find us — the same profiles named in the site's structured data. */}
            <div className="mt-4 flex flex-wrap gap-2">
              {SOCIAL_PROFILES.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-ocean-100 transition hover:bg-white/20 hover:text-white"
                >
                  {socialName(url)}
                </a>
              ))}
            </div>
            <form className="mt-5 flex max-w-sm gap-2" action="/help">
              <input
                type="email"
                placeholder={t("footer.newsletter")}
                className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm text-white placeholder-ocean-300 outline-none focus:bg-white/20"
              />
              <button className="rounded-full bg-mango-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-mango-600">
                {t("footer.join")}
              </button>
            </form>
            {/* Display preferences, where people look for site settings. */}
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-ocean-200">
              <span className="inline-flex items-center gap-2">
                🌐 <LanguageToggle className="!bg-white/10 [&_button[aria-pressed=false]]:text-ocean-200" />
              </span>
              <LiteToggle variant="dark" />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-ocean-200 transition hover:text-mango-300"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Payment methods + copyright */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-ocean-300">
            © 2026 Banaadir Mall. {t("footer.rights")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["EVC Plus", "Zaad", "eDahab", "Visa", "Mastercard", "Cash on Delivery"].map(
              (m) => (
                <span
                  key={m}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-ocean-100"
                >
                  {m}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
