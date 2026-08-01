"use client";

import Image from "next/image";
import { useState } from "react";
import { money } from "@/lib/format";
import { compressImageFile } from "@/lib/image-compress";
import { colorSwatch } from "@/lib/product-utils";
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
  /** Local object URLs for files picked but not yet uploaded, per variant. */
  const [previews, setPreviews] = useState<Record<string, string[]>>({});

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
    setPreviews((prev) => {
      prev[id]?.forEach(URL.revokeObjectURL);
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
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

  function removeImage(id: string, url: string) {
    update(id, {
      images: (variants.find((v) => v.id === id)?.images ?? []).filter((i) => i !== url),
    });
  }

  async function handleFiles(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (rawFiles.length === 0) return;

    const compressedFiles = await Promise.all(rawFiles.map((f) => compressImageFile(f)));

    try {
      const dt = new DataTransfer();
      compressedFiles.forEach((f) => dt.items.add(f));
      e.target.files = dt.files;
    } catch {
      // Fallback for browsers restricting file input updates
    }

    setPreviews((prev) => {
      prev[id]?.forEach(URL.revokeObjectURL);
      return { ...prev, [id]: compressedFiles.map((f) => URL.createObjectURL(f)) };
    });
  }

  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

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

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px_100px_auto]">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Colour</span>
                    <div className="flex items-center gap-2">
                      {v.color && colorSwatch(v.color) && (
                        <span
                          className="h-5 w-5 shrink-0 rounded-full border border-sand-200"
                          style={{ background: colorSwatch(v.color) }}
                        />
                      )}
                      <input
                        value={v.color ?? ""}
                        onChange={(e) => update(v.id, { color: e.target.value })}
                        placeholder="e.g. Black"
                        className="input !py-2 text-sm"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Size</span>
                    <input
                      value={v.size ?? ""}
                      onChange={(e) => update(v.id, { size: e.target.value })}
                      placeholder="e.g. M"
                      className="input !py-2 text-sm"
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

                {/* Variant photos: saved ones (reorderable) + new previews */}
                <div className="mt-3 border-t border-sand-100 pt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {(v.images ?? []).map((src, i) => (
                      <div
                        key={src}
                        className={`group relative h-20 w-20 overflow-hidden rounded-lg border-2 ${
                          i === 0 ? "border-ocean-500" : "border-sand-200"
                        }`}
                      >
                        <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                        {i === 0 && (
                          <span className="absolute left-0.5 top-0.5 rounded bg-ocean-800/90 px-1 py-0.5 text-[8px] font-bold text-white">
                            Main
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
                    ))}

                    {/* Instant previews of files picked but not yet saved */}
                    {(previews[v.id] ?? []).map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={src}
                        src={src}
                        alt="New photo preview"
                        className="h-20 w-20 rounded-lg border-2 border-dashed border-emerald-400 object-cover"
                      />
                    ))}

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

                  {(previews[v.id]?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs font-semibold text-emerald-600">
                      ✓ {previews[v.id].length} new photo
                      {previews[v.id].length === 1 ? "" : "s"} ready — save to upload.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Shown when a customer selects this option. Hover a photo to
                    reorder or remove it.
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
