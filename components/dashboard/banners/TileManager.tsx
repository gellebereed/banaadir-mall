"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePromoTile, moveTile, savePromoTile, togglePromoTile } from "@/app/actions";
import PhotoPicker, { type PendingPhoto } from "@/components/dashboard/PhotoPicker";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { scheduleStatus, STATUS_LABEL, STATUS_TONE } from "@/lib/campaign-utils";
import { formatShopTime, toShopInput } from "@/lib/shop-time";
import type { PromoTile } from "@/lib/types";
import CampaignCard from "@/components/home/CampaignCard";
import LinkField, { type LinkOption } from "./LinkField";

/**
 * The admin's own "Today's Campaigns" tiles — "Free delivery", "Buy 4 pay
 * 3" — which lead the strip, ahead of the tiles running campaigns get by
 * themselves. Same editor shape as the banners: one form for new and
 * existing, a preview beside it, an optional schedule.
 */
export default function TileManager({ tiles, links }: { tiles: PromoTile[]; links: LinkOption[] }) {
  const [editing, setEditing] = useState<PromoTile | "new" | null>(null);

  return (
    <div>
      {tiles.length === 0 ? (
        <p className="rounded-2xl bg-sand-50 px-4 py-6 text-center text-sm text-slate-500">
          No tiles of your own. Running campaigns still fill the strip by themselves.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile, i) => (
            <TileCard
              key={tile.id}
              tile={tile}
              first={i === 0}
              last={i === tiles.length - 1}
              onEdit={() => setEditing(tile)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setEditing("new")}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ocean-800 ring-1 ring-ocean-200 transition hover:bg-ocean-50"
      >
        ＋ Add a tile
      </button>
      {editing && (
        <TileEditor tile={editing === "new" ? undefined : editing} links={links} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/** The tile exactly as the storefront draws it (components/home/CampaignCard). */
function TileArt({ tile, image }: { tile: Pick<PromoTile, "label" | "sublabel" | "from" | "to" | "image">; image?: string }) {
  const src = image ?? tile.image;
  return (
    <CampaignCard
      href="#"
      linkable={false}
      from={tile.from}
      to={tile.to}
      headline={tile.label || "50%"}
      sub={tile.sublabel}
      photos={src ? [{ kind: "image", src }] : []}
    />
  );
}

function TileCard({
  tile,
  first,
  last,
  onEdit,
}: {
  tile: PromoTile;
  first: boolean;
  last: boolean;
  onEdit: () => void;
}) {
  const [pending, start] = useTransition();
  const status = scheduleStatus(tile);
  const run = (fn: () => Promise<void>) => start(async () => fn());

  return (
    <div className={`overflow-hidden rounded-2xl border border-sand-200 bg-white ${pending ? "opacity-60" : ""}`}>
      <button type="button" onClick={onEdit} className="block w-full p-2" aria-label="Edit tile">
        <TileArt tile={tile} />
      </button>
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          <span className="truncate font-mono text-[10px] text-slate-400">{tile.link}</span>
        </div>
        {(tile.startsAt || tile.endsAt) && (
          <p className="mt-1 truncate text-[10px] text-slate-400">
            🗓️ {tile.startsAt ? formatShopTime(tile.startsAt) : "now"} → {tile.endsAt ? formatShopTime(tile.endsAt) : "no end"}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            disabled={first || pending}
            onClick={() => run(() => moveTile(tile.id, -1))}
            aria-label="Move earlier"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-ocean-700 disabled:opacity-25"
          >
            ◀
          </button>
          <button
            type="button"
            disabled={last || pending}
            onClick={() => run(() => moveTile(tile.id, 1))}
            aria-label="Move later"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-ocean-700 disabled:opacity-25"
          >
            ▶
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => togglePromoTile(tile.id))}
            className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-sand-200"
          >
            {tile.active ? "Pause" : "Go live"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this tile?")) return;
              run(() => deletePromoTile(tile.id));
            }}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold text-coral-600 transition hover:bg-coral-100"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TileEditor({ tile, links, onClose }: { tile?: PromoTile; links: LinkOption[]; onClose: () => void }) {
  const [label, setLabel] = useState(tile?.label ?? "");
  const [sublabel, setSublabel] = useState(tile?.sublabel ?? "");
  const [from, setFrom] = useState(tile?.from ?? "#ffe4e6");
  const [to, setTo] = useState(tile?.to ?? "#fecdd3");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [dropImage, setDropImage] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ocean-950/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tile ? "Edit tile" : "New tile"}
        className="animate-fade-up max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-sand-200 px-5 py-4">
          <h3 className="font-display text-lg font-extrabold text-ocean-950">{tile ? "Edit tile" : "New tile"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 text-slate-500 transition hover:bg-sand-200"
          >
            ✕
          </button>
        </div>
        <SafeForm
          action={async (formData) => {
            const result = await savePromoTile(formData);
            if (!result.error) onClose();
            return result;
          }}
          className="space-y-4 p-5"
        >
          {tile && <input type="hidden" name="id" value={tile.id} />}
          <div className="rounded-2xl bg-sand-50 p-3">
            <TileArt
              tile={{ label, sublabel, from, to, image: dropImage ? undefined : tile?.image }}
              image={photos[0]?.previewUrl}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tile-label" className="label">
                Big text
              </label>
              <input
                id="tile-label"
                name="label"
                required
                maxLength={40}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="50%"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="tile-sublabel" className="label">
                Small text
              </label>
              <input
                id="tile-sublabel"
                name="sublabel"
                maxLength={80}
                value={sublabel}
                onChange={(e) => setSublabel(e.target.value)}
                placeholder="and above discount"
                className="input"
              />
            </div>
          </div>
          <LinkField id="tile-link" defaultValue={tile?.link ?? ""} options={links} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Background from
              <input type="color" name="from" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 h-11 !py-1" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              to
              <input type="color" name="to" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 h-11 !py-1" />
            </label>
          </div>
          <div>
            <span className="label">
              Picture <span className="font-normal text-slate-400">(optional · portrait, 600 × 800)</span>
            </span>
            <PhotoPicker
              name="image"
              multiple={false}
              photos={photos}
              onPhotosChange={setPhotos}
              label={tile?.image ? "Replace picture" : "Upload picture"}
              hint="A product or lifestyle photo — it sits in a white frame beside your words"
            />
            {tile?.image && photos.length === 0 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="removeImage" checked={dropImage} onChange={(e) => setDropImage(e.target.checked)} />
                Remove the picture
              </label>
            )}
          </div>
          <div>
            <span className="label">
              Schedule <span className="font-normal text-slate-400">(Mogadishu time, optional)</span>
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500">
                Shows from
                <input type="datetime-local" name="startsAt" defaultValue={toShopInput(tile?.startsAt)} className="input mt-1" />
              </label>
              <label className="text-xs text-slate-500">
                Until
                <input type="datetime-local" name="endsAt" defaultValue={toShopInput(tile?.endsAt)} className="input mt-1" />
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <SubmitButton pendingLabel="Saving…" className="btn-primary flex-1">
              {tile ? "Save tile" : "Add tile"}
            </SubmitButton>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </SafeForm>
      </div>
    </div>
  );
}
