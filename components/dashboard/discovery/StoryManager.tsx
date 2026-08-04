"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteStory, saveStory, toggleStoryPublished } from "@/app/actions";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import type { Category, Product, ProductStory, Store, StoryKind } from "@/lib/types";

const KINDS: { value: StoryKind; label: string; hint: string }[] = [
  { value: "how-to", label: "How to use it", hint: "Setup, first use, the steps people get wrong" },
  { value: "benefits", label: "Why it's worth it", hint: "What it actually does better, and for whom" },
  { value: "care", label: "Looking after it", hint: "Cleaning, storage, making it last" },
  { value: "stories", label: "People using it", hint: "Photos and words from real customers" },
  { value: "compare", label: "How it compares", hint: "This one vs. the alternatives you also stock" },
];

/**
 * The guide editor.
 *
 * A guide is chapters, not an essay: a heading, a short body, optionally a
 * picture. That shape is enforced by the form because it is what makes the
 * result readable — a shopper scanning for the one answer they need can
 * find it, and a seller staring at an empty box gets a prompt instead of a
 * blank page.
 */
export default function StoryManager({
  stories,
  products,
  categories,
  stores,
}: {
  stories: ProductStory[];
  products: Product[];
  categories: Category[];
  stores: Store[];
}) {
  const [editing, setEditing] = useState<ProductStory | null>(null);
  const [creating, setCreating] = useState(false);

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-5">
      {!showForm && (
        <>
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-ocean-950">📖 Product guides</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                  The part of a listing a photo and a spec table can&apos;t
                  carry: how the thing works, how to look after it, what it
                  looks like in someone&apos;s home. Guides show on the
                  product page and get their own section at{" "}
                  <Link href="/learn" className="font-semibold text-ocean-700 underline">
                    /learn
                  </Link>
                  .
                </p>
              </div>
              <button onClick={() => setCreating(true)} className="btn-primary !px-4 !py-2 text-sm">
                New guide
              </button>
            </div>
          </section>

          {stories.length === 0 ? (
            <section className="card p-8 text-center">
              <span className="text-5xl">📖</span>
              <h3 className="mt-4 font-display text-lg font-bold text-ocean-950">
                No guides yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Start with your best-selling product. Three short chapters and
                one video is enough to change how it sells.
              </p>
              <button onClick={() => setCreating(true)} className="btn-primary mt-5">
                Write the first one
              </button>
            </section>
          ) : (
            <section className="card divide-y divide-sand-200">
              {stories.map((story) => (
                <div key={story.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                          story.published
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-sand-100 text-slate-500"
                        }`}
                      >
                        {story.published ? "Live" : "Draft"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {story.kind.replace("-", " ")}
                      </span>
                      {story.videoUrl && (
                        <span className="text-[10px] font-bold text-ocean-600">▶ video</span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-semibold text-slate-800">{story.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {story.chapters.length} chapter
                      {story.chapters.length === 1 ? "" : "s"} ·{" "}
                      {story.productIds.length} product
                      {story.productIds.length === 1 ? "" : "s"}
                      {story.categorySlugs?.length
                        ? ` · ${story.categorySlugs.length} categor${story.categorySlugs.length === 1 ? "y" : "ies"}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {story.published && (
                      <Link
                        href={`/learn/${story.id}`}
                        className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-ocean-300 hover:text-ocean-700"
                      >
                        View
                      </Link>
                    )}
                    <button
                      onClick={() => setEditing(story)}
                      className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-ocean-400 hover:text-ocean-700"
                    >
                      Edit
                    </button>
                    <form action={toggleStoryPublished.bind(null, story.id)}>
                      <button className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
                        {story.published ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                    <form action={deleteStory.bind(null, story.id)}>
                      <button className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-400 hover:border-coral-400 hover:text-coral-600">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {showForm && (
        <StoryForm
          story={editing}
          products={products}
          categories={categories}
          stores={stores}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

/** How many blank chapter slots a new guide opens with. */
const STARTER_CHAPTERS = 3;

function StoryForm({
  story,
  products,
  categories,
  stores,
  onCancel,
}: {
  story: ProductStory | null;
  products: Product[];
  categories: Category[];
  stores: Store[];
  onCancel: () => void;
}) {
  const existing = story?.chapters ?? [];
  const [chapterCount, setChapterCount] = useState(
    Math.max(STARTER_CHAPTERS, existing.length),
  );

  const productOptions = useMemo(
    () => products.filter((product) => !product.hidden).slice(0, 500),
    [products],
  );

  const rootCategories = categories.filter((category) => !category.parentSlug);

  return (
    <SafeForm action={saveStory} className="space-y-5">
      {story && <input type="hidden" name="id" value={story.id} />}

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold text-ocean-950">
            {story ? "Edit guide" : "New guide"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="story-title">
              Title
            </label>
            <input
              id="story-title"
              name="title"
              required
              maxLength={120}
              defaultValue={story?.title}
              placeholder="Getting the most from your Karaca stand mixer"
              className="input"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="story-subtitle">
              One line underneath
            </label>
            <input
              id="story-subtitle"
              name="subtitle"
              maxLength={200}
              defaultValue={story?.subtitle}
              placeholder="Six things worth knowing before the first time you use it"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="story-kind">
              Kind
            </label>
            <select
              id="story-kind"
              name="kind"
              defaultValue={story?.kind ?? "how-to"}
              className="input"
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label} — {kind.hint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="story-duration">
              How long it takes
            </label>
            <input
              id="story-duration"
              name="duration"
              maxLength={20}
              defaultValue={story?.duration}
              placeholder="3 min"
              className="input"
            />
          </div>
        </div>
      </section>

      {/* ── What it's about ─────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h3 className="font-display font-bold text-ocean-950">What it&apos;s about</h3>
        <p className="mt-1 text-xs text-slate-500">
          Attach it to specific products, or to whole departments so it covers
          every listing in a range without being re-attached to each new one.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="story-products">
              Products
            </label>
            <textarea
              id="story-products"
              name="productIds"
              rows={4}
              defaultValue={story?.productIds.join("\n")}
              placeholder="One product id per line"
              className="input resize-y font-mono text-xs"
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-ocean-700">
                Find a product id
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-sand-200 bg-sand-50 p-2">
                {productOptions.map((product) => (
                  <p key={product.id} className="py-0.5 text-[11px] text-slate-500">
                    <code className="font-mono text-ocean-800">{product.id}</code> —{" "}
                    {product.name}
                  </p>
                ))}
              </div>
            </details>
          </div>

          <div>
            <label className="label" htmlFor="story-categories">
              Departments
            </label>
            <textarea
              id="story-categories"
              name="categorySlugs"
              rows={4}
              defaultValue={story?.categorySlugs?.join("\n")}
              placeholder="One category slug per line"
              className="input resize-y font-mono text-xs"
            />
            <p className="mt-2 text-[11px] text-slate-400">
              {rootCategories.map((category) => category.slug).join(" · ")}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="story-store">
              Seller (optional)
            </label>
            <select
              id="story-store"
              name="store"
              defaultValue={story?.store ?? ""}
              className="input"
            >
              <option value="">Banaadir Mall</option>
              {stores.map((store) => (
                <option key={store.slug} value={store.slug}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Media ───────────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h3 className="font-display font-bold text-ocean-950">Video &amp; images</h3>
        <p className="mt-1 text-xs text-slate-500">
          Paste any YouTube or Vimeo link — the share link is fine, we work
          out the embed. The video only loads when a shopper presses play.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="story-video">
              Video link
            </label>
            <input
              id="story-video"
              name="videoUrl"
              defaultValue={story?.videoUrl}
              placeholder="https://youtu.be/…"
              className="input"
            />
          </div>

          <div>
            <label className="label">Cover image</label>
            <PhotoPicker name="heroImageFile" multiple={false} label="Upload a cover" />
            <input
              name="heroImage"
              defaultValue={story?.heroImage}
              placeholder="…or paste an image URL"
              className="input mt-2 !py-2 font-mono text-xs"
            />
          </div>

          <div>
            <label className="label">Video still</label>
            <PhotoPicker name="posterFile" multiple={false} label="Upload a still" />
            <input
              name="poster"
              defaultValue={story?.poster}
              placeholder="…or paste an image URL"
              className="input mt-2 !py-2 font-mono text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="story-gallery">
              &ldquo;In real homes&rdquo; photos
            </label>
            <textarea
              id="story-gallery"
              name="gallery"
              rows={3}
              defaultValue={story?.gallery?.join("\n")}
              placeholder="One image URL per line — customers using the product"
              className="input resize-y font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Photos of the thing in use are the most persuasive images on a
              listing. Ask buyers for them in the delivery message.
            </p>
          </div>
        </div>
      </section>

      {/* ── Chapters ────────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-ocean-950">Chapters</h3>
            <p className="mt-1 text-xs text-slate-500">
              Short steps, in order. Empty ones are ignored, so leave spares
              blank.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChapterCount((count) => Math.min(12, count + 1))}
            className="rounded-full border border-sand-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-ocean-400 hover:text-ocean-700"
          >
            + Add chapter
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {Array.from({ length: chapterCount }).map((_, index) => {
            const chapter = existing[index];
            return (
              <div
                key={index}
                className="rounded-2xl border border-sand-200 bg-sand-50/60 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ocean-900 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <input
                    name="chapterHeading"
                    defaultValue={chapter?.heading ?? ""}
                    maxLength={80}
                    placeholder="Step heading — e.g. “Before the first use”"
                    className="input !py-2 text-sm"
                  />
                </div>
                <textarea
                  name="chapterBody"
                  defaultValue={chapter?.body ?? ""}
                  rows={3}
                  maxLength={1200}
                  placeholder="Two or three sentences. Say the thing people get wrong."
                  className="input mt-2 resize-y text-sm"
                />
                <input
                  name="chapterImage"
                  defaultValue={chapter?.image ?? ""}
                  placeholder="Image URL for this step (optional)"
                  className="input mt-2 !py-2 font-mono text-xs"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Publish ─────────────────────────────────────────────────── */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="published"
            defaultChecked={story?.published ?? false}
            className="h-5 w-5 accent-ocean-700"
          />
          <span className="text-sm font-semibold text-slate-700">
            Publish — show on product pages and in /learn
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
          <SubmitButton>{story ? "Save guide" : "Create guide"}</SubmitButton>
        </div>
      </section>
    </SafeForm>
  );
}
