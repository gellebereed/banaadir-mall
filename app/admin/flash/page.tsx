import type { Metadata } from "next";
import Link from "next/link";
import { decideFlashRequest } from "@/app/actions";
import FlashDealForm from "@/components/dashboard/FlashDealForm";
import ProductImage from "@/components/ProductImage";
import {
  getBaseProducts,
  getCategories,
  getFlashDeal,
  getFlashRequests,
  getStores,
} from "@/lib/api";
import { money, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Flash Deals" };

/**
 * Flash-deal control: curate which products are in the campaign, set the
 * countdown, and work through seller applications. Approving an
 * application adds the product and creates the discount the seller offered.
 */
export default async function AdminFlashPage() {
  const [flash, requests, products, stores, categories] = await Promise.all([
    getFlashDeal(),
    getFlashRequests(),
    getBaseProducts(),
    getStores(),
    getCategories(),
  ]);

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 8);
  const productById = (id: string) => products.find((p) => p.id === id);
  const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            ⚡ Flash Deals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {flash.productIds.length} products in the campaign · {pending.length}{" "}
            seller application{pending.length === 1 ? "" : "s"} waiting
          </p>
        </div>
        <Link href="/admin/marketing" className="btn-secondary !px-4 !py-2 text-sm">
          ← Marketing
        </Link>
      </div>

      {/* Seller applications */}
      {pending.length > 0 && (
        <div className="mt-5 rounded-2xl border-2 border-mango-200 bg-mango-50 p-5">
          <h2 className="font-display font-bold text-mango-900">
            ⏳ Seller applications ({pending.length})
          </h2>
          <div className="mt-3 space-y-3">
            {pending.map((r) => {
              const product = productById(r.productId);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
                  {product && (
                    <ProductImage
                      product={product}
                      iconClass="text-lg"
                      className="h-12 w-12 shrink-0 rounded-lg"
                      sizes="48px"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">
                      {product?.name ?? r.productId}
                    </p>
                    <p className="text-xs text-slate-500">
                      {storeName(r.store)} · offering{" "}
                      <strong className="text-coral-600">{r.pct}% off</strong>
                      {product && ` · ${money(product.price)} → ${money(product.price * (1 - r.pct / 100))}`}
                      {" · "}
                      {shortDate(r.date)}
                    </p>
                    {r.note && (
                      <p className="mt-1 truncate text-xs italic text-slate-400">
                        &ldquo;{r.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <form action={decideFlashRequest.bind(null, r.id, "approved")}>
                      <button className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700">
                        Approve
                      </button>
                    </form>
                    <form action={decideFlashRequest.bind(null, r.id, "rejected")}>
                      <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-100">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Campaign settings + product picker */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Campaign</h2>
        <FlashDealForm
          flash={flash}
          products={products}
          categories={categories}
          stores={stores}
        />
      </div>

      {/* Decision history */}
      {decided.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-3 font-display text-lg font-bold text-ocean-950">
            Recent decisions
          </h2>
          <div className="card divide-y divide-sand-100">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {productById(r.productId)?.name ?? r.productId} ·{" "}
                  {storeName(r.store)} · {r.pct}%
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                    r.status === "approved"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-coral-100 text-coral-600"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
