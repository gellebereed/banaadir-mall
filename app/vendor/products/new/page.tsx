import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProduct } from "@/app/actions";
import FormattedTextarea from "@/components/dashboard/FormattedTextarea";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import ProductCodesFields from "@/components/dashboard/ProductCodesFields";
import SafeForm from "@/components/dashboard/SafeForm";
import SubcategoryField from "@/components/dashboard/SubcategoryField";
import SubmitButton from "@/components/dashboard/SubmitButton";
import VariantEditor from "@/components/dashboard/VariantEditor";
import { getCategories, getSubcategories } from "@/lib/api";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Add Product" };

/**
 * Add-product form. Submitting really creates the product with its photos
 * (server action → data/db.json) and it appears in the storefront at once.
 */
export default async function NewProductPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) redirect("/vendor");
  const [categories, subcategories] = await Promise.all([
    getCategories(),
    getSubcategories(),
  ]);

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

        <SafeForm action={createProduct} storageKey="banaadir_draft_new_product" className="mt-6 grid gap-5 sm:grid-cols-2">
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
          <SubcategoryField existing={subcategories} />

          {/*
            Product codes. Kept next to the category rather than hidden in an
            "advanced" panel: these are the fields the warehouse and the Odoo
            sync key on, and a code added at creation is a code that never has
            to be reconciled later.
          */}
          <fieldset className="grid gap-5 sm:col-span-2 sm:grid-cols-2">
            <legend className="label mb-0">Product codes</legend>
            <ProductCodesFields storeSlug={storeSlug} productNameFieldId="name" />
          </fieldset>

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
            <FormattedTextarea
              id="description"
              name="description"
              label="Description"
              required
              rows={5}
              placeholder="What makes this product great?"
            />
          </div>
          <div className="sm:col-span-2">
            <FormattedTextarea
              id="features"
              name="features"
              label="Feature bullets (one per line)"
              rows={4}
              isListMode
              placeholder={"Ships within 24 hours\n7-day easy returns"}
            />
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
        </SafeForm>
      </div>
    </div>
  );
}
