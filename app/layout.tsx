import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { CartProvider } from "@/lib/cart-context";
import { RecoProvider } from "@/components/reco/RecoProvider";
import PromptHost from "@/components/reco/PromptHost";
import { getCategories, getMarketingSettings, getStore } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Suspense } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
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
          {/* pb-20 keeps content clear of the mobile bottom nav */}
          <main className="flex-1 pb-20 md:pb-0">{children}</main>
          <Footer session={session} />
          <BottomNav />
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
