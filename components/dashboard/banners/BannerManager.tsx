"use client";

import { PALETTES, sceneBackground } from "@/lib/scenes";
import { useEffect, useState, useTransition } from "react";
import { deleteBanner, moveBanner, saveBanner, toggleBanner } from "@/app/actions";
import PhotoPicker, { type PendingPhoto } from "@/components/dashboard/PhotoPicker";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { scheduleStatus, STATUS_LABEL, STATUS_TONE } from "@/lib/campaign-utils";
import { formatShopTime, toShopInput } from "@/lib/shop-time";
import type { Banner } from "@/lib/types";
import PalettePicker from "./PalettePicker";
import LinkField, { type LinkOption } from "./LinkField";

/**
 * THE HERO BANNERS — list, order, schedule and edit them.
 *
 * Replaces the banner section of /admin/marketing, where adding a banner
 * and editing one were two different forms with different fields (the
 * edit form had no phone artwork at all), nothing could be scheduled, and
 * nothing showed what a banner would look like until it was live in front
 * of every shopper. Here one editor does both, with the banner drawn
 * beside the form as it is typed, on a computer's frame and a phone's.
 */
export default function BannerManager({ banners, links }: { banners: Banner[]; links: LinkOption[] }) {
  const [editing, setEditing] = useState<Banner | "new" | null>(null);

  return (
    <div>
      <div className="space-y-3">
        {banners.length === 0 && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sand-200 bg-sand-50 px-4 py-10 text-center transition hover:border-ocean-300 hover:bg-ocean-50/40"
          >
            <span className="text-3xl">🖼️</span>
            <span className="font-display font-bold text-ocean-950">Add your first banner</span>
            <span className="max-w-sm text-xs text-slate-500">
              Upload artwork for a sale, a shop or a season. Until then the hero shows your welcome slide and
              the campaigns that are running.
            </span>
          </button>
        )}
        {banners.map((banner, i) => (
          <BannerRow
            key={banner.id}
            banner={banner}
            position={i}
            last={i === banners.length - 1}
            onEdit={() => setEditing(banner)}
          />
        ))}
      </div>

      {banners.length > 0 && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ocean-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-ocean-800"
        >
          ＋ Add a banner
        </button>
      )}

      {editing && (
        <BannerEditor
          banner={editing === "new" ? undefined : editing}
          links={links}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BannerRow({
  banner,
  position,
  last,
  onEdit,
}: {
  banner: Banner;
  position: number;
  last: boolean;
  onEdit: () => void;
}) {
  const [pending, start] = useTransition();
  const status = scheduleStatus(banner);
  const run = (fn: () => Promise<void>) => start(async () => fn());

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-sand-200 bg-white p-3 transition sm:flex-row sm:items-center ${
        pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
          <button
            type="button"
            disabled={position === 0 || pending}
            onClick={() => run(() => moveBanner(banner.id, -1))}
            aria-label="Move up"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-ocean-700 disabled:opacity-25"
          >
            ▲
          </button>
          <span className="font-display text-xs font-extrabold text-slate-400">{position + 1}</span>
          <button
            type="button"
            disabled={last || pending}
            onClick={() => run(() => moveBanner(banner.id, 1))}
            aria-label="Move down"
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-sand-100 hover:text-ocean-700 disabled:opacity-25"
          >
            ▼
          </button>
        </div>
        <button type="button" onClick={onEdit} className="block w-40 shrink-0 sm:w-52" aria-label="Edit banner">
          <BannerArt banner={banner} frame="desktop" small />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-slate-800">
            {banner.title || <span className="text-slate-500">Image-only banner</span>}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          Opens <span className="font-mono text-[11px] text-ocean-700">{banner.link}</span>
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {banner.startsAt || banner.endsAt ? (
            <span>
              🗓️ {banner.startsAt ? formatShopTime(banner.startsAt) : "now"} →{" "}
              {banner.endsAt ? formatShopTime(banner.endsAt) : "no end"}
            </span>
          ) : (
            <span>🗓️ Always on</span>
          )}
          {banner.image ? (
            banner.mobileImage ? (
              <span className="text-emerald-600">📱 Phone artwork ✓</span>
            ) : (
              <span className="text-amber-600">📱 No phone artwork — edges crop on phones</span>
            )
          ) : (
            <span>🎨 Colour only</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full bg-ocean-100 px-3.5 py-1.5 text-xs font-bold text-ocean-800 transition hover:bg-ocean-200"
        >
          ✏️ Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => toggleBanner(banner.id))}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
            banner.active
              ? "bg-sand-100 text-slate-600 hover:bg-sand-200"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          }`}
        >
          {banner.active ? "Pause" : "Go live"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this banner? Its artwork is removed too.")) return;
            run(() => deleteBanner(banner.id));
          }}
          className="rounded-full border border-coral-500 px-3.5 py-1.5 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * A banner drawn as the hero draws it: artwork or gradient, and the words
 * on a scrim only when there are words. Desktop frame 8:3, phone 5:4 —
 * the sizes the upload hints ask for.
 */
export function BannerArt({
  banner,
  frame,
  small = false,
  image,
  mobileImage,
}: {
  banner: Pick<Banner, "title" | "subtitle" | "cta" | "from" | "to" | "fit" | "image" | "mobileImage">;
  frame: "desktop" | "phone";
  small?: boolean;
  /** Unsaved picks, shown in place of the saved artwork. */
  image?: string;
  mobileImage?: string;
}) {
  const desktopSrc = image ?? banner.image;
  const src = frame === "phone" ? (mobileImage ?? banner.mobileImage ?? desktopSrc) : desktopSrc;
  const hasText = Boolean(banner.title || banner.subtitle || banner.cta);
  return (
    <div
      className={`relative w-full overflow-hidden ${small ? "rounded-xl" : "rounded-2xl shadow-sm ring-1 ring-black/5"} ${
        frame === "phone" ? "aspect-[5/4]" : "aspect-[8/3]"
      }`}
      style={{ background: sceneBackground(banner.from, banner.to) }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- saved URLs and local blob previews alike
        <img
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full ${banner.fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      )}
      {hasText && (
        <div
          className={`absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/55 via-black/25 to-transparent text-white ${
            small ? "p-2.5" : "p-5 sm:p-7"
          }`}
        >
          {banner.title && (
            <p className={`font-display font-extrabold leading-tight ${small ? "text-xs" : "text-xl sm:text-3xl"}`}>
              {banner.title}
            </p>
          )}
          {banner.subtitle && !small && <p className="mt-1 max-w-sm text-xs text-white/85 sm:text-sm">{banner.subtitle}</p>}
          {banner.cta && !small && (
            <span className="mt-3 inline-flex w-fit rounded-full bg-mango-500 px-4 py-1.5 text-xs font-bold text-ocean-950">
              {banner.cta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BannerEditor({
  banner,
  links,
  onClose,
}: {
  banner?: Banner;
  links: LinkOption[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? "");
  const [cta, setCta] = useState(banner?.cta ?? "");
  const [from, setFrom] = useState(banner?.from ?? PALETTES.ocean.from);
  const [to, setTo] = useState(banner?.to ?? PALETTES.ocean.to);
  const [fit, setFit] = useState<"cover" | "contain">(banner?.fit ?? "cover");
  const [desktop, setDesktop] = useState<PendingPhoto[]>([]);
  const [phone, setPhone] = useState<PendingPhoto[]>([]);
  const [dropPhone, setDropPhone] = useState(false);
  const [frame, setFrame] = useState<"desktop" | "phone">("desktop");

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

  const preview = {
    title,
    subtitle,
    cta,
    from,
    to,
    fit,
    image: banner?.image,
    mobileImage: dropPhone ? undefined : banner?.mobileImage,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ocean-950/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={banner ? "Edit banner" : "New banner"}
        className="animate-fade-up flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-sand-200 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-display text-lg font-extrabold text-ocean-950">{banner ? "Edit banner" : "New banner"}</h3>
            <p className="text-xs text-slate-500">Goes live on the home page the moment you save.</p>
          </div>
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
            const result = await saveBanner(formData);
            if (!result.error) onClose();
            return result;
          }}
          className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_24rem]"
        >
          {banner && <input type="hidden" name="id" value={banner.id} />}

          <div className="space-y-5 p-5 sm:p-6">
            {/* Artwork */}
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">
                  Computer artwork <span className="font-normal text-slate-400">· 1600 × 600</span>
                </span>
                <PhotoPicker
                  name="image"
                  multiple={false}
                  photos={desktop}
                  onPhotosChange={setDesktop}
                  label={banner?.image ? "Replace artwork" : "Upload artwork"}
                  hint="8:3 wide · JPG or WebP"
                />
              </div>
              <div>
                <span className="label">
                  Phone artwork <span className="font-normal text-slate-400">· 1000 × 800, optional</span>
                </span>
                <PhotoPicker
                  name="mobileImage"
                  multiple={false}
                  photos={phone}
                  onPhotosChange={(next) => {
                    setPhone(next);
                    if (next.length) setFrame("phone");
                  }}
                  label={banner?.mobileImage && !dropPhone ? "Replace phone artwork" : "Upload phone artwork"}
                  hint="5:4 · falls back to the computer artwork"
                />
                {banner?.mobileImage && phone.length === 0 && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      name="removeMobileImage"
                      checked={dropPhone}
                      onChange={(e) => setDropPhone(e.target.checked)}
                    />
                    Remove the phone artwork
                  </label>
                )}
              </div>
              <p className="rounded-xl bg-ocean-50 px-3 py-2 text-[11px] leading-relaxed text-ocean-900 sm:col-span-2">
                Keep logos and words inside the middle 60% — phones crop the sides of wide artwork. If the
                artwork already has your headline on it, leave the words below empty.
              </p>
            </fieldset>

            <div>
              <label htmlFor="banner-fit" className="label">
                How the artwork fits
              </label>
              <select
                id="banner-fit"
                name="fit"
                value={fit}
                onChange={(e) => setFit(e.target.value === "contain" ? "contain" : "cover")}
                className="input"
              >
                <option value="cover">Fill the frame — crops the edges (photos)</option>
                <option value="contain">Show the whole image — never cropped (ready-made banners)</option>
              </select>
            </div>

            {/* Words */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="banner-title" className="label">
                  Headline <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="banner-title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Eid Mega Sale"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="banner-subtitle" className="label">
                  Subtitle
                </label>
                <input
                  id="banner-subtitle"
                  name="subtitle"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  maxLength={120}
                  placeholder="Up to 60% off at 40 shops"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="banner-cta" className="label">
                  Button
                </label>
                <input
                  id="banner-cta"
                  name="cta"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  maxLength={40}
                  placeholder="Shop now"
                  className="input"
                />
              </div>
            </div>

            <LinkField id="banner-link" defaultValue={banner?.link ?? ""} options={links} />

            {/* Schedule */}
            <div>
              <span className="label">
                Schedule <span className="font-normal text-slate-400">(Mogadishu time, optional)</span>
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  Goes up
                  <input
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={toShopInput(banner?.startsAt)}
                    className="input mt-1"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Comes down
                  <input
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={toShopInput(banner?.endsAt)}
                    className="input mt-1"
                  />
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Leave both empty to keep it up until you pause it.</p>
            </div>

            {/* Colour */}
            <PalettePicker from={from} to={to} onPick={(p) => { setFrom(p.from); setTo(p.to); }} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Background from
                <input
                  type="color"
                  name="from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="input mt-1 h-11 !py-1"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                to
                <input
                  type="color"
                  name="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="input mt-1 h-11 !py-1"
                />
              </label>
            </div>
          </div>

          {/* Live preview */}
          <aside className="border-t border-sand-200 bg-sand-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="lg:sticky lg:top-0">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Preview</p>
                <div className="flex rounded-full bg-white p-0.5 text-xs font-bold ring-1 ring-sand-200">
                  {(["desktop", "phone"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrame(f)}
                      className={`rounded-full px-3 py-1 transition ${
                        frame === f ? "bg-ocean-950 text-white" : "text-slate-500 hover:text-ocean-800"
                      }`}
                    >
                      {f === "desktop" ? "💻 Computer" : "📱 Phone"}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`mt-3 ${frame === "phone" ? "mx-auto max-w-[15rem]" : ""}`}>
                <BannerArt
                  banner={preview}
                  frame={frame}
                  image={desktop[0]?.previewUrl}
                  mobileImage={phone[0]?.previewUrl}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                {frame === "phone"
                  ? phone.length || preview.mobileImage
                    ? "Phones show your phone artwork."
                    : "No phone artwork: phones show the middle of the computer artwork."
                  : "On computers the banner fills the full width of the screen."}
              </p>
              <div className="mt-5 flex gap-2">
                <SubmitButton pendingLabel="Saving…" className="btn-primary flex-1">
                  {banner ? "Save banner" : "Add banner"}
                </SubmitButton>
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </aside>
        </SafeForm>
      </div>
    </div>
  );
}
