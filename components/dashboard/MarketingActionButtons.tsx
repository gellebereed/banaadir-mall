"use client";

import { useState, useTransition } from "react";
import {
  deleteBanner,
  deletePromoTile,
  moveBanner,
  saveBanner,
  savePromoTile,
  toggleBanner,
  togglePromoTile,
} from "@/app/actions";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import SubmitButton from "@/components/dashboard/SubmitButton";
import type { Banner, PromoTile } from "@/lib/types";

export function BannerToggleBtn({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await toggleBanner(id);
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
        active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-sand-100 text-slate-500 hover:bg-sand-200"
      }`}
    >
      {isPending ? "⏳..." : active ? "● Live" : "🙈 Paused"}
    </button>
  );
}

export function BannerDeleteBtn({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Are you sure you want to delete this banner?")) return;
        startTransition(async () => {
          await deleteBanner(id);
        });
      }}
      className="rounded-full border border-coral-500 px-3 py-1 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function BannerMoveBtn({
  id,
  delta,
  disabled,
}: {
  id: string;
  delta: number;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          await moveBanner(id, delta);
        });
      }}
      aria-label={delta < 0 ? "Move up" : "Move down"}
      className="px-2 text-slate-400 hover:text-ocean-700 disabled:opacity-25 transition"
    >
      {isPending ? "…" : delta < 0 ? "▲" : "▼"}
    </button>
  );
}

export function BannerEditBtn({ banner }: { banner: Banner }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-ocean-100 px-3 py-1 text-xs font-bold text-ocean-800 transition hover:bg-ocean-200"
      >
        ✏️ Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/60 p-4 backdrop-blur-sm animate-fade-up">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <h3 className="font-display font-bold text-ocean-950">Edit Banner</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-xs font-bold text-slate-400 hover:bg-sand-100 hover:text-slate-700"
              >
                ✕ Close
              </button>
            </div>

            <form
              action={async (formData) => {
                await saveBanner(formData);
                setOpen(false);
              }}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="id" value={banner.id} />

              <div className="sm:col-span-2">
                <span className="label">Banner Artwork</span>
                {banner.image && (
                  <div className="mb-2 text-xs text-slate-500">
                    Current artwork loaded. Upload new file below to replace it.
                  </div>
                )}
                <PhotoPicker name="image" multiple={false} label="Change banner image" hint="Wide images work best (1600 × 500)" />
              </div>

              <div>
                <label htmlFor={`edit-b-title-${banner.id}`} className="label">
                  Headline <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id={`edit-b-title-${banner.id}`}
                  name="title"
                  defaultValue={banner.title ?? ""}
                  placeholder="Eid Mega Sale"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor={`edit-b-subtitle-${banner.id}`} className="label">Subtitle</label>
                <input
                  id={`edit-b-subtitle-${banner.id}`}
                  name="subtitle"
                  defaultValue={banner.subtitle ?? ""}
                  placeholder="Up to 60% off"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor={`edit-b-cta-${banner.id}`} className="label">Button text</label>
                <input
                  id={`edit-b-cta-${banner.id}`}
                  name="cta"
                  defaultValue={banner.cta ?? ""}
                  placeholder="Shop now"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor={`edit-b-link-${banner.id}`} className="label">Links to</label>
                <input
                  id={`edit-b-link-${banner.id}`}
                  name="link"
                  defaultValue={banner.link}
                  placeholder="/products"
                  className="input"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`edit-b-fit-${banner.id}`} className="label">Image display</label>
                <select
                  id={`edit-b-fit-${banner.id}`}
                  name="fit"
                  className="input"
                  defaultValue={banner.fit ?? "cover"}
                >
                  <option value="cover">Fill the frame — crops edges (best for photos)</option>
                  <option value="contain">Show the whole image — never cropped (best for ready-made banners)</option>
                </select>
              </div>

              <div>
                <label htmlFor={`edit-b-from-${banner.id}`} className="label">Gradient start</label>
                <input
                  id={`edit-b-from-${banner.id}`}
                  name="from"
                  type="color"
                  defaultValue={banner.from ?? "#1f6270"}
                  className="input h-11 !py-1"
                />
              </div>

              <div>
                <label htmlFor={`edit-b-to-${banner.id}`} className="label">Gradient end</label>
                <input
                  id={`edit-b-to-${banner.id}`}
                  name="to"
                  type="color"
                  defaultValue={banner.to ?? "#fb8a0e"}
                  className="input h-11 !py-1"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary !py-2 text-xs"
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Saving changes…">Save Banner</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function TileToggleBtn({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await togglePromoTile(id);
        });
      }}
      className={`w-full rounded-full py-1 text-[11px] font-bold transition disabled:opacity-50 ${
        active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-sand-100 text-slate-500 hover:bg-sand-200"
      }`}
    >
      {isPending ? "⏳..." : active ? "● Live" : "🙈 Paused"}
    </button>
  );
}

export function TileDeleteBtn({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Are you sure you want to delete this campaign tile?")) return;
        startTransition(async () => {
          await deletePromoTile(id);
        });
      }}
      className="rounded-full border border-coral-500 px-3 py-1 text-[11px] font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white disabled:opacity-50"
    >
      {isPending ? "…" : "✕"}
    </button>
  );
}

export function TileEditBtn({ tile }: { tile: PromoTile }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-ocean-100 px-2.5 py-1 text-[11px] font-bold text-ocean-800 transition hover:bg-ocean-200"
      >
        ✏️ Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/60 p-4 backdrop-blur-sm animate-fade-up">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <h3 className="font-display font-bold text-ocean-950">Edit Campaign Tile</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-xs font-bold text-slate-400 hover:bg-sand-100 hover:text-slate-700"
              >
                ✕ Close
              </button>
            </div>

            <form
              action={async (formData) => {
                await savePromoTile(formData);
                setOpen(false);
              }}
              className="mt-4 grid gap-4"
            >
              <input type="hidden" name="id" value={tile.id} />

              <div>
                <label htmlFor={`edit-t-label-${tile.id}`} className="label">Main Title / Label</label>
                <input
                  id={`edit-t-label-${tile.id}`}
                  name="label"
                  required
                  defaultValue={tile.label}
                  placeholder="50% OFF"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor={`edit-t-sublabel-${tile.id}`} className="label">Sublabel</label>
                <input
                  id={`edit-t-sublabel-${tile.id}`}
                  name="sublabel"
                  defaultValue={tile.sublabel}
                  placeholder="On selected electronics"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor={`edit-t-link-${tile.id}`} className="label">Links to</label>
                <input
                  id={`edit-t-link-${tile.id}`}
                  name="link"
                  defaultValue={tile.link}
                  placeholder="/products"
                  className="input"
                />
              </div>

              <div>
                <span className="label">Tile Background Image</span>
                <PhotoPicker name="image" multiple={false} label="Change tile image" hint="Square or compact images work best" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`edit-t-from-${tile.id}`} className="label">Gradient start</label>
                  <input
                    id={`edit-t-from-${tile.id}`}
                    name="from"
                    type="color"
                    defaultValue={tile.from ?? "#ffe4e6"}
                    className="input h-11 !py-1"
                  />
                </div>
                <div>
                  <label htmlFor={`edit-t-to-${tile.id}`} className="label">Gradient end</label>
                  <input
                    id={`edit-t-to-${tile.id}`}
                    name="to"
                    type="color"
                    defaultValue={tile.to ?? "#fecdd3"}
                    className="input h-11 !py-1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary !py-2 text-xs"
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Saving…">Save Tile</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
