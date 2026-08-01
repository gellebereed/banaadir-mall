import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteProduct, updateProduct } from "@/app/actions";
import PhotoManager from "@/components/dashboard/PhotoManager";
import SubmitButton from "@/components/dashboard/SubmitButton";
import VariantEditor from "@/components/dashboard/VariantEditor";
import { getBaseProduct, getCategories, getDiscountMap } from "@/lib/api";
import { can } from "@/lib/auth";
import { discountPct } from "@/lib/format";
import { hasVariants } from "@/lib/product-utils";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Edit Product" };

/**
 * Full product editor — photos (reorder / main / remove), pricing, stock,
 * variants with their own stock, price and photos, plus all copy.
 * Used by sellers (own products) and admins (any product).
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, storeSlug } = await requireVendor();
  if (!can(session, "products")) redirect("/vendor");

  const { id } = await params;
  // getBaseProduct (not getProduct): the form must edit the seller's own
  // prices, never the temporarily discounted ones a promotion produces.
  const [product, categories] = await Promise.all([getBaseProduct(id), getCategories()]);
  if (!product) notFound();
  if (session.role !== "admin" && product.store !== storeSlug) notFound();

  const discounts = await getDiscountMap(product.store);
  const activePct = discounts[product.id] ?? 0;
  const backHref = session.role === "admin" ? "/admin/products" : "/vendor/products";
  const photos = product.images ?? [];
  const usesVariants = hasVariants(product);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={backHref} className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Back to products
      </Link>

      <div className="card mt-4 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-sand-100 text-2xl">
            {photos[0] ? (
              <Image src={photos[0]} alt="" width={48} height={48} className="h-full w-full object-cover" />
            ) : (
              product.icon
            )}
          </span>
          <div>
            <h1 className="font-display text-xl font-extrabold text-ocean-950">
              Edit product
            </h1>
            <p className="text-xs text-slate-400">
              {product.slug} · {product.sold.toLocaleString()} sold
            </p>
          </div>
        </div>

        {activePct > 0 && (
          <p className="mt-4 rounded-xl bg-coral-100/50 px-4 py-3 text-sm text-coral-700">
            🏷️ A <strong>{activePct}% discount</strong> currently applies to this
            product. These are your normal prices — customers automatically pay{" "}
            {activePct}% less until the promotion ends.
          </p>
        )}

        <form action={updateProduct} className="mt-6 space-y-8">
          <input type="hidden" name="id" value={product.id} />

          {/* ── Photos ───────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 font-display font-bold text-ocean-950">📸 Photos</h2>
            <PhotoManager initial={photos} />
          </section>

          {/* ── Basics ───────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 font-display font-bold text-ocean-950">📝 Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className="label">Product name</label>
                <input id="name" name="name" required defaultValue={product.name} className="input" />
              </div>
              <div>
                <label htmlFor="price" className="label">
                  {usesVariants ? "Base price (USD)" : "Price (USD)"}
                </label>
                <input id="price" name="price" required type="number" min="0.01" step="0.01" defaultValue={product.price} className="input" />
                {usesVariants && (
                  <p className="mt-1 text-xs text-slate-400">
                    Used for variants that have no price of their own.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="compareAt" className="label">
                  Original price{" "}
                  <span className="font-normal text-slate-400">(empty = no sale)</span>
                </label>
                <input id="compareAt" name="compareAt" type="number" min="0" step="0.01" defaultValue={product.compareAt ?? ""} className="input" />
                {product.compareAt && (
                  <p className="mt-1 text-xs font-semibold text-coral-600">
                    Showing −{discountPct(product.price, product.compareAt)}%
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="stock" className="label">
                  Stock quantity
                </label>
                <input
                  id="stock"
                  name="stock"
                  type="number"
                  min="0"
                  defaultValue={product.stock}
                  disabled={usesVariants}
                  className="input disabled:bg-sand-100 disabled:text-slate-400"
                />
                {usesVariants && (
                  <p className="mt-1 text-xs text-slate-400">
                    Managed per variant below.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="category" className="label">Category</label>
                <select id="category" name="category" defaultValue={product.category} className="input">
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="icon" className="label">
                  Fallback icon{" "}
                  <span className="font-normal text-slate-400">(no photos)</span>
                </label>
                <input id="icon" name="icon" maxLength={4} defaultValue={product.icon} className="input" />
              </div>
              <div>
                <label htmlFor="badge" className="label">Badge</label>
                <select id="badge" name="badge" defaultValue={product.badge ?? ""} className="input">
                  <option value="">No badge</option>
                  <option value="New">New</option>
                  <option value="Bestseller">Bestseller</option>
                  <option value="Sale">Sale</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Variants ─────────────────────────────────────────── */}
          <section>
            <h2 className="mb-1 font-display font-bold text-ocean-950">
              🎨 Variants
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Give each colour or size its own stock, price and photos. The
              product page switches photos and price as customers choose.
            </p>
            <VariantEditor
              initial={product.variants ?? []}
              basePrice={product.price}
              initialDefaultId={product.defaultVariantId}
            />

            {!usesVariants && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="colors" className="label">
                    Simple colours{" "}
                    <span className="font-normal text-slate-400">(comma separated)</span>
                  </label>
                  <input id="colors" name="colors" defaultValue={product.colors?.join(", ") ?? ""} placeholder="Black, Navy, Beige" className="input" />
                </div>
                <div>
                  <label htmlFor="sizes" className="label">
                    Simple sizes{" "}
                    <span className="font-normal text-slate-400">(comma separated)</span>
                  </label>
                  <input id="sizes" name="sizes" defaultValue={product.sizes?.join(", ") ?? ""} placeholder="S, M, L, XL" className="input" />
                </div>
                <p className="text-xs text-slate-400 sm:col-span-2">
                  Simple options share one price and stock pool. Add variants
                  above when they need their own.
                </p>
              </div>
            )}
          </section>

          {/* ── Copy ─────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 font-display font-bold text-ocean-950">✍️ Description</h2>
            <div className="grid gap-4">
              <div>
                <label htmlFor="description" className="label">Description</label>
                <textarea id="description" name="description" required rows={4} defaultValue={product.description} className="input resize-none" />
              </div>
              <div>
                <label htmlFor="features" className="label">
                  Feature bullets{" "}
                  <span className="font-normal text-slate-400">(one per line)</span>
                </label>
                <textarea id="features" name="features" rows={4} defaultValue={product.features.join("\n")} className="input resize-none" />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <SubmitButton className="btn-primary flex-1">Save Changes</SubmitButton>
            <Link href={`/product/${product.slug}`} className="btn-secondary">
              Preview
            </Link>
          </div>
        </form>

        {/* Danger zone */}
        <div className="mt-6 flex items-center justify-between rounded-xl border border-coral-100 bg-coral-100/30 px-4 py-3">
          <p className="text-xs text-slate-500">
            Remove this product from the marketplace permanently.
          </p>
          <form action={deleteProduct.bind(null, product.id)}>
            <button className="rounded-full border border-coral-500 px-4 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white">
              Delete Product
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
