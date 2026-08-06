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
 * Per-variant stock, price and photos.
 *
 * The variant list (including photo order) is submitted as JSON in a hidden
 * field. New photos for a variant upload through a file input named
 * `variant-photos-<id>`, which the server action matches back up by id.
 * Newly picked files preview immediately so nothing requires a save+refresh
 * to be seen.
 */
export default function VariantEditor({
  initial,
  basePrice,
  initialDefaultId,
}: {
  initial: Variant[];
  /** Product price, used when a variant has no price of its own. */
  basePrice: number;
  /** Variant shown first on the product page and used for the card image. */
  initialDefaultId?: string;
}) {
  const [variants, setVariants] = useState<Variant[]>(initial);
  const [defaultId, setDefaultId] = useState<string | undefined>(
    initialDefaultId ?? initial[0]?.id,
  );
  /*
   * ── Staged photos live IN the variant's image list ───────────────────
   * They used to sit in a separate strip after the saved ones, which meant
   * a photo you had just picked could not be moved, could not be made the
   * variant's main image, and always uploaded to the end of the list
   * whatever you did. The only way to set a new photo as the swatch image
   * was save, wait, reload, drag.
   *
   * Now each staged file is written into `images` as a placeholder, so it
   * flows through exactly the same ←/★/✕ controls as a saved photo, and
   * the server slots the upload into that position. `pending` holds the
   * File and its local preview, keyed by the placeholder.
   */
  const [pending, setPending] = useState<
    Record<string, { key: string; file: File; previewUrl: string }[]>
  >({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingId = useRef(0);

  function update(id: string, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    const id = `v${Date.now().toString(36)}${variants.length}`;
    setVariants((prev) => [...prev, { id, color: "", size: "", stock: 0 }]);
    setDefaultId((current) => current ?? id);
  }

  function removeVariant(id: string) {
    setVariants((prev) => prev.filter((v) => v.id !== id));
    setPending((prev) => {
      prev[id]?.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    delete fileInputs.current[id];
    setDefaultId((current) =>
      current === id ? variants.find((v) => v.id !== id)?.id : current,
    );
  }

  /** Reorder or remove a photo already saved on the variant. */
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
    update(id, {
      images: [...(variants.find((v) => v.id === id)?.images ?? []), ...added.map((a) => a.key)],
    });
  }

  /** The staged file behind a placeholder, if this entry is one. */
  function pendingFor(variantId: string, entry: string) {
    return isUploadPlaceholder(entry)
      ? pending[variantId]?.find((p) => p.key === entry)
      : undefined;
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

  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

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

  return (
    <div>
      <input type="hidden" name="variantsJson" value={JSON.stringify(variants)} />
      <input type="hidden" name="defaultVariantId" value={defaultId ?? ""} />

      {variants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand-200 bg-sand-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            This product has no variants — it uses the single price and stock
            above.
          </p>
          <button type="button" onClick={addVariant} className="btn-secondary mt-3 !py-2 text-sm">
            + Add variants
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Use variants when a colour or size needs its own stock, price or
            photos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {variants.map((v) => {
            const isDefault = v.id === defaultId;
            return (
              <div
                key={v.id}
                className={`rounded-2xl border-2 bg-white p-4 transition ${
                  isDefault ? "border-ocean-600" : "border-sand-200"
                }`}
              >
                {/* Default selector */}
                <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-bold">
                  <input
                    type="radio"
                    name="defaultVariantPicker"
                    checked={isDefault}
                    onChange={() => setDefaultId(v.id)}
                    className="h-4 w-4 accent-ocean-700"
                  />
                  <span className={isDefault ? "text-ocean-800" : "text-slate-400"}>
                    {isDefault
                      ? "★ Default — shown first and used as the catalogue image"
                      : "Make this the default variant"}
                  </span>
                </label>

                {/*
                  The colour column is the widest on the row.

                  It holds three controls to Size's one, and the colour name
                  is what the customer sees on the product page — so it gets
                  the room. Sizes are "S", "42"; they never needed an equal
                  share.
                */}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_auto]">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Colour</span>
                    <div className="flex items-center gap-2">
                      <ColorPickerControl
                        colorName={v.color}
                        colorHex={v.colorHex}
                        onChangeHex={(hex) => update(v.id, { colorHex: hex })}
                      />
                      {/* min-w-0 so the input can actually shrink-to-fit
                          inside the flex row instead of being squeezed to
                          its content width by the controls beside it. */}
                      <input
                        value={v.color ?? ""}
                        onChange={(e) => update(v.id, { color: e.target.value })}
                        placeholder="e.g. Navy Blue"
                        className="input !py-2 min-w-0 flex-1 text-sm"
                      />
                    </div>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Size</span>
                    <input
                      value={v.size ?? ""}
                      onChange={(e) => update(v.id, { size: e.target.value })}
                      placeholder="e.g. M"
                      className="input !py-2 w-full text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Price</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={v.price ?? ""}
                      onChange={(e) =>
                        update(v.id, {
                          price: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder={String(basePrice)}
                      className="input !py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Stock</span>
                    <input
                      type="number"
                      min="0"
                      value={v.stock}
                      onChange={(e) => update(v.id, { stock: Number(e.target.value) })}
                      className="input !py-2 text-sm"
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeVariant(v.id)}
                      className="rounded-full border border-coral-500 px-3 py-2 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/*
                  Odoo identity for THIS colour/size. In Odoo these live on
                  product.product, and it is the variant's barcode — not the
                  product's — that a scanner at the counter resolves to.
                */}
                <div className="mt-3 grid gap-3 border-t border-sand-100 pt-3 sm:grid-cols-2">
                  {(() => {
                    const barcodeCheck = checkBarcode(v.barcode);
                    const isDuplicate =
                      Boolean(barcodeCheck.value) && duplicateBarcodes.has(barcodeCheck.value);
                    const isBad = Boolean(v.barcode) && (!barcodeCheck.valid || isDuplicate);
                    return (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-slate-500">
                            SKU / internal reference
                          </span>
                          <input
                            value={v.sku ?? ""}
                            onChange={(e) => update(v.id, { sku: e.target.value })}
                            placeholder={`e.g. ${
                              [v.color, v.size].filter(Boolean).join("-").toUpperCase() ||
                              "REF-001"
                            }`}
                            spellCheck={false}
                            className="input !py-2 font-mono text-sm uppercase"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-slate-500">
                            Barcode (EAN / UPC)
                          </span>
                          <input
                            value={v.barcode ?? ""}
                            onChange={(e) => update(v.id, { barcode: e.target.value })}
                            placeholder="Scan or type"
                            spellCheck={false}
                            className={`input !py-2 font-mono text-sm ${
                              isBad ? "!border-coral-500" : ""
                            }`}
                          />
                          {isDuplicate ? (
                            <span className="mt-1 block text-xs font-semibold text-coral-600">
                              This barcode is on another variant — each one needs its own.
                            </span>
                          ) : v.barcode && !barcodeCheck.valid ? (
                            <span className="mt-1 block text-xs font-semibold text-coral-600">
                              {barcodeCheck.error}
                            </span>
                          ) : v.barcode && barcodeCheck.symbology &&
                            barcodeCheck.symbology !== "INTERNAL" ? (
                            <span className="mt-1 block text-xs font-semibold text-emerald-600">
                              ✓ {barcodeCheck.symbology}
                            </span>
                          ) : (
                            <span className="mt-1 block text-xs text-slate-400">
                              Leave empty to fall back to the product&apos;s barcode.
                            </span>
                          )}
                        </label>
                      </>
                    );
                  })()}
                </div>

                {/* Variant photos — saved and staged, one reorderable list. */}
                <div className="mt-3 border-t border-sand-100 pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {(v.images ?? []).map((src, i) => {
                      const staged = pendingFor(v.id, src);
                      return (
                      <div
                        key={src}
                        className={`group relative h-20 w-20 overflow-hidden rounded-lg border-2 ${
                          staged
                            ? "border-dashed border-emerald-400"
                            : i === 0
                              ? "border-ocean-500"
                              : "border-sand-200"
                        }`}
                      >
                        {staged ? (
                          // Local blob preview — next/image cannot optimise it.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={staged.previewUrl}
                            alt="New photo preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                        )}
                        {i === 0 && (
                          <span className="absolute left-0.5 top-0.5 rounded bg-ocean-800/90 px-1 py-0.5 text-[8px] font-bold text-white">
                            Main
                          </span>
                        )}
                        {staged && (
                          <span className="absolute bottom-5 left-0.5 rounded bg-emerald-600/90 px-1 py-0.5 text-[8px] font-bold text-white">
                            New
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(v.id, src)}
                          aria-label="Remove variant photo"
                          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white hover:bg-coral-500"
                        >
                          ✕
                        </button>
                        <div className="absolute inset-x-0 bottom-0 flex bg-black/60 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
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

                    <label className="cursor-pointer rounded-full border border-sand-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ocean-400 hover:text-ocean-700">
                      📸 Add photos
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

                  {(pending[v.id]?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs font-semibold text-emerald-600">
                      ✓ {pending[v.id].length} new photo
                      {pending[v.id].length === 1 ? "" : "s"} ready and optimised
                      — reorder or remove {pending[v.id].length === 1 ? "it" : "them"}{" "}
                      above, then save to upload.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Shown when a customer selects this option. Hover a photo to
                    reorder (← →), make it this option&apos;s main image (★) or
                    remove it (✕) — new photos included.
                  </p>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={addVariant} className="btn-secondary !py-2 text-sm">
              + Add variant
            </button>
            <p className="text-xs font-semibold text-slate-500">
              {variants.length} variants · {totalStock} units in stock · from{" "}
              {money(Math.min(...variants.map((v) => v.price ?? basePrice)))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
