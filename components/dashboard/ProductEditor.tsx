"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import FormattedTextarea from "@/components/dashboard/FormattedTextarea";
import PhotoManager from "@/components/dashboard/PhotoManager";
import ProductCodesFields from "@/components/dashboard/ProductCodesFields";
import SafeForm from "@/components/dashboard/SafeForm";
import SearchableSelect, { type SelectOption } from "@/components/dashboard/SearchableSelect";
import SubcategoryField from "@/components/dashboard/SubcategoryField";
import AttributeFields from "@/components/dashboard/AttributeFields";
import type { AttributeSets } from "@/lib/taxonomy-attributes";
import SubmitButton from "@/components/dashboard/SubmitButton";
import VariantEditor, { type VariantSummary } from "@/components/dashboard/VariantEditor";
import { discountPct, money } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRODUCT EDITOR — one screen for adding and editing a product.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why it was rebuilt ───────────────────────────────────────────────────
 * Add and Edit were two different forms: one long single column each,
 * fields in a different order on each, and variants at the very bottom
 * as a stack of tall cards. Sellers could not tell what was required, what
 * the product would look like, or whether they had finished — and the
 * Save button was a scroll away from wherever they were.
 *
 * Now both use this layout, modelled on the editors sellers already know:
 *   main column  Photos → Details → Pricing → Options & stock → Codes
 *   side column  Status, Organisation, a live preview and a checklist
 *   bottom bar   Save is always one tap away, on every screen size
 *
 * ── The server contract is unchanged ─────────────────────────────────────
 * Every field keeps the name `createProduct` / `updateProduct` read, so
 * the actions did not move. The variant editor owns `colors`, `sizes`,
 * `variantsJson` and `defaultVariantId`; the photo manager owns `photos`
 * and `imagesJson`.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface Snapshot {
  name: string;
  price: number;
  compareAt: number;
  description: string;
  category: string;
  stock: number;
  hasCode: boolean;
  photoCount: number;
  photoSrc: string | null;
}

const EMPTY: Snapshot = {
  name: "",
  price: 0,
  compareAt: 0,
  description: "",
  category: "",
  stock: 0,
  hasCode: false,
  photoCount: 0,
  photoSrc: null,
};

const SECTIONS = [
  { id: "photos", label: "Photos" },
  { id: "details", label: "Details" },
  { id: "pricing", label: "Pricing" },
  { id: "options", label: "Options & stock" },
  { id: "attributes", label: "Attributes" },
  { id: "codes", label: "Codes" },
];

export default function ProductEditor({
  mode,
  action,
  storeSlug,
  categories,
  subcategories,
  attributeSets = { defs: {}, byCategory: {} },
  product,
  discountPct: activeDiscount = 0,
  backHref,
  previewHref,
  dangerZone,
}: {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void | { error?: string }>;
  storeSlug: string;
  categories: SelectOption[];
  subcategories: string[];
  /** Standard attributes per category (lib/taxonomy-attributes.ts). */
  attributeSets?: AttributeSets;
  /** The product being edited, at its BASE prices (never promotion prices). */
  product?: Product;
  /** A promotion currently discounting this product, in percent. */
  discountPct?: number;
  backHref: string;
  previewHref?: string;
  /** Rendered below the form — it holds its own <form>, which cannot nest. */
  dangerZone?: React.ReactNode;
}) {
  const isEdit = mode === "edit";
  const rootRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snapshot>(() =>
    product
      ? {
          ...EMPTY,
          name: product.name,
          price: product.price,
          compareAt: product.compareAt ?? 0,
          description: product.description,
          category: product.category,
          stock: product.stock,
          hasCode: Boolean(product.barcode || product.internalReference),
          photoCount: product.images?.length ?? 0,
        }
      : EMPTY,
  );
  const [variantSummary, setVariantSummary] = useState<VariantSummary>({
    count: product?.variants?.length ?? 0,
    totalStock: 0,
  });
  const [categoryError, setCategoryError] = useState(false);
  const [attributesFilled, setAttributesFilled] = useState({ filled: 0, total: 0 });
  const onAttributesFilled = useCallback((filled: number, total: number) => {
    setAttributesFilled((prev) => (prev.filled === filled && prev.total === total ? prev : { filled, total }));
  }, []);
  const [visibility, setVisibility] = useState<"live" | "hidden">(
    product?.hidden ? "hidden" : "live",
  );

  /*
   * ── Reading the form, not mirroring it ───────────────────────────────
   * The preview and checklist need the current name, price, photos… but
   * turning every field into controlled state would fight SafeForm, which
   * restores drafts by writing straight into the inputs. So the inputs stay
   * uncontrolled and this reads them: on every input event, and on a slow
   * tick for the widgets that change hidden inputs (photos, category),
   * which fire no events at all.
   */
  const read = useCallback(() => {
    const root = rootRef.current;
    const form = root?.closest("form");
    if (!root || !form) return;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const photoImgs = root.querySelectorAll<HTMLImageElement>("#photos img");
    const first = photoImgs[0];
    const next: Snapshot = {
      name: text("name"),
      price: Number(text("price")) || 0,
      compareAt: Number(text("compareAt")) || 0,
      description: text("description"),
      category: text("category"),
      stock: Number(text("stock")) || 0,
      hasCode: Boolean(text("barcode") || text("internalReference")),
      photoCount: photoImgs.length,
      photoSrc: first ? first.currentSrc || first.src : null,
    };
    setSnap((prev) =>
      (Object.keys(next) as (keyof Snapshot)[]).every((k) => prev[k] === next[k]) ? prev : next,
    );
  }, []);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    /*
     * Deferred to the next frame, never read inside the event itself: this
     * listener runs BEFORE React's own handler for the same keystroke, and
     * re-rendering there snapped controlled fields (the description box)
     * back to their previous value — typing into them did nothing.
     */
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    const first = window.setTimeout(read, 50); // after SafeForm restores a draft
    const tick = window.setInterval(read, 1000);
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(first);
      window.clearInterval(tick);
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
    };
  }, [read]);

  const onVariantSummary = useCallback((summary: VariantSummary) => {
    setVariantSummary((prev) =>
      prev.count === summary.count && prev.totalStock === summary.totalStock ? prev : summary,
    );
  }, []);

  /*
   * The category travels in a hidden input, and browsers skip `required`
   * on hidden inputs — so an empty one reached the server and came back as
   * a raw error. Checked here, before anything is uploaded.
   */
  function validateBeforeSubmit(e: React.FormEvent<HTMLFormElement>) {
    const category = String(new FormData(e.currentTarget).get("category") ?? "");
    if (category) return;
    e.preventDefault();
    e.stopPropagation();
    setCategoryError(true);
    document.getElementById("organisation")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const usesVariants = variantSummary.count > 0;
  const stock = usesVariants ? variantSummary.totalStock : snap.stock;
  const onSale = snap.compareAt > snap.price && snap.price > 0;
  const customerPrice = activeDiscount > 0 ? snap.price * (1 - activeDiscount / 100) : snap.price;

  const checklist = [
    { done: snap.photoCount > 0, label: "Add at least one photo", target: "photos" },
    { done: snap.name.length >= 3, label: "Name the product", target: "details" },
    { done: snap.description.length >= 40, label: "Describe it (a few sentences)", target: "details" },
    { done: snap.price > 0, label: "Set a price", target: "pricing" },
    { done: Boolean(snap.category), label: "Choose a category", target: "organisation" },
    { done: stock > 0, label: "Add stock", target: "options" },
    // Only when the category has attributes; two is enough to be findable.
    ...(attributesFilled.total > 0
      ? [{
          done: attributesFilled.filled >= Math.min(2, attributesFilled.total),
          label: "Fill in attributes (shoppers filter by them)",
          target: "attributes",
        }]
      : []),
    { done: snap.hasCode, label: "Add a barcode or reference", target: "codes" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const score = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className="mx-auto max-w-6xl pb-28">
      <Link href={backHref} className="text-sm font-semibold text-ocean-700 hover:underline">
        ← Back to products
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">
            {isEdit ? snap.name || "Edit product" : "Add a product"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isEdit && product
              ? `${product.sold.toLocaleString()} sold · last saved ${
                  product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : "—"
                }`
              : "Fill in the essentials — everything else can be added later."}
          </p>
        </div>
        {previewHref && (
          <Link
            href={previewHref}
            target="_blank"
            className="rounded-full border border-sand-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-ocean-400 hover:text-ocean-800"
          >
            View in shop ↗
          </Link>
        )}
      </div>

      {/* Jump links — the form is long, and sellers come back for one part. */}
      <nav className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full bg-sand-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-ocean-100 hover:text-ocean-800"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {activeDiscount > 0 && (
        <p className="mt-4 rounded-xl bg-coral-100/50 px-4 py-3 text-sm text-coral-700">
          🏷️ A <strong>{activeDiscount}% promotion</strong> applies to this product. You are
          editing your normal prices — customers automatically pay {activeDiscount}% less until
          it ends.
        </p>
      )}

      <SafeForm
        action={action}
        storageKey={isEdit ? undefined : "banaadir_draft_new_product"}
        onSubmitCapture={validateBeforeSubmit}
        className="mt-5"
      >
        <div ref={rootRef} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          {product && <input type="hidden" name="id" value={product.id} />}

          {/* ═══ Main column ═══════════════════════════════════════════ */}
          <div className="min-w-0 space-y-5">
            <Section
              id="photos"
              title="Photos"
              hint="The first photo is the cover. Hover a photo to move it, make it the cover (★) or remove it."
            >
              <PhotoManager initial={product?.images ?? []} />
            </Section>

            <Section id="details" title="Details">
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="label">
                    Product name <Required />
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    defaultValue={product?.name}
                    placeholder="e.g. Classic Pique Polo Shirt"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Lead with what it is, then the brand or detail buyers search for.
                  </p>
                </div>
                <FormattedTextarea
                  id="description"
                  name="description"
                  label="Description"
                  required
                  rows={6}
                  defaultValue={product?.description}
                  placeholder="What is it made of, who is it for, and why will they love it?"
                />
                <FormattedTextarea
                  id="features"
                  name="features"
                  label="Key features (one per line)"
                  rows={4}
                  isListMode
                  defaultValue={product?.features.join("\n")}
                  placeholder={"100% cotton\nMachine washable\nShips within 24 hours"}
                />
              </div>
            </Section>

            <Section id="pricing" title="Pricing">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="price" className="label">
                    {usesVariants ? "Base price" : "Price"} <Required />
                  </label>
                  <MoneyInput id="price" name="price" required min="0.01" defaultValue={product?.price} placeholder="29.00" />
                  <p className="mt-1 text-xs text-slate-400">
                    {usesVariants
                      ? "Used by any variant without its own price."
                      : "What the customer pays."}
                  </p>
                </div>
                <div>
                  <label htmlFor="compareAt" className="label">
                    Compare-at price <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <MoneyInput id="compareAt" name="compareAt" min="0" defaultValue={product?.compareAt ?? ""} placeholder="39.00" />
                  <p className="mt-1 text-xs text-slate-400">
                    Higher than the price to show it as a sale.
                  </p>
                </div>
              </div>
              {snap.price > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sand-50 px-4 py-3 text-sm">
                  <span className="text-slate-500">Customers see</span>
                  <span className="font-display text-lg font-extrabold text-ocean-950">
                    {money(customerPrice)}
                  </span>
                  {(onSale || activeDiscount > 0) && (
                    <span className="text-slate-400 line-through">
                      {money(onSale ? snap.compareAt : snap.price)}
                    </span>
                  )}
                  {onSale && (
                    <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs font-extrabold text-coral-600">
                      −{discountPct(snap.price, snap.compareAt)}%
                    </span>
                  )}
                  {snap.compareAt > 0 && !onSale && (
                    <span className="text-xs font-semibold text-mango-700">
                      Compare-at is not above the price, so no sale is shown.
                    </span>
                  )}
                </div>
              )}
            </Section>

            <Section
              id="options"
              title="Options & stock"
              hint="Add colours and sizes. Keep one shared stock count, or track each combination with its own price, stock, barcode and photos."
            >
              {!usesVariants && (
                <div className="mb-5 max-w-xs">
                  <label htmlFor="stock" className="label">
                    Quantity in stock <Required />
                  </label>
                  <input
                    id="stock"
                    name="stock"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    required
                    defaultValue={product?.stock}
                    placeholder="50"
                    className="input"
                  />
                </div>
              )}
              <VariantEditor
                initial={product?.variants ?? []}
                basePrice={product?.price ?? snap.price}
                initialDefaultId={product?.defaultVariantId}
                initialColors={product?.variants?.length ? [] : product?.colors}
                initialSizes={product?.variants?.length ? [] : product?.sizes}
                onSummaryChange={onVariantSummary}
              />
            </Section>

            <Section
              id="attributes"
              title="Attributes"
              hint="Standard details for this category. Shoppers filter by them across every store, so pick from the list rather than describing it in the text."
            >
              <AttributeFields
                category={snap.category}
                sets={attributeSets}
                initial={product?.attributes}
                onFilledChange={onAttributesFilled}
              />
            </Section>

            <Section
              id="codes"
              title="Product codes"
              hint="How the warehouse, scanners and Odoo identify this product. Both must be unique across the marketplace."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProductCodesFields
                  storeSlug={product?.store ?? storeSlug}
                  defaultReference={product?.internalReference ?? ""}
                  defaultBarcode={product?.barcode ?? ""}
                  defaultUom={product?.uom ?? "Units"}
                  productNameFieldId={isEdit ? undefined : "name"}
                />
              </div>
              {usesVariants && (
                <p className="mt-3 rounded-xl bg-ocean-50 px-4 py-3 text-xs text-ocean-900">
                  Variants can carry their own SKU and barcode (open a variant&apos;s details).
                  These codes are the fallback for variants without one.
                </p>
              )}
            </Section>
          </div>

          {/* ═══ Side column ═══════════════════════════════════════════ */}
          <aside className="space-y-5 xl:sticky xl:top-24">
            <Section id="status" title="Status" compact>
              {isEdit ? (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Visibility">
                  {(
                    [
                      { value: "live", icon: "🟢", title: "Live", sub: "In the shop" },
                      { value: "hidden", icon: "👁️", title: "Hidden", sub: "Only you" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`cursor-pointer rounded-xl border-2 px-3 py-2.5 transition ${
                        visibility === opt.value
                          ? "border-ocean-600 bg-ocean-50"
                          : "border-sand-200 hover:border-sand-200 hover:bg-sand-50"
                      }`}
                    >
                      {/*
                        Radios with explicit values, not a checkbox: an
                        unticked checkbox sends nothing, which the action
                        would read as "this form has no visibility control".
                      */}
                      <input
                        type="radio"
                        name="visibility"
                        value={opt.value}
                        checked={visibility === opt.value}
                        onChange={() => setVisibility(opt.value)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-bold text-slate-800">
                        {opt.icon} {opt.title}
                      </span>
                      <span className="block text-[11px] text-slate-500">{opt.sub}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                  🟢 Goes <strong>live</strong> in your shop as soon as you publish. You can
                  hide it any time.
                </p>
              )}
            </Section>

            <Section id="organisation" title="Organisation" compact>
              <div className="space-y-4">
                <div>
                  <label htmlFor="category" className="label">
                    Category <Required />
                  </label>
                  <SearchableSelect
                    id="category"
                    name="category"
                    required
                    defaultValue={product?.category ?? ""}
                    onChange={() => setCategoryError(false)}
                    placeholder="Choose a category"
                    searchPlaceholder="Type to find a category…"
                    options={categories}
                  />
                  {categoryError && (
                    <p className="mt-1 text-xs font-semibold text-coral-600">
                      Choose a category so customers can find this product.
                    </p>
                  )}
                </div>
                <SubcategoryField existing={subcategories} defaultValue={product?.subcategory} />
                <div className="grid grid-cols-2 gap-3">
                  {isEdit && (
                    <div>
                      <label htmlFor="badge" className="label">Badge</label>
                      <select id="badge" name="badge" defaultValue={product?.badge ?? ""} className="input !px-3">
                        <option value="">None</option>
                        <option value="New">New</option>
                        <option value="Bestseller">Bestseller</option>
                        <option value="Sale">Sale</option>
                      </select>
                    </div>
                  )}
                  <div className={isEdit ? "" : "col-span-2"}>
                    <label htmlFor="icon" className="label" title="Shown when the product has no photos">
                      Fallback icon
                    </label>
                    <input
                      id="icon"
                      name="icon"
                      maxLength={4}
                      defaultValue={product?.icon}
                      placeholder="🛍️"
                      className="input !px-3 text-center text-lg"
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Live preview — roughly how the shop card will look. */}
            <Section id="preview" title="Preview" compact>
              <div className="overflow-hidden rounded-xl border border-sand-200">
                <div className="relative flex aspect-square items-center justify-center bg-sand-100 text-5xl">
                  {snap.photoSrc ? (
                    // Mirrors whatever the photo grid shows, including local blobs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={snap.photoSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden>{product?.icon ?? "🛍️"}</span>
                  )}
                  {onSale && (
                    <span className="absolute left-2 top-2 rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-extrabold text-white">
                      −{discountPct(snap.price, snap.compareAt)}%
                    </span>
                  )}
                  {isEdit && visibility === "hidden" && (
                    <span className="absolute right-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-bold text-white">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-800">
                    {snap.name || <span className="text-slate-400">Product name</span>}
                  </p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-display font-extrabold text-ocean-950">
                      {snap.price > 0 ? money(customerPrice) : "$—"}
                    </span>
                    {onSale && (
                      <span className="text-xs text-slate-400 line-through">{money(snap.compareAt)}</span>
                    )}
                  </p>
                  <p className={`mt-1 text-[11px] font-semibold ${stock > 0 ? "text-emerald-600" : "text-coral-600"}`}>
                    {stock > 0 ? `${stock.toLocaleString()} in stock` : "Out of stock"}
                    {usesVariants && ` · ${variantSummary.count} variants`}
                  </p>
                </div>
              </div>
            </Section>

            <Section id="checklist" title="Listing quality" compact>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score === 100 ? "bg-emerald-500" : score >= 60 ? "bg-mango-500" : "bg-coral-500"
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-xs font-extrabold text-slate-700">{score}%</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.label}>
                    <a
                      href={`#${item.target}`}
                      className={`flex items-center gap-2 text-xs ${
                        item.done ? "text-slate-400" : "font-semibold text-slate-700 hover:text-ocean-700"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          item.done ? "bg-emerald-500 text-white" : "border border-sand-200 bg-white"
                        }`}
                      >
                        {item.done ? "✓" : ""}
                      </span>
                      <span className={item.done ? "line-through" : ""}>{item.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          </aside>
        </div>

        {/* ═══ Save bar — always within reach ════════════════════════════ */}
        {/* z-50 so it sits over the shop's mobile tab bar: while editing,
            Save matters more than jumping to the cart. */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-sand-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(12,43,52,0.25)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="hidden min-w-0 truncate text-xs text-slate-500 sm:block">
              {doneCount === checklist.length
                ? "✓ Everything a great listing needs is here."
                : `${checklist.length - doneCount} thing${
                    checklist.length - doneCount === 1 ? "" : "s"
                  } left to make this listing great.`}
            </p>
            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
              <Link
                href={backHref}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
              >
                Cancel
              </Link>
              <SubmitButton
                pendingLabel={isEdit ? "Saving…" : "Publishing…"}
                className="btn-primary !px-6 !py-2.5 text-sm"
              >
                {isEdit ? "Save changes" : "Publish product"}
              </SubmitButton>
            </div>
          </div>
        </div>
      </SafeForm>

      {dangerZone && <div className="mt-8">{dangerZone}</div>}
    </div>
  );
}

function Section({
  id,
  title,
  hint,
  compact = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`card scroll-mt-24 ${compact ? "p-4 sm:p-5" : "p-5 sm:p-6"}`}>
      <h2 className={`font-display font-bold text-ocean-950 ${compact ? "text-sm" : "text-base"}`}>
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Required() {
  return (
    <span className="text-coral-500" aria-hidden>
      *
    </span>
  );
}

function MoneyInput({
  id,
  name,
  required,
  min,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  required?: boolean;
  min: string;
  defaultValue?: number | string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
        $
      </span>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={min}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input !pl-8"
      />
    </div>
  );
}
