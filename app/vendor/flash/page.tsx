import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withdrawFlashRequest } from "@/app/actions";
import FlashRequestForm from "@/components/dashboard/FlashRequestForm";
import ProductImage from "@/components/ProductImage";
import {
  getBaseProductsByStore,
  getCategories,
  getFlashDeal,
  getFlashRequests,
} from "@/lib/api";
import { may } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Flash Deals" };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-mango-100 text-mango-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-coral-100 text-coral-600",
};

/**
 * Sellers apply here to get a product into the marketplace flash-deal
 * campaign. The admin approves or rejects from /admin/flash; approval adds
 * the product to the rail and activates the discount offered.
 */
export default async function VendorFlashPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "promotions.manage")) redirect("/vendor");

  const [flash, requests, products, categories] = await Promise.all([
    getFlashDeal(),
    getFlashRequests(storeSlug),
    getBaseProductsByStore(storeSlug),
    getCategories(),
  ]);

  const productById = (id: string) => products.find((p) => p.id === id);
  const pendingIds = requests.filter((r) => r.status === "pending").map((r) => r.productId);
  const available = products.filter((p) => !pendingIds.includes(p.id));

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        ⚡ Flash Deals
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Apply to feature a product in <strong>{flash.name}</strong> on the home
        page. Our team reviews every application.
      </p>

      {!flash.active && (
        <p className="mt-4 rounded-xl bg-sand-100 px-4 py-3 text-sm text-slate-600">
          The campaign is paused right now — you can still apply and your
          product will join when it restarts.
        </p>
      )}

      {/* Apply */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">
          Apply with your products
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Pick as many products as you like — bigger discounts are more likely
          to be accepted.
        </p>
        <FlashRequestForm products={available} categories={categories} />
      </div>

      {/* My applications */}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-ocean-950">
        My applications ({requests.length})
      </h2>
      <div className="card divide-y divide-sand-100">
        {requests.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            No applications yet.
          </p>
        )}
        {requests.map((r) => {
          const product = productById(r.productId);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              {product && (
                <ProductImage
                  product={product}
                  iconClass="text-lg"
                  className="h-11 w-11 shrink-0 rounded-lg"
                  sizes="44px"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {product?.name ?? r.productId}
                </p>
                <p className="text-xs text-slate-400">
                  {r.pct}% off · applied {shortDate(r.date)}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_STYLES[r.status]}`}>
                {r.status}
              </span>
              {r.status !== "approved" && (
                <form action={withdrawFlashRequest.bind(null, r.id)}>
                  <button className="text-xs font-bold text-slate-400 hover:text-coral-600 hover:underline">
                    Withdraw
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
