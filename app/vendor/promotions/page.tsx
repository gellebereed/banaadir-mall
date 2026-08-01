import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPromotion, deletePromotion, togglePromotion } from "@/app/actions";
import PromotionScopePicker from "@/components/dashboard/PromotionScopePicker";
import { getBaseProductsByStore, getCategories, getPromotionsByStore } from "@/lib/api";
import { can } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Promotions" };

/**
 * Store promotions: percentage discounts on the whole store or on chosen
 * products. Discounted prices (with the crossed-out original) appear
 * across the storefront as soon as a promotion is active.
 */
export default async function VendorPromotionsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!can(session, "products")) redirect("/vendor");

  const [promotions, products, categories] = await Promise.all([
    getPromotionsByStore(storeSlug),
    getBaseProductsByStore(storeSlug),
    getCategories(),
  ]);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Promotions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Discount your whole store or just the products you choose. Customers
        see the sale price and the crossed-out original everywhere, instantly.
      </p>

      {/* Create */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🏷️ New promotion</h2>
        <form action={createPromotion} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div>
              <label htmlFor="promo-name" className="label">Name</label>
              <input id="promo-name" name="name" required placeholder="e.g. Weekend Flash Sale" className="input" />
            </div>
            <div>
              <label htmlFor="promo-pct" className="label">Discount %</label>
              <input id="promo-pct" name="pct" required type="number" min="1" max="90" placeholder="15" className="input" />
            </div>
          </div>

          <PromotionScopePicker products={products} categories={categories} />

          <button type="submit" className="btn-primary">
            Launch Promotion
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          If several promotions cover the same product, the biggest discount
          applies. For a permanent sale price on one product, edit that product
          instead.
        </p>
      </div>

      {/* List */}
      <div className="mt-5 space-y-3">
        {promotions.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">
            No promotions yet — launch your first one above. 🚀
          </div>
        )}
        {promotions.map((promo) => {
          const targeted = promo.productIds?.length ?? 0;
          return (
            <div key={promo.id} className="card flex flex-wrap items-center gap-4 p-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold ${
                  promo.active ? "bg-coral-500 text-white" : "bg-sand-100 text-slate-400"
                }`}
              >
                -{promo.pct}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{promo.name}</p>
                <p className="text-xs text-slate-400">
                  {promo.active ? "Active" : "Paused"} ·{" "}
                  {targeted === 0
                    ? "entire store"
                    : targeted <= 3
                      ? promo.productIds!.map(productName).join(", ")
                      : `${targeted} selected products`}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={togglePromotion.bind(null, promo.id)}>
                  <button
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                      promo.active
                        ? "bg-sand-100 text-slate-600 hover:bg-sand-200"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    {promo.active ? "Pause" : "Activate"}
                  </button>
                </form>
                <form action={deletePromotion.bind(null, promo.id)}>
                  <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
