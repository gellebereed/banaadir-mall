import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for shopping and selling on Banaadir Mall.",
  alternates: { canonical: "/terms" },
};

/*
 * Plain-language terms written for how the marketplace actually works
 * today (shops sell, the customer pays the shop or on delivery, sign-in by
 * phone or email). Change them here when that changes — and bump
 * LEGAL_UPDATED in components/legal/LegalPage.tsx.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <>
          <p>
            Welcome to Banaadir Mall. These terms are the agreement between you and Banaadir Mall
            when you use www.banaadirmall.com — to browse, to shop, or to sell. By creating an
            account or placing an order you agree to them. If you don&apos;t agree, please don&apos;t
            use the site.
          </p>
        </>
      }
      sections={[
        {
          id: "marketplace",
          title: "What Banaadir Mall is",
          body: (
            <>
              <p>
                Banaadir Mall is a marketplace. The products you see are listed and sold by
                independent shops (&ldquo;sellers&rdquo;). When you buy something, your contract of
                sale is with the shop that sells it; Banaadir Mall runs the website, passes your
                order to the shop and helps if something goes wrong.
              </p>
            </>
          ),
        },
        {
          id: "account",
          title: "Your account",
          body: (
            <ul>
              <li>You can sign up with your mobile number or your email. The details you give must be true and your own.</li>
              <li>We send a one-time code by SMS to confirm a mobile number. Normal network charges may apply.</li>
              <li>Keep your password private. You are responsible for what happens under your account until you tell us it has been misused.</li>
              <li>
                You can delete your account at any time from{" "}
                <Link href="/account/security" className="font-semibold text-ocean-700 underline">My account → Password &amp; account</Link>.
              </li>
              <li>We may suspend or close accounts used for fraud, abuse or to break these terms.</li>
            </ul>
          ),
        },
        {
          id: "orders",
          title: "Orders, prices and payment",
          body: (
            <ul>
              <li>Prices are shown in US dollars and include what the shop has set. Delivery charges, if any, are shown before you confirm.</li>
              <li>An order is a request to buy. The shop confirms it when it accepts and prepares it, and may cancel it if an item is out of stock or the price was clearly wrong — you won&apos;t be charged for anything that isn&apos;t supplied.</li>
              <li>You pay the shop directly by the methods shown at checkout (for example mobile money or cash on delivery). Keep your payment reference until the order arrives.</li>
              <li>Pre-order items are made or shipped to order; the expected date is an estimate, and their price is not reduced by promotions.</li>
              <li>Discount codes and reward points work only where the shop takes part and under the conditions shown with them. They have no cash value.</li>
            </ul>
          ),
        },
        {
          id: "delivery",
          title: "Delivery, returns and refunds",
          body: (
            <ul>
              <li>Delivery times are estimates given by the shop and the courier.</li>
              <li>
                Most items can be returned within 7 days of delivery if they are unused and in their
                original packaging. Opened food, beauty and hygiene products can&apos;t be returned.
                The <Link href="/help" className="font-semibold text-ocean-700 underline">Help page</Link> explains how.
              </li>
              <li>If an item arrives damaged, wrong or not at all, tell the shop or us as soon as you can. You will get a replacement or a refund of what you paid for it.</li>
            </ul>
          ),
        },
        {
          id: "conduct",
          title: "Using the site fairly",
          body: (
            <>
              <p>Please don&apos;t:</p>
              <ul>
                <li>give false details, place orders you don&apos;t mean to accept, or use someone else&apos;s account or payment;</li>
                <li>post reviews, photos or messages that are false, offensive, or not about your own experience;</li>
                <li>try to break, overload, scrape or get around the security of the site.</li>
              </ul>
              <p>We may remove content that breaks these rules.</p>
            </>
          ),
        },
        {
          id: "sellers",
          title: "Selling on Banaadir Mall",
          body: (
            <p>
              Shops must be approved before they can sell. Sellers are responsible for their
              listings being accurate and lawful, for the goods they sell, and for honouring the
              orders, returns and refunds described here. Commission and payout terms are agreed
              separately and shown in the seller dashboard.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Our responsibility",
          body: (
            <>
              <p>
                We work to keep the site accurate and available, but we can&apos;t promise it will
                always be error-free or uninterrupted. Product descriptions and photos come from the
                shops.
              </p>
              <p>
                Nothing in these terms takes away rights you have by law as a consumer. Apart from
                that, Banaadir Mall is not responsible for indirect losses, and our responsibility
                for any order is limited to the amount you paid for it.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <>
              <p>
                We may update these terms as the marketplace grows. The date at the top shows when
                they last changed; important changes will be announced on the site. Orders already
                placed follow the terms in force when you placed them.
              </p>
              <p>
                These terms are governed by the laws of Somalia. Questions or complaints: contact us
                from the <Link href="/help" className="font-semibold text-ocean-700 underline">Help page</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
