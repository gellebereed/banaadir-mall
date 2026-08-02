import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  savePromoTile,
  saveBanner,
} from "@/app/actions";
import {
  BannerDeleteBtn,
  BannerMoveBtn,
  BannerToggleBtn,
  TileDeleteBtn,
  TileToggleBtn,
} from "@/components/dashboard/MarketingActionButtons";
import MarketingBasicsForm from "@/components/dashboard/MarketingBasicsForm";
import PhotoPicker from "@/components/dashboard/PhotoPicker";
import SectionArranger from "@/components/dashboard/SectionArranger";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { getMarketingSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Marketing" };

/**
 * The storefront control centre. The admin builds the home page here:
 * banner carousel, campaign tiles, section order, hero copy and the
 * site-wide sale. Everything publishes to the live site immediately.
 */
export default async function AdminMarketingPage() {
  const m = await getMarketingSettings();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Marketing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build the home page. Changes go live the moment you save.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/flash" className="btn-secondary !px-4 !py-2 text-sm">
            ⚡ Flash Deals
          </Link>
          <Link href="/" className="btn-primary !px-4 !py-2 text-sm">
            View Storefront
          </Link>
        </div>
      </div>

      {/* ── Banner carousel ──────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🖼️ Banner carousel</h2>
        <p className="mt-1 text-xs text-slate-400">
          Big rotating banners at the top of the home page. Upload artwork or
          let the gradient show through.
        </p>

        <div className="mt-4 space-y-3">
          {m.banners.length === 0 && (
            <p className="rounded-xl bg-sand-50 px-4 py-6 text-center text-sm text-slate-400">
              No banners yet — add your first campaign below.
            </p>
          )}
          {m.banners.map((b, i) => (
            <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-sand-200 p-3">
              <div
                className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg"
                style={{ background: `linear-gradient(120deg, ${b.from}, ${b.to})` }}
              >
                {b.image && <Image src={b.image} alt="" fill sizes="112px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">
                  {b.title || (
                    <span className="text-slate-500">🖼️ Image-only banner</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {b.subtitle || (b.title ? "No subtitle" : "No text overlay")} · links to {b.link}
                  {b.fit === "contain" && " · whole image"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <BannerMoveBtn id={b.id} delta={-1} disabled={i === 0} />
                <BannerMoveBtn id={b.id} delta={1} disabled={i === m.banners.length - 1} />
                <BannerToggleBtn id={b.id} active={b.active} />
                <BannerDeleteBtn id={b.id} />
              </div>
            </div>
          ))}
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-sand-200 p-4">
          <summary className="cursor-pointer text-sm font-bold text-ocean-700">
            + Add a banner
          </summary>
          <form action={saveBanner} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label">Artwork</span>
              <PhotoPicker name="image" multiple={false} label="Upload banner image" hint="Wide images work best (about 1600 × 500)" />
            </div>
            <div className="sm:col-span-2 rounded-xl bg-ocean-50 px-4 py-3 text-xs text-ocean-900">
              💡 <strong>Text is optional.</strong> If your artwork already
              contains the headline, leave the fields below empty — the banner
              shows the image alone with nothing over it, and clicking it still
              goes to the link.
            </div>
            <div>
              <label htmlFor="b-title" className="label">
                Headline <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input id="b-title" name="title" placeholder="Eid Mega Sale" className="input" />
            </div>
            <div>
              <label htmlFor="b-subtitle" className="label">Subtitle</label>
              <input id="b-subtitle" name="subtitle" placeholder="Up to 60% off everything" className="input" />
            </div>
            <div>
              <label htmlFor="b-cta" className="label">Button text</label>
              <input id="b-cta" name="cta" placeholder="Shop now" className="input" />
            </div>
            <div>
              <label htmlFor="b-link" className="label">Links to</label>
              <input id="b-link" name="link" placeholder="/products?sort=discount" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="b-fit" className="label">Image display</label>
              <select id="b-fit" name="fit" className="input" defaultValue="cover">
                <option value="cover">Fill the frame — crops edges (best for photos)</option>
                <option value="contain">Show the whole image — never cropped (best for ready-made banners)</option>
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Pick &ldquo;show the whole image&rdquo; if your banner already
                has text or a logo that must not be cut off.
              </p>
            </div>
            <div>
              <label htmlFor="b-from" className="label">Gradient start</label>
              <input id="b-from" name="from" type="color" defaultValue="#1f6270" className="input h-11 !py-1" />
            </div>
            <div>
              <label htmlFor="b-to" className="label">Gradient end</label>
              <input id="b-to" name="to" type="color" defaultValue="#fb8a0e" className="input h-11 !py-1" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Adding…">Add Banner</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      {/* ── Campaign tiles ───────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🏷️ Campaign tiles</h2>
        <p className="mt-1 text-xs text-slate-400">
          The strip of small offers — &ldquo;50% and above&rdquo;, &ldquo;Buy 4
          pay 3&rdquo;, free delivery, and so on.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {m.promoTiles.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-xl border border-sand-200">
              <div
                className="relative flex h-20 items-center justify-center"
                style={{ background: `linear-gradient(120deg, ${t.from}, ${t.to})` }}
              >
                {t.image && <Image src={t.image} alt="" fill sizes="200px" className="object-cover" />}
                <span className="relative font-display text-xl font-extrabold text-ocean-950">
                  {t.label}
                </span>
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-semibold text-slate-700">{t.sublabel}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1">
                    <TileToggleBtn id={t.id} active={t.active} />
                  </div>
                  <TileDeleteBtn id={t.id} />
                </div>
              </div>
            </div>
          ))}
          {m.promoTiles.length === 0 && (
            <p className="rounded-xl bg-sand-50 px-4 py-6 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-4">
              No tiles yet.
            </p>
          )}
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-sand-200 p-4">
          <summary className="cursor-pointer text-sm font-bold text-ocean-700">
            + Add a tile
          </summary>
          <form action={savePromoTile} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="t-label" className="label">Big text</label>
              <input id="t-label" name="label" required placeholder="50%" className="input" />
            </div>
            <div>
              <label htmlFor="t-sublabel" className="label">Small text</label>
              <input id="t-sublabel" name="sublabel" placeholder="and above discount" className="input" />
            </div>
            <div>
              <label htmlFor="t-link" className="label">Links to</label>
              <input id="t-link" name="link" placeholder="/products?sort=discount" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="t-from" className="label">From</label>
                <input id="t-from" name="from" type="color" defaultValue="#ffe4e6" className="input h-11 !py-1" />
              </div>
              <div>
                <label htmlFor="t-to" className="label">To</label>
                <input id="t-to" name="to" type="color" defaultValue="#fecdd3" className="input h-11 !py-1" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="label">Optional image</span>
              <PhotoPicker name="image" multiple={false} label="Upload tile image" hint="Square works best" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Adding…">Add Tile</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      {/* ── Section arranger ─────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🧩 Home page layout</h2>
        <p className="mt-1 mb-4 text-xs text-slate-400">
          Reorder sections with ▲▼ and switch any of them off.
        </p>
        <SectionArranger initial={m.sections} />
      </section>

      {/* ── Hero, announcement & campaign ────────────────────────── */}
      <div className="mt-5">
        <MarketingBasicsForm marketing={m} />
      </div>
    </div>
  );
}
