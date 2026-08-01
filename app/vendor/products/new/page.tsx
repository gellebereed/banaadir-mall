import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProduct } from "@/app/actions";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import SubmitButton from "@/components/dashboard/SubmitButton";
import VariantEditor from "@/components/dashboard/VariantEditor";
import { getCategories } from "@/lib/api";
import { can } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Add Product" };

/**
 * Add-product form. Submitting really creates the product with its photos
 * (server action → data/db.json) and it appears in the storefront at once.
 */
export default async function NewProductPage() {
  const { session } = await requireVendor();
  if (!can(session, "products")) redirect("/vendor");
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/vendor/products" className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Back to products
      </Link>
      <div className="card mt-4 p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold text-ocean-950">
          Add a new product
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          It goes live in your store the moment you publish.
        </p>

        <form action={createProduct} className="mt-6 grid gap-5 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="label">Photos</legend>
            <PhotoPicker name="photos" />
            <p className="mt-2 text-xs text-slate-400">
              Products with real photos sell far better. No photos? We&apos;ll
              use generated artwork with your chosen icon until you add some.
            </p>
          </fieldset>

          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Product name</label>
            <input id="name" name="name" required placeholder="e.g. Classic Pique Polo Shirt" className="input" />
          </div>
          <div>
            <label htmlFor="price" className="label">Price (USD)</label>
            <input id="price" name="price" required type="number" min="0.01" step="0.01" placeholder="29.00" className="input" />
          </div>
          <div>
            <label htmlFor="compareAt" className="label">
              Original price <span className="font-normal text-slate-400">(optional, shows a sale)</span>
            </label>
            <input id="compareAt" name="compareAt" type="number" min="0" step="0.01" placeholder="39.00" className="input" />
          </div>
          <div>
            <label htmlFor="category" className="label">Category</label>
            <select id="category" name="category" className="input">
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stock" className="label">Stock quantity</label>
            <input id="stock" name="stock" required type="number" min="0" placeholder="50" className="input" />
          </div>
          <div>
            <label htmlFor="colors" className="label">
              Colours <span className="font-normal text-slate-400">(comma separated)</span>
            </label>
            <input id="colors" name="colors" placeholder="Black, Navy, Beige" className="input" />
          </div>
          <div>
            <label htmlFor="sizes" className="label">
              Sizes <span className="font-normal text-slate-400">(comma separated)</span>
            </label>
            <input id="sizes" name="sizes" placeholder="S, M, L, XL" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="icon" className="label">
              Fallback icon <span className="font-normal text-slate-400">(used when there are no photos)</span>
            </label>
            <input id="icon" name="icon" maxLength={4} placeholder="🛍️" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">Description</label>
            <textarea id="description" name="description" required rows={4} placeholder="What makes this product great?" className="input resize-none" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="features" className="label">
              Feature bullets <span className="font-normal text-slate-400">(one per line)</span>
            </label>
            <textarea id="features" name="features" rows={3} placeholder={"Ships within 24 hours\n7-day easy returns"} className="input resize-none" />
          </div>

          <section className="sm:col-span-2">
            <span className="label">Variants</span>
            <p className="mb-3 text-xs text-slate-500">
              Optional — add them when a colour or size needs its own stock,
              price or photos. Otherwise the simple options above are used.
            </p>
            <VariantEditor initial={[]} basePrice={0} />
          </section>

          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Publishing…">Publish Product</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
