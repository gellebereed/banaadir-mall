import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deletePromotion, togglePromotion } from "@/app/actions";
import PromotionForm from "@/components/dashboard/PromotionForm";
import {
  getBaseProductsByStore,
  getCategories,
  getDiscountMap,
  getPromotionsByStore,
  isPromotionLive,
} from "@/lib/api";
import { may } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { requireVendor } from "@/lib/session";
import type { Promotion } from "@/lib/types";

export const metadata: Metadata = { title: "Promotions" };

// Promotions change pricing across the storefront, so never serve a cached
// view of them here.
export const dynamic = "force-dynamic";

/** Human status for a promotion, including scheduled and expired states. */
function promoStatus(promo: Promotion): { label: string; tone: string } {
  const now = new Date();
  if (!promo.active) return { label: "Paused", tone: "bg-sand-100 text-slate-500" };
  if (promo.startsAt && new Date(promo.startsAt) > now) {
    return { label: "Scheduled", tone: "bg-sky-100 text-sky-700" };
  }
  if (promo.endsAt && new Date(promo.endsAt) < now) {
    return { label: "Expired", tone: "bg-slate-200 text-slate-600" };
  }
  return { label: "Live", tone: "bg-emerald-100 text-emerald-700" };
}

export default async function VendorPromotionsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "promotions.manage")) redirect("/vendor");

  const [promotions, products, categories, discounts] = await Promise.all([
    getPromotionsByStore(storeSlug),
    getBaseProductsByStore(storeSlug),
    getCategories(),
    getDiscountMap(storeSlug),
  ]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const discountedCount = Object.keys(discounts).length;
  const liveCount = promotions.filter((p) => isPromotionLive(p)).length;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">Promotions</h1>
      <p className="mt-1 text-sm text-slate-500">
        Discount your whole store or just the products you choose. Customers
        see the sale price and the crossed-out original everywhere, instantly.
      </p>

      {/* What is actually discounted right now — the real source of truth */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Running now</p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">{liveCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Products discounted</p>
          <p className="font-display text-2xl font-extrabold text-ocean-950">
            {discountedCount}
            <span className="text-sm font-semibold text-slate-400"> / {products.length}</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500">Biggest discount</p>
          <p className="font-display text-2xl font-extrabold text-coral-600">
            {discountedCount > 0 ? `${Math.max(...Object.values(discounts))}%` : "—"}
          </p>
        </div>
      </div>

      {/* Create */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🏷️ New promotion</h2>
        <PromotionForm products={products} categories={categories} />
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
          const status = promoStatus(promo);
          const live = isPromotionLive(promo);
          return (
            <div key={promo.id} className="card flex flex-wrap items-center gap-4 p-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold ${
                  live ? "bg-coral-500 text-white" : "bg-sand-100 text-slate-400"
                }`}
              >
                -{promo.pct}%
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  {promo.name}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>
                    {status.label}
                  </span>
                </p>
                <p className="text-xs text-slate-400">
                  {targeted === 0
                    ? "Entire store"
                    : targeted <= 3
                      ? promo.productIds!.map(productName).join(", ")
                      : `${targeted} selected products`}
                  {promo.startsAt && ` · from ${shortDate(promo.startsAt.slice(0, 10))}`}
                  {promo.endsAt && ` · until ${shortDate(promo.endsAt.slice(0, 10))}`}
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

      {/* Exactly which products are discounted, and to what */}
      {discountedCount > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold text-ocean-950">
            Currently discounted ({discountedCount})
          </h2>
          <div className="card divide-y divide-sand-100">
            {products
              .filter((p) => discounts[p.id])
              .map((p) => {
                const pct = discounts[p.id];
                const newPrice = Math.round(p.price * (1 - pct / 100) * 100) / 100;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {p.name}
                    </span>
                    <span className="text-slate-400 line-through">{money(p.price)}</span>
                    <span className="font-bold text-coral-600">{money(newPrice)}</span>
                    <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-bold text-coral-600">
                      −{pct}%
                    </span>
                    <Link
                      href={`/product/${p.slug}`}
                      className="text-xs font-bold text-ocean-700 hover:underline"
                    >
                      View →
                    </Link>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
