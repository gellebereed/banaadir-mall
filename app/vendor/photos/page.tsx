import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { bulkImportPhotos } from "@/app/actions";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import ProductImage from "@/components/ProductImage";
import { getBaseProductsByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Bulk Photos" };

/**
 * Bulk photo import — the fast way to put real photos on a whole catalog.
 * Files are matched to products by filename (product slug), so a seller
 * can drop in an export from their brand's media library in one go.
 */
export default async function VendorPhotosPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "photos.manage")) redirect("/vendor");

  const products = await getBaseProductsByStore(storeSlug);
  const missing = products.filter((p) => (p.images?.length ?? 0) === 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        Bulk Photo Import
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload many photos at once. Each file is matched to a product by its
        file name — no clicking through products one by one.
      </p>

      {/* Progress */}
      <div className="card mt-5 flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1">
          <p className="font-display text-lg font-bold text-ocean-950">
            {products.length - missing.length} of {products.length} products
            have photos
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sand-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-emerald-500 transition-all"
              style={{
                width: `${products.length ? ((products.length - missing.length) / products.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        {missing.length === 0 && (
          <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
            🎉 All done
          </span>
        )}
      </div>

      {/* Import form */}
      <div className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📥 Import photos</h2>
        <ol className="mt-3 space-y-1.5 text-sm text-slate-600">
          <li>
            <strong>1.</strong> Name each file after its product id, e.g.{" "}
            <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">
              {products[0]?.slug ?? "product-id"}.jpg
            </code>
          </li>
          <li>
            <strong>2.</strong> For extra photos of the same product, add a
            suffix:{" "}
            <code className="rounded bg-sand-100 px-1.5 py-0.5 text-xs">
              {products[0]?.slug ?? "product-id"}-2.jpg
            </code>
          </li>
          <li>
            <strong>3.</strong> Select them all below and import. Files that
            don&apos;t match a product id are skipped.
          </li>
        </ol>

        <form action={bulkImportPhotos} className="mt-4 space-y-4">
          <PhotoPicker name="photos" label="Select many photos at once" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="replace" className="h-4 w-4 accent-ocean-700" />
            Replace existing photos instead of adding to them
          </label>
          <button type="submit" className="btn-primary">
            Import Photos
          </button>
        </form>
      </div>

      {/* Products still missing photos, with their exact file names */}
      {missing.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-3 font-display text-lg font-bold text-ocean-950">
            Waiting for photos ({missing.length})
          </h2>
          <div className="card divide-y divide-sand-100">
            {missing.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <ProductImage
                  product={p}
                  iconClass="text-lg"
                  className="h-10 w-10 shrink-0 rounded-lg"
                  sizes="40px"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    name the file{" "}
                    <code className="rounded bg-sand-100 px-1 py-0.5">{p.slug}.jpg</code>
                  </p>
                </div>
                <Link
                  href={`/vendor/products/${p.id}/edit`}
                  className="shrink-0 text-xs font-bold text-ocean-700 hover:underline"
                >
                  Open →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
