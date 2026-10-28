import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import StoreSettingsForm from "@/components/dashboard/StoreSettingsForm";
import PosSettingsForm from "@/components/pos/PosSettingsForm";
import PaymentMethodsForm from "@/components/dashboard/PaymentMethodsForm";
import StoreLinkPanel from "@/components/store-site/StoreLinkPanel";
import { getPosSettings, getStore } from "@/lib/api";
import { ROOT_DOMAIN } from "@/lib/store-site";
import { may } from "@/lib/auth";
import { accountsEnabled } from "@/lib/accounts";
import TransferOwnershipForm from "@/components/dashboard/TransferOwnershipForm";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Store Settings" };

/**
 * Store branding & profile: name, tagline, city, plus uploaded logo and
 * banner images that replace the generated artwork on the store page,
 * store cards, the home page brand row and the seller dashboard.
 */
export default async function VendorSettingsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "settings.manage")) redirect("/vendor");
  const store = await getStore(storeSlug);
  if (!store) redirect("/vendor");

  const posSettings = await getPosSettings(storeSlug);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        Store Settings
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        How your store looks to customers.{" "}
        <Link href={`/store/${storeSlug}`} className="font-semibold text-ocean-700 hover:underline">
          View public page →
        </Link>
      </p>

      <div className="card mt-5 p-6 sm:p-8">
        <StoreSettingsForm store={store} includeStoreField={session.role === "admin"} />
      </div>

      {/* ── How customers pay ─────────────────────────────────────── */}
      <section className="card mt-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
            💳
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-ocean-950">
              How customers pay you
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Customers pay your shop directly. They pick one of these at
              checkout and see your number with the amount to send. Mark
              each parcel paid in Orders once the money arrives.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-sand-100 pt-5">
          <PaymentMethodsForm
            initial={store.paymentMethods ?? []}
            canEdit={session.role === "seller" && !session.access}
          />
        </div>
      </section>

      {/* ── Your own website ──────────────────────────────────────── */}
      <section className="card mt-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
            🔗
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-ocean-950">
              Your own website
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              One link to your shop that you can share anywhere. The basket,
              checkout and delivery are the same ones you already use, so
              orders arrive exactly as they do now.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-sand-100 pt-5">
          <StoreLinkPanel
            slug={store.slug}
            storeName={store.name}
            rootDomain={ROOT_DOMAIN}
            ownSite={Boolean(store.ownSite)}
          />
        </div>
      </section>

      {/*
        ── The counter lives here, and that is the fix ────────────────────
        It used to be reachable only from /vendor/pos, and the link to
        /vendor/pos only appeared once the counter was already on. So the
        one switch that turns it on sat behind the thing it turns on, and
        nobody could find it. Settings is where somebody goes looking for a
        switch, so this is where it belongs.
      */}
      <section className="card mt-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
            🧾
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold text-ocean-950">
              Sell over the counter
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              For shops without a till. Track what you buy, work out what a
              batch costs to make, and ring up sales in person — they land in
              your orders alongside the website.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-sand-100 pt-5">
          <PosSettingsForm initial={posSettings} />
        </div>

        {posSettings.enabled && (
          <p className="mt-4 text-sm text-slate-500">
            It is on —{" "}
            <Link
              href="/vendor/pos"
              className="font-semibold text-ocean-700 hover:underline"
            >
              open the counter →
            </Link>
          </p>
        )}
      </section>

      {/* Owners only, and only where accounts are real. */}
      {!session.access && session.role === "seller" && accountsEnabled() && store && (
        <section className="mt-6 rounded-2xl border border-coral-100 bg-coral-100/20 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-coral-700">Transfer ownership</h2>
          <p className="mb-4 mt-1 max-w-2xl text-sm text-slate-600">
            Hand {store.name} to another account — for example if you sell the business. They become
            the owner with full control, including payouts. You&apos;ll be signed out; you can stay
            on as a manager or leave the store entirely.
          </p>
          <TransferOwnershipForm storeName={store.name} />
        </section>
      )}
    </div>
  );
}
