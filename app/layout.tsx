import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { CartProvider } from "@/lib/cart-context";
import { PrefsProvider } from "@/components/prefs/PrefsProvider";
import WhatsAppHelp from "@/components/layout/WhatsAppHelp";
import InstallPrompt from "@/components/layout/InstallPrompt";
import { getLang, getLite } from "@/lib/prefs-server";
import { localizeMarketing } from "@/lib/marketing-copy";
import { RecoProvider } from "@/components/reco/RecoProvider";
import PromptHost from "@/components/reco/PromptHost";
import { getCategories, getMarketingSettings, getStore } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Suspense } from "react";
import { headers } from "next/headers";
import Header from "@/components/layout/Header";
import StoreSiteHeader, { StoreSiteFooter } from "@/components/store-site/StoreSiteHeader";
import { PATHNAME_HEADER, storeSlugFromPath } from "@/lib/store-site";
import Footer from "@/components/layout/Footer";
import ShopChrome from "@/components/layout/ShopChrome";
import InvitationBanner from "@/components/layout/InvitationBanner";
import BottomNav from "@/components/layout/BottomNav";
import ScrollToTop from "@/components/ScrollToTop";
import Toaster from "@/components/Toaster";
import { isIndexableDeploy, siteOrigin } from "@/lib/request-origin";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

const SITE_DESCRIPTION =
  "Discover your next favourite from local Somali stores. Shop fashion, electronics, beauty and home — with EVC Plus, Zaad or cash on delivery.";

/*
 * Link previews. A product link pasted into WhatsApp showed a bare URL:
 * no picture, no title, no price — on a marketplace that spreads through
 * WhatsApp. Open Graph needs ABSOLUTE urls, so `metadataBase` is this
 * site's own address as the visitor reached it (Netlify or a custom
 * domain alike); each page's opengraph-image then resolves against it.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    // The production address (see siteOrigin), so every page's canonical
    // link names the one site Google should list.
    metadataBase: new URL(await siteOrigin()),
    title: {
      default: "Banaadir Mall | Your next favourite, all in one place",
      template: "%s · Banaadir Mall",
    },
    description: SITE_DESCRIPTION,
    applicationName: "Banaadir Mall",
    keywords: [
      "Banaadir Mall",
      "online shopping Somalia",
      "Mogadishu online store",
      "Somali marketplace",
      "EVC Plus",
      "Zaad",
      "cash on delivery",
    ],
    // Deploy previews stay out of search; production is open.
    ...(isIndexableDeploy() ? {} : { robots: { index: false, follow: false } }),
    /*
     * Google Search Console's "HTML tag" check. Set GOOGLE_SITE_VERIFICATION
     * on Netlify to the code from the content="…" part of the tag Google
     * gives you; Bing's works the same way.
     */
    verification: {
      ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
      ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
    },
    // iPhone "Add to Home Screen": the name under the icon, full-screen launch.
    appleWebApp: { capable: true, title: "Banaadir Mall", statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: "Banaadir Mall",
      locale: "en_US",
      title: "Banaadir Mall | Your next favourite, all in one place",
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: "Banaadir Mall | Your next favourite, all in one place",
      description: SITE_DESCRIPTION,
      images: [{ url: "/social/banaadir-mall.jpg", width: 1200, height: 630, alt: "Banaadir Mall — Your next favourite. All in one place." }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1f6270",
  width: "device-width",
  initialScale: 1,
  /*
   * Pinch-zoom is deliberately LEFT ON.
   *
   * Locking it with maximum-scale is the usual way to stop iOS zooming
   * into a focused input, and it takes zoom away from every shopper who
   * relies on it to read. The cause is fixed instead — form text is 16px
   * on small screens (app/globals.css) — so there is nothing to suppress.
   */
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The announcement bar text is controlled from /admin/marketing.
  // The session drives which dashboard links the header and footer show.
  const [rawMarketing, session, categories, lang, lite] = await Promise.all([
    getMarketingSettings(),
    getSession(),
    getCategories(),
    getLang(),
    getLite(),
  ]);
  const store = session?.store ? await getStore(session.store) : undefined;
  // The announcement bar in the shopper's language — lib/marketing-copy.ts.
  const marketing = localizeMarketing(rawMarketing, lang);

  /*
   * ── Whose shopfront is this? ─────────────────────────────────────────
   * On /store/<slug>, a store the marketplace has GRANTED its own site
   * gets the shop's header and footer instead of the marketplace's — same
   * application, same basket, same checkout, different clothes.
   *
   * Three conditions, all required. Anything else falls through to the
   * marketplace chrome rather than erroring, so a bad slug or a suspended
   * shop looks like the mall rather than like a crash.
   */
  const siteSlug = storeSlugFromPath((await headers()).get(PATHNAME_HEADER));
  const siteStore = siteSlug ? await getStore(siteSlug) : undefined;
  const onStoreSite = Boolean(
    siteStore && siteStore.status === "active" && siteStore.ownSite,
  );

  return (
    <html lang={lang} data-lite={lite ? "" : undefined} className={`${inter.variable} ${outfit.variable}`}>
      <body className="flex min-h-screen flex-col">
        <PrefsProvider lang={lang} lite={lite}>
        {/*
          The basket, wishlist and taste profile are all stored per ACCOUNT
          on this device. On a shared phone — which is how a great many
          people here shop — signing in as somebody else used to leave you
          looking at the previous person's basket and their recommendations.
          See lib/storage-scope.ts.
        */}
        <CartProvider email={session?.email}>
          {/* Recommendations sit INSIDE the cart provider: the tracker
              learns from basket and wishlist changes, and every shelf
              needs an add-to-cart button. See components/reco. */}
          <RecoProvider email={session?.email}>
          {/* useSearchParams needs a Suspense boundary during prerender. */}
          <Suspense fallback={null}>
            <ScrollToTop />
          </Suspense>
          {onStoreSite ? (
            <StoreSiteHeader store={siteStore!} />
          ) : (
            <ShopChrome>
            <Header
              announcement={marketing.announcement}
              announcementBgColor={marketing.announcementBgColor}
              announcementTextColor={marketing.announcementTextColor}
              announcementScroll={marketing.announcementScroll}
              announcementSpeed={marketing.announcementSpeed}
              session={session}
              storeName={store?.name}
              categories={categories}
              delivery={marketing.delivery}
            />
            </ShopChrome>
          )}
          {/*
            Shown only to the account an invitation was addressed to, so
            being invited is something you find out inside the app rather
            than only through a link somebody remembered to send you.
            Renders nothing for everyone else — see the component.
          */}
          <ShopChrome>
            <Suspense fallback={null}>
              <InvitationBanner />
            </Suspense>
          </ShopChrome>
          {/* pb-20 keeps content clear of the mobile bottom nav, which a
              store site does not have — the shop's own footer is the end
              of the page. */}
          <main className={`flex-1 ${onStoreSite ? "" : "pb-20 md:pb-0"}`}>{children}</main>

          {onStoreSite ? (
            <StoreSiteFooter store={siteStore!} />
          ) : (
            // Dashboards draw their own frame — see ShopChrome.
            <>
              <ShopChrome hideOnCheckout>
                <Footer session={session} />
                <BottomNav />
                <InstallPrompt />
              </ShopChrome>
              {/* Help stays on checkout — it is where questions come up. */}
              <ShopChrome>
                <WhatsAppHelp />
              </ShopChrome>
            </>
          )}
          {/* Cart / wishlist confirmations */}
          <Toaster />
          {/* The timed ask — see components/reco/PromptHost. Renders
              nothing until the engine decides there is a question worth
              the interruption, and never on checkout. */}
          <ShopChrome>
            <Suspense fallback={null}>
              <PromptHost />
            </Suspense>
          </ShopChrome>
          </RecoProvider>
        </CartProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
