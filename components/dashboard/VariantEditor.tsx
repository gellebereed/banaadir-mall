"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import ColorPickerControl from "@/components/dashboard/ColorPickerControl";
import { checkBarcode } from "@/lib/barcode";
import { compressImageFile } from "@/lib/image-compress";
import {
  colorSwatch,
  isUploadPlaceholder,
  uploadPlaceholder,
} from "@/lib/product-utils";
import type { Variant } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  OPTIONS & VARIANTS — colours and sizes, then one row per combination.
 * ─────────────────────────────────────────────────────────────────────────
 * ── Why it starts from option values ─────────────────────────────────────
 * The old editor started from a blank variant card with eight fields. A
 * polo in 4 colours × 5 sizes meant pressing "+ Add variant" twenty times
 * and typing "Navy" and "M" into each card by hand, scrolling through
 * twenty screen-tall cards to find the one with the typo. Sellers gave up
 * and put everything in one stock pool.
 *
 * Now a seller types the colours and the sizes once, as chips, and every
 * combination appears as one compact row: price, stock and SKU inline,
 * barcode and photos one tap away. Adding a colour later adds its rows;
 * removing one removes them. Price and stock can be set for all rows (or
 * the ticked ones) at once.
 *
 * ── Two modes, one component ─────────────────────────────────────────────
 * Without variants the chips post as the product's simple `colors` and
 * `sizes` (one price, one stock pool). "Track separately" turns the same
 * chips into variant rows, so moving between the two never loses typing.
 *
 * ── What the server receives (unchanged) ─────────────────────────────────
 * The variant list as JSON in `variantsJson`, the default in
 * `defaultVariantId`, and each variant's new photos through a file input
 * named `variant-photos-<id>`. Staged photos sit in the variant's `images`
 * as placeholders, so the server slots each upload where the seller put
 * it. The details panel of a collapsed row is hidden with CSS, never
 * unmounted — unmounting would drop its file input and the photos in it.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface VariantSummary {
  count: number;
  totalStock: number;
}

type Dimension = "color" | "size";

const SIZE_PRESETS: { label: string; values: string[] }[] = [
  { label: "XS – XL", values: ["XS", "S", "M", "L", "XL"] },
  { label: "S – XXL", values: ["S", "M", "L", "XL", "XXL"] },
  { label: "Shoes 38 – 44", values: ["38", "39", "40", "41", "42", "43", "44"] },
  { label: "Kids 2 – 12y", values: ["2Y", "4Y", "6Y", "8Y", "10Y", "12Y"] },
];

const norm = (value?: string) => (value ?? "").trim().toLowerCase();

/** Distinct, non-empty values in first-seen order. */
function distinct(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value || seen.has(norm(value))) continue;
    seen.add(norm(value));
    out.push(value);
  }
  return out;
}

function variantLabel(v: Variant): string {
  return [v.color, v.size].filter(Boolean).join(" / ") || "Untitled variant";
}

let idCounter = 0;
function newVariantId(): string {
  return `v${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

export default function VariantEditor({
  initial,
  basePrice,
  initialDefaultId,
  initialColors = [],
  initialSizes = [],
  onSummaryChange,
}: {
  initial: Variant[];
  /** Product price, used when a variant has no price of its own. */
  basePrice: number;
  /** Variant shown first on the product page and used for the card image. */
  initialDefaultId?: string;
  /** The product's simple (non-variant) colour options. */
  initialColors?: string[];
  /** The product's simple (non-variant) size options. */
  initialSizes?: string[];
  /** Lets the surrounding form swap its single stock field for a total. */
  onSummaryChange?: (summary: VariantSummary) => void;
}) {
  const [variants, setVariants] = useState<Variant[]>(initial);
  const [defaultId, setDefaultId] = useState<string | undefined>(
    initialDefaultId ?? initial[0]?.id,
  );
  const [simpleColors, setSimpleColors] = useState<string[]>(initialColors);
  const [simpleSizes, setSimpleSizes] = useState<string[]>(initialSizes);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");

  /*
   * Rows switch layout on the width of their own container (@2xl), not
   * the viewport: beside the editor's side column a 1440px screen leaves
   * the rows ~600px, and a viewport breakpoint squeezed names to "Bla…".
   */

  /*
   * ── Staged photos live IN the variant's image list ───────────────────
   * Each staged file is written into `images` as a placeholder, so it
   * flows through exactly the same ←/★/✕ controls as a saved photo, and
   * the server slots the upload into that position. `pending` holds the
   * File and its local preview, keyed by the placeholder.
   */
  const [pending, setPending] = useState<
    Record<string, { key: string; file: File; previewUrl: string }[]>
  >({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingId = useRef(0);

  const usesVariants = variants.length > 0;
  const colors = usesVariants ? distinct(variants.map((v) => v.color)) : simpleColors;
  const sizes = usesVariants ? distinct(variants.map((v) => v.size)) : simpleSizes;
  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

  useEffect(() => {
    onSummaryChange?.({ count: variants.length, totalStock });
  }, [variants.length, totalStock, onSummaryChange]);

  function update(id: string, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  /** A colour's hex, borrowed from any variant that already has one. */
  function hexFor(color?: string): string | undefined {
    return variants.find((v) => norm(v.color) === norm(color) && v.colorHex)?.colorHex;
  }

  /** Every colour × size combination, as fresh variants. */
  function combinations(colorList: string[], sizeList: string[]): Variant[] {
    const cs = colorList.length ? colorList : [undefined];
    const ss = sizeList.length ? sizeList : [undefined];
    return cs.flatMap((color) =>
      ss.map((size) => ({ id: newVariantId(), color, size, stock: 0 })),
    );
  }

  // ── Mode switching ────────────────────────────────────────────────────

  function startTrackingSeparately() {
    const created = combinations(simpleColors, simpleSizes);
    setVariants(created);
    setDefaultId(created[0].id);
    // A single blank row means the seller has details to fill in — open it.
    if (simpleColors.length === 0 && simpleSizes.length === 0) {
      setExpanded(new Set([created[0].id]));
    }
  }

  function stopTrackingSeparately() {
    const hasWork = variants.some(
      (v) => v.stock > 0 || (v.images?.length ?? 0) > 0 || v.sku || v.barcode,
    );
    if (
      hasWork &&
      !confirm(
        "Remove all variants? Their stock, SKUs, barcodes and photos will be dropped when you save. The colours and sizes are kept as simple options.",
      )
    ) {
      return;
    }
    setSimpleColors(colors);
    setSimpleSizes(sizes);
    Object.values(pending).flat().forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending({});
    fileInputs.current = {};
    setVariants([]);
    setDefaultId(undefined);
    setSelected(new Set());
    setExpanded(new Set());
  }

  // ── Option values (chips) ─────────────────────────────────────────────

  function addValues(dim: Dimension, raw: string[]) {
    const current = dim === "color" ? colors : sizes;
    const values = distinct(raw).filter(
      (value) => !current.some((existing) => norm(existing) === norm(value)),
    );
    if (values.length === 0) return;

    if (!usesVariants) {
      (dim === "color" ? setSimpleColors : setSimpleSizes)([...current, ...values]);
      return;
    }

    setVariants((prev) => {
      const dimEmpty = !prev.some((v) => v[dim]?.trim());
      let next = prev;
      let toCreate = values;
      // The first value of an unused dimension goes onto the existing rows
      // ("Navy" becomes "Navy / S") rather than doubling them.
      if (dimEmpty) {
        next = prev.map((v) => ({ ...v, [dim]: values[0] }));
        toCreate = values.slice(1);
      }
      const other: Dimension = dim === "color" ? "size" : "color";
      const otherValues = distinct(next.map((v) => v[other]));
      const created = toCreate.flatMap((value) =>
        (otherValues.length ? otherValues : [undefined]).map((o) => ({
          id: newVariantId(),
          [dim]: value,
          [other]: o,
          colorHex: dim === "color" ? undefined : hexFor(o),
          stock: 0,
        }) as Variant),
      );
      return [...next, ...created];
    });
  }

  function removeValue(dim: Dimension, value: string) {
    if (!usesVariants) {
      const setter = dim === "color" ? setSimpleColors : setSimpleSizes;
      setter((prev) => prev.filter((v) => norm(v) !== norm(value)));
      return;
    }
    const doomed = variants.filter((v) => norm(v[dim]) === norm(value));
    if (doomed.length === variants.length) {
      // Removing the only colour (or size) clears it from every row instead
      // of deleting the whole product's variants.
      setVariants((prev) => prev.map((v) => ({ ...v, [dim]: undefined })));
      return;
    }
    const hasWork = doomed.some((v) => v.stock > 0 || (v.images?.length ?? 0) > 0);
    if (hasWork && !confirm(`Remove the ${doomed.length} "${value}" variants, with their stock and photos?`)) {
      return;
    }
    removeVariants(doomed.map((v) => v.id));
  }

  /** Combinations of the current colours × sizes that have no row yet. */
  const missing = usesVariants
    ? combinations(colors, sizes).filter(
        (c) => !variants.some((v) => norm(v.color) === norm(c.color) && norm(v.size) === norm(c.size)),
      )
    : [];

  function addMissing() {
    setVariants((prev) => [
      ...prev,
      ...missing.map((m) => ({ ...m, colorHex: hexFor(m.color) })),
    ]);
  }

  // ── Rows ──────────────────────────────────────────────────────────────

  function addVariant() {
    const id = newVariantId();
    setVariants((prev) => [...prev, { id, stock: 0 }]);
    setDefaultId((current) => current ?? id);
    setExpanded((prev) => new Set(prev).add(id));
  }

  function removeVariants(ids: string[]) {
    const doomed = new Set(ids);
    setVariants((prev) => prev.filter((v) => !doomed.has(v.id)));
    setPending((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id]?.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        delete next[id];
      }
      return next;
    });
    ids.forEach((id) => delete fileInputs.current[id]);
    setSelected((prev) => new Set([...prev].filter((id) => !doomed.has(id))));
    setDefaultId((current) =>
      current && doomed.has(current) ? variants.find((v) => !doomed.has(v.id))?.id : current,
    );
  }

  const removeVariant = (id: string) => removeVariants([id]);

  function applyBulk() {
    const targets = selected.size > 0 ? selected : new Set(variants.map((v) => v.id));
    setVariants((prev) =>
      prev.map((v) => {
        if (!targets.has(v.id)) return v;
        const patch: Partial<Variant> = {};
        if (bulkPrice.trim() !== "") patch.price = Number(bulkPrice);
        if (bulkStock.trim() !== "") patch.stock = Math.max(0, Math.floor(Number(bulkStock)));
        return { ...v, ...patch };
      }),
    );
    setBulkPrice("");
    setBulkStock("");
  }

  // ── Photos ────────────────────────────────────────────────────────────

  function moveImage(id: string, index: number, delta: number) {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const images = [...(v.images ?? [])];
        const target = index + delta;
        if (target < 0 || target >= images.length) return v;
        [images[index], images[target]] = [images[target], images[index]];
        return { ...v, images };
      }),
    );
  }

  function makeImageMain(id: string, index: number) {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const images = [...(v.images ?? [])];
        const [picked] = images.splice(index, 1);
        return { ...v, images: [picked, ...images] };
      }),
    );
  }

  /** Drop a photo — saved, or staged and not yet uploaded. */
  function removeImage(id: string, entry: string) {
    update(id, {
      images: (variants.find((v) => v.id === id)?.images ?? []).filter((i) => i !== entry),
    });

    if (!isUploadPlaceholder(entry)) return;
    // A staged file also has to leave the pending set and the FileList,
    // or the photo you just deleted uploads anyway.
    setPending((prev) => {
      const staged = prev[id] ?? [];
      const dropped = staged.find((p) => p.key === entry);
      if (dropped) URL.revokeObjectURL(dropped.previewUrl);
      return { ...prev, [id]: staged.filter((p) => p.key !== entry) };
    });
  }

  async function handleFiles(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (rawFiles.length === 0) return;

    const compressedFiles = await Promise.all(rawFiles.map((f) => compressImageFile(f)));
    fileInputs.current[id] = e.target;

    const added = compressedFiles.map((file) => ({
      key: uploadPlaceholder(`v${++pendingId.current}`),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    // Picking again ADDS to what is already staged, rather than silently
    // discarding the previous selection.
    setPending((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ...added] }));
    setVariants((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, images: [...(v.images ?? []), ...added.map((a) => a.key)] } : v,
      ),
    );
  }

  /** The staged file behind a placeholder, if this entry is one. */
  function pendingFor(variantId: string, entry: string) {
    return isUploadPlaceholder(entry)
      ? pending[variantId]?.find((p) => p.key === entry)
      : undefined;
  }

  /** What to draw for an image entry: a local preview or the saved URL. */
  function srcFor(variantId: string, entry: string): { src: string; local: boolean } {
    const staged = pendingFor(variantId, entry);
    return staged ? { src: staged.previewUrl, local: true } : { src: entry, local: false };
  }

  /**
   * Keep every variant's file input in the order its placeholders appear.
   *
   * The server pairs the Nth posted file with the Nth placeholder, so a
   * reorder on screen has to be mirrored in the FileList or the photos
   * swap places on save. This runs after any change to the lists.
   */
  useEffect(() => {
    for (const variant of variants) {
      const input = fileInputs.current[variant.id];
      if (!input) continue;
      const staged = pending[variant.id] ?? [];
      const ordered = (variant.images ?? [])
        .map((entry) => staged.find((p) => p.key === entry)?.file)
        .filter((file): file is File => !!file);
      try {
        const dt = new DataTransfer();
        ordered.forEach((file) => dt.items.add(file));
        input.files = dt.files;
      } catch {
        // Fallback for browsers restricting file input updates
      }
    }
  }, [variants, pending]);

  /**
   * A barcode identifies exactly one item, so two variants sharing one is
   * always a mistake — usually a copy-paste while filling the rows in. Flag
   * it here; the server and the database both reject it as well.
   */
  const duplicateBarcodes = new Set(
    variants
      .map((v) => checkBarcode(v.barcode).value)
      .filter(Boolean)
      .filter((code, i, all) => all.indexOf(code) !== i),
  );

  const allSelected = usesVariants && selected.size === variants.length;
  const prices = variants.map((v) => v.price ?? basePrice);

  return (
    <div className="space-y-5">
      <input type="hidden" name="variantsJson" value={JSON.stringify(variants)} />
      <input type="hidden" name="defaultVariantId" value={defaultId ?? ""} />
      {!usesVariants && (
        <>
          <input type="hidden" name="colors" value={simpleColors.join(", ")} />
          <input type="hidden" name="sizes" value={simpleSizes.join(", ")} />
        </>
      )}

      {/* ── Option values ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChipField
          label="Colours"
          placeholder={colors.length ? "Add another colour" : "e.g. Black, Navy"}
          values={colors}
          swatchFor={(value) => colorSwatch(value, hexFor(value))}
          onAdd={(values) => addValues("color", values)}
          onRemove={(value) => removeValue("color", value)}
        />
        <ChipField
          label="Sizes"
          placeholder={sizes.length ? "Add another size" : "e.g. S, M, L"}
          values={sizes}
          onAdd={(values) => addValues("size", values)}
          onRemove={(value) => removeValue("size", value)}
          presets={sizes.length === 0 ? SIZE_PRESETS : undefined}
        />
      </div>

      {!usesVariants ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-ocean-100 bg-ocean-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-bold text-ocean-950">
              {colors.length || sizes.length
                ? "All options share one price and one stock count."
                : "No options — this product is sold as a single item."}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Need separate stock, prices, barcodes or photos per colour or size?
            </p>
          </div>
          <button
            type="button"
            onClick={startTrackingSeparately}
            className="shrink-0 rounded-full bg-ocean-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-ocean-700"
          >
            {colors.length || sizes.length
              ? `Track ${Math.max(1, colors.length || 1) * Math.max(1, sizes.length || 1)} variants separately`
              : "+ Add variants"}
          </button>
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mango-50 px-4 py-2.5 text-xs text-mango-800">
              <span>
                <strong>{missing.length}</strong> colour/size combination
                {missing.length === 1 ? " has" : "s have"} no variant yet.
              </span>
              <button type="button" onClick={addMissing} className="font-bold underline">
                Add {missing.length === 1 ? "it" : "them"}
              </button>
            </div>
          )}

          {/* ── Bulk edit ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-sand-50 p-3">
            <p className="w-full text-xs font-bold text-slate-600 sm:w-auto sm:self-center sm:pr-2">
              Set for {selected.size > 0 ? `${selected.size} selected` : "all variants"}:
            </p>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              placeholder="Price"
              aria-label="Price for selected variants"
              className="input !w-28 !py-2 text-sm"
            />
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value)}
              placeholder="Stock"
              aria-label="Stock for selected variants"
              className="input !w-24 !py-2 text-sm"
            />
            <button
              type="button"
              onClick={applyBulk}
              disabled={bulkPrice === "" && bulkStock === ""}
              className="rounded-xl bg-ocean-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-ocean-700 disabled:opacity-40"
            >
              Apply
            </button>
          </div>

          {/* ── Rows ──────────────────────────────────────────────── */}
          <div className="@container overflow-hidden rounded-2xl border border-sand-200">
            <div className="hidden grid-cols-[28px_minmax(0,1fr)_104px_84px_minmax(0,140px)_76px] items-center gap-3 border-b border-sand-200 bg-sand-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 @2xl:grid">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(variants.map((v) => v.id)))
                }
                aria-label="Select all variants"
                className="h-4 w-4 cursor-pointer accent-ocean-700"
              />
              <span>Variant</span>
              <span>Price</span>
              <span>Stock</span>
              <span>SKU</span>
              <span className="sr-only">Actions</span>
            </div>

            <ul className="divide-y divide-sand-100">
              {variants.map((v) => {
                const isDefault = v.id === defaultId;
                const isOpen = expanded.has(v.id);
                const cover = v.images?.[0];
                const coverSrc = cover ? srcFor(v.id, cover) : null;
                const barcodeCheck = checkBarcode(v.barcode);
                const isDuplicate =
                  Boolean(barcodeCheck.value) && duplicateBarcodes.has(barcodeCheck.value);
                const isBad = Boolean(v.barcode) && (!barcodeCheck.valid || isDuplicate);
                const stagedCount = pending[v.id]?.length ?? 0;

                return (
                  <li key={v.id} className={selected.has(v.id) ? "bg-ocean-50/50" : "bg-white"}>
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 @2xl:grid-cols-[28px_minmax(0,1fr)_104px_84px_minmax(0,140px)_76px]">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => setSelected((prev) => toggle(prev, v.id))}
                        aria-label={`Select ${variantLabel(v)}`}
                        className="h-4 w-4 cursor-pointer accent-ocean-700"
                      />

                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => toggle(prev, v.id))}
                        className="flex min-w-0 items-center gap-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <span
                          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sand-200"
                          style={coverSrc ? undefined : { background: colorSwatch(v.color, v.colorHex) }}
                        >
                          {coverSrc &&
                            (coverSrc.local ? (
                              // Local blob preview — next/image cannot optimise it.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={coverSrc.src} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Image src={coverSrc.src} alt="" fill sizes="40px" className="object-cover" />
                            ))}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`truncate text-sm font-semibold ${
                                v.color || v.size ? "text-slate-900" : "italic text-slate-400"
                              }`}
                            >
                              {variantLabel(v)}
                            </span>
                            {isDefault && (
                              <span className="shrink-0 rounded-full bg-ocean-100 px-1.5 py-0.5 text-[10px] font-bold text-ocean-800">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {[
                              `${v.images?.length ?? 0} photo${v.images?.length === 1 ? "" : "s"}`,
                              v.barcode ? "barcode ✓" : null,
                              isBad ? "⚠ check barcode" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            <span className="ml-1 font-semibold text-ocean-700">
                              {isOpen ? "Hide details ▴" : "Details ▾"}
                            </span>
                          </span>
                        </span>
                      </button>

                      {/* Mobile: actions sit beside the name, inputs wrap below. */}
                      <RowActions
                        className="flex @2xl:hidden"
                        isDefault={isDefault}
                        onDefault={() => setDefaultId(v.id)}
                        onRemove={() => removeVariant(v.id)}
                      />

                      <div className="col-span-3 grid grid-cols-3 gap-2 @2xl:contents">
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400 @2xl:hidden">
                            Price
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={v.price ?? ""}
                            onChange={(e) =>
                              update(v.id, {
                                price: e.target.value === "" ? undefined : Number(e.target.value),
                              })
                            }
                            placeholder={basePrice ? String(basePrice) : "Base"}
                            aria-label={`Price for ${variantLabel(v)}`}
                            className="input !px-3 !py-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400 @2xl:hidden">
                            Stock
                          </span>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={v.stock}
                            onChange={(e) => update(v.id, { stock: Number(e.target.value) })}
                            aria-label={`Stock for ${variantLabel(v)}`}
                            className={`input !px-3 !py-2 text-sm ${
                              Number(v.stock) === 0 ? "!text-coral-600" : ""
                            }`}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400 @2xl:hidden">
                            SKU
                          </span>
                          <input
                            value={v.sku ?? ""}
                            onChange={(e) => update(v.id, { sku: e.target.value })}
                            placeholder={
                              [v.color, v.size].filter(Boolean).join("-").toUpperCase() || "REF-001"
                            }
                            spellCheck={false}
                            aria-label={`SKU for ${variantLabel(v)}`}
                            className="input !px-3 !py-2 font-mono text-xs uppercase"
                          />
                        </label>
                      </div>

                      <RowActions
                        className="hidden @2xl:flex"
                        isDefault={isDefault}
                        onDefault={() => setDefaultId(v.id)}
                        onRemove={() => removeVariant(v.id)}
                      />
                    </div>

                    {/* ── Details: hidden, never unmounted (file input!) ── */}
                    <div className={isOpen ? "border-t border-sand-100 bg-sand-50/60 px-3 py-4 @2xl:pl-[52px]" : "hidden"}>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block min-w-0">
                          <span className="mb-1 block text-xs font-semibold text-slate-500">Colour</span>
                          <span className="flex items-center gap-2">
                            <ColorPickerControl
                              colorName={v.color}
                              colorHex={v.colorHex}
                              onChangeHex={(hex) => update(v.id, { colorHex: hex })}
                            />
                            <input
                              value={v.color ?? ""}
                              onChange={(e) => update(v.id, { color: e.target.value })}
                              placeholder="e.g. Navy Blue"
                              className="input !py-2 min-w-0 flex-1 text-sm"
                            />
                          </span>
                        </label>
                        <label className="block min-w-0">
                          <span className="mb-1 block text-xs font-semibold text-slate-500">Size</span>
                          <input
                            value={v.size ?? ""}
                            onChange={(e) => update(v.id, { size: e.target.value })}
                            placeholder="e.g. M"
                            className="input !py-2 text-sm"
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="mb-1 block text-xs font-semibold text-slate-500">
                            Barcode (EAN / UPC)
                          </span>
                          <input
                            value={v.barcode ?? ""}
                            onChange={(e) => update(v.id, { barcode: e.target.value })}
                            placeholder="Scan or type"
                            spellCheck={false}
                            className={`input !py-2 font-mono text-sm ${isBad ? "!border-coral-500" : ""}`}
                          />
                          {isDuplicate ? (
                            <span className="mt-1 block text-xs font-semibold text-coral-600">
                              This barcode is on another variant — each one needs its own.
                            </span>
                          ) : v.barcode && !barcodeCheck.valid ? (
                            <span className="mt-1 block text-xs font-semibold text-coral-600">
                              {barcodeCheck.error}
                            </span>
                          ) : v.barcode && barcodeCheck.symbology && barcodeCheck.symbology !== "INTERNAL" ? (
                            <span className="mt-1 block text-xs font-semibold text-emerald-600">
                              ✓ {barcodeCheck.symbology}
                            </span>
                          ) : (
                            <span className="mt-1 block text-xs text-slate-400">
                              Empty = uses the product&apos;s barcode.
                            </span>
                          )}
                        </label>
                      </div>

                      <div className="mt-4">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Photos for this option{" "}
                          <span className="font-normal text-slate-400">
                            — shown when a customer picks it; the first is the main one
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-2.5">
                          {(v.images ?? []).map((entry, i) => {
                            const { src, local } = srcFor(v.id, entry);
                            return (
                              <div
                                key={entry}
                                className={`group relative h-20 w-20 overflow-hidden rounded-xl border-2 ${
                                  local
                                    ? "border-dashed border-emerald-400"
                                    : i === 0
                                      ? "border-ocean-500"
                                      : "border-sand-200"
                                }`}
                              >
                                {local ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={src} alt="New photo preview" className="h-full w-full object-cover" />
                                ) : (
                                  <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                                )}
                                {i === 0 && (
                                  <span className="absolute left-0.5 top-0.5 rounded bg-ocean-800/90 px-1 py-0.5 text-[8px] font-bold text-white">
                                    Main
                                  </span>
                                )}
                                {local && (
                                  <span className="absolute bottom-5 left-0.5 rounded bg-emerald-600/90 px-1 py-0.5 text-[8px] font-bold text-white">
                                    New
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeImage(v.id, entry)}
                                  aria-label="Remove variant photo"
                                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white hover:bg-coral-500"
                                >
                                  ✕
                                </button>
                                <div className="absolute inset-x-0 bottom-0 flex bg-black/60 text-[10px] font-bold text-white opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => moveImage(v.id, i, -1)}
                                    disabled={i === 0}
                                    aria-label="Move left"
                                    className="flex-1 py-0.5 hover:bg-white/20 disabled:opacity-30"
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => makeImageMain(v.id, i)}
                                    disabled={i === 0}
                                    aria-label="Make main"
                                    className="flex-1 py-0.5 hover:bg-white/20 disabled:opacity-30"
                                  >
                                    ★
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveImage(v.id, i, 1)}
                                    disabled={i === (v.images?.length ?? 0) - 1}
                                    aria-label="Move right"
                                    className="flex-1 py-0.5 hover:bg-white/20 disabled:opacity-30"
                                  >
                                    →
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-sand-200 bg-white text-[11px] font-semibold text-slate-500 transition hover:border-ocean-400 hover:text-ocean-700">
                            <span className="text-lg">📸</span>
                            Add
                            <input
                              type="file"
                              name={`variant-photos-${v.id}`}
                              accept="image/*"
                              multiple
                              onChange={(e) => handleFiles(v.id, e)}
                              className="sr-only"
                            />
                          </label>
                        </div>
                        {stagedCount > 0 && (
                          <p className="mt-2 text-xs font-semibold text-emerald-600">
                            ✓ {stagedCount} new photo{stagedCount === 1 ? "" : "s"} optimised — they
                            upload when you save.
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addVariant} className="rounded-full border border-sand-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-ocean-400 hover:text-ocean-800">
                + Add a single variant
              </button>
              <button type="button" onClick={stopTrackingSeparately} className="rounded-full px-3 py-2 text-xs font-semibold text-slate-400 transition hover:text-coral-600">
                Remove all variants
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {variants.length} variant{variants.length === 1 ? "" : "s"} ·{" "}
              {totalStock.toLocaleString()} in stock ·{" "}
              {Math.min(...prices) === Math.max(...prices)
                ? money(prices[0])
                : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({
  className,
  isDefault,
  onDefault,
  onRemove,
}: {
  className: string;
  isDefault: boolean;
  onDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`${className} items-center justify-end gap-1`}>
      <button
        type="button"
        onClick={onDefault}
        title={isDefault ? "Default variant — shown first" : "Make this the default variant"}
        aria-label="Make default variant"
        aria-pressed={isDefault}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-base transition ${
          isDefault ? "text-mango-500" : "text-slate-300 hover:bg-sand-100 hover:text-mango-500"
        }`}
      >
        {isDefault ? "★" : "☆"}
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove this variant"
        aria-label="Remove variant"
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-slate-400 transition hover:bg-coral-100 hover:text-coral-600"
      >
        🗑
      </button>
    </div>
  );
}

/**
 * Type a value and press Enter or comma — or paste "S, M, L" — and each
 * becomes a chip. Deliberately no backspace-to-delete: with variants on, a
 * chip is a whole set of rows, and a stray backspace must not drop them.
 */
function ChipField({
  label,
  placeholder,
  values,
  onAdd,
  onRemove,
  swatchFor,
  presets,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (values: string[]) => void;
  onRemove: (value: string) => void;
  swatchFor?: (value: string) => string;
  presets?: { label: string; values: string[] }[];
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length) onAdd(parts);
    setDraft("");
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-sand-200 bg-white px-2 py-1.5 transition focus-within:border-ocean-500 focus-within:ring-2 focus-within:ring-ocean-200">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full bg-sand-100 py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-700"
          >
            {swatchFor && (
              <span
                className="h-3 w-3 rounded-full ring-1 ring-black/10"
                style={{ background: swatchFor(value) }}
              />
            )}
            {value}
            <button
              type="button"
              onClick={() => onRemove(value)}
              aria-label={`Remove ${value}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-slate-400 hover:bg-coral-500 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const text = e.target.value;
            if (/[,\n]/.test(text)) commit(text);
            else setDraft(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Enter must add a chip, never submit the whole product form.
              e.preventDefault();
              commit(draft);
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {presets && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onAdd(preset.values)}
              className="rounded-full border border-dashed border-sand-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:border-ocean-400 hover:text-ocean-700"
            >
              + {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
