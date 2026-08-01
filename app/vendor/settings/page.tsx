import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import StoreSettingsForm from "@/components/dashboard/StoreSettingsForm";
import { getStore } from "@/lib/api";
import { can } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Store Settings" };

/**
 * Store branding & profile: name, tagline, city, plus uploaded logo and
 * banner images that replace the generated artwork on the store page,
 * store cards, the home page brand row and the seller dashboard.
 */
export default async function VendorSettingsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!can(session, "products")) redirect("/vendor");
  const store = await getStore(storeSlug);
  if (!store) redirect("/vendor");

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
    </div>
  );
}
