import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { CartProvider } from "@/lib/cart-context";
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
import InvitationBanner from "@/components/layout/InvitationBanner";
import BottomNav from "@/components/layout/BottomNav";
import ScrollToTop from "@/components/ScrollToTop";
import Toaster from "@/components/Toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: {
    default: "Banaadir Mall — Somalia's Online Marketplace",
    template: "%s · Banaadir Mall",
  },
  description:
    "Shop thousands of products from trusted local stores. Electronics, fashion, beauty, home and more — delivered across Somalia. Pay with EVC Plus, Zaad or cash on delivery.",
};

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
  const [marketing, session, categories] = await Promise.all([
    getMarketingSettings(),
    getSession(),
    getCategories(),
  ]);
  const store = session?.store ? await getStore(session.store) : undefined;

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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="flex min-h-screen flex-col">
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
            <Header
              announcement={marketing.announcement}
              announcementBgColor={marketing.announcementBgColor}
              announcementTextColor={marketing.announcementTextColor}
              announcementScroll={marketing.announcementScroll}
              announcementSpeed={marketing.announcementSpeed}
              session={session}
              storeName={store?.name}
              categories={categories}
            />
          )}
          {/*
            Shown only to the account an invitation was addressed to, so
            being invited is something you find out inside the app rather
            than only through a link somebody remembered to send you.
            Renders nothing for everyone else — see the component.
          */}
          <Suspense fallback={null}>
            <InvitationBanner />
          </Suspense>
          {/* pb-20 keeps content clear of the mobile bottom nav, which a
              store site does not have — the shop's own footer is the end
              of the page. */}
          <main className={`flex-1 ${onStoreSite ? "" : "pb-20 md:pb-0"}`}>{children}</main>

          {onStoreSite ? (
            <StoreSiteFooter store={siteStore!} />
          ) : (
            <>
              <Footer session={session} />
              <BottomNav />
            </>
          )}
          {/* Cart / wishlist confirmations */}
          <Toaster />
          {/* The timed ask — see components/reco/PromptHost. Renders
              nothing until the engine decides there is a question worth
              the interruption, and never on checkout. */}
          <Suspense fallback={null}>
            <PromptHost />
          </Suspense>
          </RecoProvider>
        </CartProvider>
      </body>
    </html>
  );
}
