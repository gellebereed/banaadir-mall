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
import { flashState } from "@/lib/flash";
import { formatShopTime } from "@/lib/shop-time";
import type { FlashRequest } from "@/lib/types";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Flash Deals" };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-mango-100 text-mango-800",
  live: "bg-emerald-100 text-emerald-700",
  waiting: "bg-sky-100 text-sky-700",
  removed: "bg-sand-200 text-slate-600",
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
  // Waiting or already in: neither can be applied for again.
  const takenIds = new Set(requests.filter((r) => r.status !== "rejected").map((r) => r.productId));
  const available = products.filter((p) => !takenIds.has(p.id));
  const state = flashState(flash);
  const inCampaign = new Set(flash.productIds);

  /** What an application means for the seller's price right now. */
  const statusOf = (r: FlashRequest): { key: string; label: string } => {
    if (r.status === "pending") return { key: "pending", label: "Waiting for review" };
    if (r.status === "rejected") return { key: "rejected", label: "Not accepted" };
    if (!inCampaign.has(r.productId)) return { key: "removed", label: "Removed from campaign" };
    if (state === "live") return { key: "live", label: `Live · ${r.pct}% off now` };
    return { key: "waiting", label: state === "ended" ? "Campaign ended · full price" : "Campaign paused · full price" };
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        ⚡ Flash Deals
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Apply to feature a product in <strong>{flash.name}</strong> on the home
        page. Our team reviews every application.
      </p>

      <p
        className={`mt-4 rounded-xl px-4 py-3 text-sm ${
          state === "live" ? "bg-emerald-50 text-emerald-800" : "bg-sand-100 text-slate-600"
        }`}
      >
        {state === "live"
          ? flash.endsAt
            ? `● Live until ${formatShopTime(flash.endsAt)} (Mogadishu time). Your discount applies only while the campaign runs, then your price goes back automatically.`
            : "● Live now. Your discount applies only while the campaign runs, then your price goes back automatically."
          : state === "ended"
            ? "The last campaign has ended and every flash price is back to normal. You can still apply for the next one."
            : "The campaign is paused right now — flash prices are off. You can still apply; approved products join when it restarts."}
      </p>

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
          const status = statusOf(r);
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
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status.key]}`}>
                {status.label}
              </span>
              <form action={withdrawFlashRequest.bind(null, r.id)}>
                <button className="text-xs font-bold text-slate-400 hover:text-coral-600 hover:underline">
                  {r.status === "approved" && inCampaign.has(r.productId) ? "Leave campaign" : r.status === "pending" ? "Withdraw" : "Remove"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
