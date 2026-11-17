import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Banaadir Mall collects about you, why, who sees it, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

/*
 * Written from what the code actually stores and where (Supabase for
 * accounts and orders, Twilio for SMS codes, Netlify for hosting, the
 * browser for recommendations). If a new service starts receiving
 * personal data, add it under "Who we share it with".
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal information Banaadir Mall collects when you use
          www.banaadirmall.com, what we use it for, who we share it with, and the choices you have —
          including deleting your account.
        </p>
      }
      sections={[
        {
          id: "collect",
          title: "What we collect",
          body: (
            <ul>
              <li><strong>Your account:</strong> your name, your mobile number and/or email, and your password (stored only in scrambled, hashed form — nobody at Banaadir Mall can read it).</li>
              <li><strong>Your orders:</strong> what you bought, from which shop, the delivery name, phone number and address you give, and how you chose to pay.</li>
              <li><strong>What you add:</strong> reviews and photos you post, items you save, and &ldquo;tell me when it&apos;s back&rdquo; alerts.</li>
              <li><strong>Technical data:</strong> a sign-in cookie that keeps you logged in, and standard server logs (such as IP address and browser type) used for security and to fix problems.</li>
            </ul>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <ul>
              <li>to create your account, sign you in, and confirm your number or email;</li>
              <li>to send your order to the shop and let you and the shop follow it;</li>
              <li>to contact you about your order, your account, or a back-in-stock item you asked about;</li>
              <li>to keep the site safe — for example limiting repeated wrong passwords;</li>
              <li>to suggest products. These suggestions are worked out mostly on your own device, from what you browse here.</li>
            </ul>
          ),
        },
        {
          id: "share",
          title: "Who we share it with",
          body: (
            <>
              <ul>
                <li><strong>The shop you buy from</strong> gets your name, phone number, delivery address and order, so it can deliver and contact you.</li>
                <li><strong>Service providers</strong> who run parts of the site for us: Supabase (database and sign-in), Twilio (sending SMS codes) and Netlify (hosting). They may process data outside Somalia and may only use it to provide their service to us.</li>
                <li><strong>Authorities</strong>, only when the law requires it.</li>
              </ul>
              <p>We do not sell your personal information, and we don&apos;t share it with advertisers.</p>
            </>
          ),
        },
        {
          id: "keep",
          title: "How long we keep it",
          body: (
            <p>
              We keep your account details while your account is open. Order records are kept for as
              long as the shops and Banaadir Mall need them for accounting, returns and disputes,
              even after an account is deleted — but no longer linked to your login.
            </p>
          ),
        },
        {
          id: "deletion",
          title: "Your choices and deleting your account",
          body: (
            <>
              <ul>
                <li>You can see and update your details in <Link href="/account" className="font-semibold text-ocean-700 underline">My account</Link>, and change your password or email under Password &amp; account.</li>
                <li>
                  <strong>Delete your account</strong> yourself at any time from{" "}
                  <Link href="/account/security" className="font-semibold text-ocean-700 underline">My account → Password &amp; account → Delete account</Link>.
                  Your login, saved recommendations and alerts are removed straight away, and past
                  orders are unlinked from you as described above. If an order is still on its way,
                  you can delete your account once it has been delivered or cancelled.
                </li>
                <li>If you can&apos;t sign in, or want a copy of your data, contact us from the <Link href="/help" className="font-semibold text-ocean-700 underline">Help page</Link>.</li>
              </ul>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Connections to the site are encrypted (HTTPS), passwords are hashed, and access to
              customer data inside Banaadir Mall is limited to the people and shops who need it. No
              system is perfectly secure, so please use a password you don&apos;t use anywhere else.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Banaadir Mall is not meant for children under 16, and we don&apos;t knowingly collect their information.</p>,
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <p>
              If we change this policy, we will update the date at the top and announce important
              changes on the site. Questions about your privacy: contact us from the{" "}
              <Link href="/help" className="font-semibold text-ocean-700 underline">Help page</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
