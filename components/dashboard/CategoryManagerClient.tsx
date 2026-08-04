"use client";

import { useState } from "react";
import {
  createCategory,
  deleteCategory,
  toggleCategoryVisibility,
  updateCategory,
} from "@/app/actions";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import {
  categoryCompleteName,
  categoryPath,
  eligibleParents,
} from "@/lib/category-tree";
import type { Category } from "@/lib/types";

export default function CategoryManagerClient({ initialCategories }: { initialCategories: Category[] }) {
  const [search, setSearch] = useState("");
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  /** Depth of a category in the tree, for the row indentation. */
  const depthOf = (slug: string) => categoryPath(initialCategories, slug).length - 1;

  /** Odoo's `complete_name`, e.g. "Home & Living / Cookware". */
  const categoryPathLabel = (slug: string) =>
    categoryCompleteName(initialCategories, slug);

  /**
   * Categories that may be chosen as a parent. When editing, the category
   * itself and everything beneath it are excluded — selecting a descendant
   * would make it its own ancestor, which the server rejects anyway. Not
   * offering the choice is friendlier than explaining the error afterwards.
   */
  const parentOptions = editingCat
    ? eligibleParents(initialCategories, editingCat.slug)
    : initialCategories;

  const filtered = initialCategories.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.tagline.toLowerCase().includes(q) ||
      categoryPathLabel(c.slug).toLowerCase().includes(q)
    );
  });

  const totalCount = initialCategories.length;
  const liveCount = initialCategories.filter((c) => !c.hidden).length;
  const hiddenCount = initialCategories.filter((c) => c.hidden).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Stats */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">
            🏷️ Category Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Control main marketplace categories. Add new categories, edit names/icons, or hide/show categories on the customer navigation bar.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCat(null);
            setShowAddModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <span>✨</span> Add New Category
        </button>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Categories</p>
          <p className="mt-2 font-display text-3xl font-extrabold text-ocean-950">{totalCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">● Live on Storefront</p>
          <p className="mt-2 font-display text-3xl font-extrabold text-emerald-700">{liveCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600">🙈 Hidden Categories</p>
          <p className="mt-2 font-display text-3xl font-extrabold text-amber-700">{hiddenCount}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card p-4">
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories by name, slug or description..."
            className="input pl-10"
          />
          <span className="absolute left-3.5 top-3 text-slate-400">🔍</span>
        </div>
      </div>

      {/* Category Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-sand-200 bg-sand-50/70 font-display text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3.5 pl-6 pr-3">Category</th>
                <th className="px-3 py-3.5">Slug</th>
                <th className="px-3 py-3.5">Tagline / Description</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="py-3.5 pl-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {filtered.map((cat) => {
                const isHidden = Boolean(cat.hidden);
                return (
                  <tr key={cat.slug} className="transition hover:bg-sand-50/50">
                    <td className="py-4 pl-6 pr-3 font-semibold text-ocean-950">
                      <div
                        className="flex items-center gap-3"
                        // Indent by depth so the hierarchy is readable at a
                        // glance, the way Odoo's own category list reads.
                        style={{ paddingLeft: `${depthOf(cat.slug) * 20}px` }}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
                          {cat.icon}
                        </span>
                        <div className="min-w-0">
                          <span>{cat.name}</span>
                          {cat.parentSlug && (
                            <p className="truncate text-[11px] font-normal text-slate-400">
                              in {categoryPathLabel(cat.parentSlug)}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 font-mono text-xs text-slate-500">{cat.slug}</td>
                    <td className="px-3 py-4 text-xs text-slate-500 max-w-xs truncate">{cat.tagline || "—"}</td>
                    <td className="px-3 py-4">
                      {isHidden ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
                          🙈 Hidden
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                          ● Live
                        </span>
                      )}
                    </td>
                    <td className="py-4 pl-3 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle Visibility */}
                        <form action={async () => { await toggleCategoryVisibility(cat.slug); }}>
                          <button
                            type="submit"
                            title={isHidden ? "Show category on website" : "Hide category from website"}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                              isHidden
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            }`}
                          >
                            {isHidden ? "👁️ Show" : "🙈 Hide"}
                          </button>
                        </form>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCat(cat);
                            setShowAddModal(true);
                          }}
                          title="Edit category"
                          className="rounded-xl border border-sand-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-sand-100"
                        >
                          ✏️ Edit
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setDeletingSlug(cat.slug)}
                          title="Delete category"
                          className="rounded-xl border border-coral-200 bg-coral-50 px-3 py-1.5 text-xs font-bold text-coral-700 transition hover:bg-coral-100"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                    No categories found matching &quot;{search}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-sand-200 pb-4">
              <h2 className="font-display text-xl font-extrabold text-ocean-950">
                {editingCat ? `✏️ Edit Category: ${editingCat.name}` : "✨ Add New Category"}
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <SafeForm
              action={async (formData) => {
                if (editingCat) {
                  await updateCategory(formData);
                } else {
                  await createCategory(formData);
                }
                setShowAddModal(false);
              }}
              className="mt-6 space-y-4"
            >
              {editingCat && <input type="hidden" name="originalSlug" value={editingCat.slug} />}

              <div>
                <label htmlFor="cat-name" className="label">Category Name</label>
                <input
                  id="cat-name"
                  name="name"
                  required
                  defaultValue={editingCat?.name ?? ""}
                  placeholder="e.g. Home Appliances"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="cat-slug" className="label">
                  Slug <span className="font-normal text-slate-400">(URL identifier, e.g. home-appliances)</span>
                </label>
                <input
                  id="cat-slug"
                  name="slug"
                  defaultValue={editingCat?.slug ?? ""}
                  placeholder="home-appliances"
                  className="input font-mono"
                />
              </div>

              <div>
                <label htmlFor="cat-icon" className="label">Category Emoji Icon</label>
                <input
                  id="cat-icon"
                  name="icon"
                  maxLength={4}
                  defaultValue={editingCat?.icon ?? "🛍️"}
                  placeholder="🛍️"
                  className="input text-xl"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Used in the navigation menus, and as the fallback if there
                  is no cover photo.
                </p>
              </div>

              {/*
                The home page renders departments as photo tiles. Leaving
                this empty is a perfectly good choice: the storefront then
                borrows the best-selling product's photo from inside this
                department, which is usually the right picture anyway.
              */}
              <div>
                <label className="label">Cover photo</label>
                <PhotoPicker
                  name="imageFile"
                  multiple={false}
                  label="Upload a department photo"
                  hint="Shown on the home page · a wide, uncluttered shot works best"
                />
                <input
                  name="image"
                  defaultValue={editingCat?.image ?? ""}
                  placeholder="…or paste an image URL"
                  className="input mt-2 !py-2 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Leave blank to use the best-selling product&apos;s photo from
                  this department automatically.
                </p>
              </div>

              <div>
                <label htmlFor="cat-tagline" className="label">Tagline / Description</label>
                <input
                  id="cat-tagline"
                  name="tagline"
                  defaultValue={editingCat?.tagline ?? ""}
                  placeholder="e.g. Kitchen, laundry & smart home electronics"
                  className="input"
                />
              </div>

              {/*
                Odoo's product.category.parent_id. Categories are a tree, and
                a product filed under a child also shows on its parent's page
                — so "Cookware" under "Home & Living" adds depth to browsing
                without splitting the catalogue in two.
              */}
              <div>
                <label htmlFor="cat-parent" className="label">
                  Parent category{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <select
                  id="cat-parent"
                  name="parentSlug"
                  defaultValue={editingCat?.parentSlug ?? ""}
                  className="input"
                >
                  <option value="">— None (top-level category) —</option>
                  {parentOptions.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.icon} {categoryPathLabel(c.slug)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Products in a subcategory also appear on the parent&apos;s
                  page. A category cannot be placed inside itself or one of
                  its own subcategories.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-sand-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <SubmitButton className="btn-primary flex-1">
                  {editingCat ? "Save Changes" : "Create Category"}
                </SubmitButton>
              </div>
            </SafeForm>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSlug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-ocean-950">
              ⚠️ Delete Category &quot;{deletingSlug}&quot;?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this category? Products currently assigned to this category will remain, but the category option will be removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSlug(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <form action={async () => {
                await deleteCategory(deletingSlug);
                setDeletingSlug(null);
              }}>
                <button type="submit" className="btn-coral">
                  Yes, Delete Category
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
