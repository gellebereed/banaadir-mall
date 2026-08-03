"use client";

import Image from "next/image";
import { useActionState } from "react";
import { updateStoreSettings, type SaveState } from "@/app/actions";
import PhotoPicker from "./PhotoPicker";
import SubmitButton from "./SubmitButton";
import useRefreshOnSuccess from "./useRefreshOnSuccess";
import { formatWhatsAppNumber } from "@/lib/whatsapp";
import type { Store } from "@/lib/types";

const INITIAL: SaveState = { ok: false, message: "" };

/**
 * Store branding & profile form. Uses useActionState so the page stays put
 * and confirms the save inline — the old version gave no feedback at all,
 * which made people press Save repeatedly.
 */
export default function StoreSettingsForm({
  store,
  includeStoreField,
}: {
  store: Store;
  /** Admins edit someone else's store, so the slug travels with the form. */
  includeStoreField: boolean;
}) {
  const [state, formAction] = useActionState(updateStoreSettings, INITIAL);
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      {includeStoreField && <input type="hidden" name="store" value={store.slug} />}

      {/* Logo */}
      <fieldset className="sm:col-span-2">
        <legend className="label">Store logo</legend>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sand-100 text-3xl">
            {store.logo ? (
              <Image src={store.logo} alt="" width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              store.icon
            )}
          </span>
          <div className="min-w-56 flex-1">
            <PhotoPicker
              name="logo"
              multiple={false}
              label={store.logo ? "Replace logo" : "Upload a logo"}
              hint="Square images look best"
            />
          </div>
        </div>
        {store.logo && (
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-coral-600">
            <input type="checkbox" name="removeLogo" className="h-3.5 w-3.5 accent-coral-500" />
            Remove current logo (go back to the icon)
          </label>
        )}
      </fieldset>

      {/* Banner */}
      <fieldset className="sm:col-span-2">
        <legend className="label">Store banner</legend>
        <p className="mb-2 text-xs text-slate-400">
          Used on your store page and as the background of your card on the
          home page.
        </p>
        {store.banner ? (
          <div className="relative mb-3 h-28 w-full overflow-hidden rounded-2xl">
            <Image src={store.banner} alt="" fill sizes="600px" className="object-cover" />
          </div>
        ) : (
          <div
            className="mb-3 h-28 w-full rounded-2xl"
            style={{ background: `linear-gradient(120deg, ${store.art.from}, ${store.art.to})` }}
          />
        )}
        <PhotoPicker
          name="banner"
          multiple={false}
          label={store.banner ? "Replace banner" : "Upload a banner"}
          hint="Wide images work best (about 1600 × 400)"
        />
        {store.banner && (
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-coral-600">
            <input type="checkbox" name="removeBanner" className="h-3.5 w-3.5 accent-coral-500" />
            Remove current banner (go back to the gradient)
          </label>
        )}
      </fieldset>

      {/* Profile */}
      <div className="sm:col-span-2">
        <label htmlFor="store-name" className="label">Store name</label>
        <input id="store-name" name="name" required defaultValue={store.name} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="tagline" className="label">Tagline</label>
        <input id="tagline" name="tagline" defaultValue={store.tagline} placeholder="What your store is known for" className="input" />
      </div>
      <div>
        <label htmlFor="city" className="label">City</label>
        <input id="city" name="city" required defaultValue={store.city} className="input" />
      </div>
      <div>
        <label htmlFor="store-icon" className="label">
          Icon <span className="font-normal text-slate-400">(used when there is no logo)</span>
        </label>
        <input id="store-icon" name="icon" maxLength={4} defaultValue={store.icon} className="input" />
      </div>

      {/*
        Without a number here, orders for this store go to Banaadir Mall
        support to be relayed by hand — so this field is the difference
        between hearing about a sale instantly and hearing about it later.
      */}
      <div className="sm:col-span-2">
        <label htmlFor="whatsapp" className="label">
          Order WhatsApp number
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          defaultValue={store.whatsapp ? formatWhatsAppNumber(store.whatsapp) : ""}
          placeholder="+252 61 333 4444"
          className="input"
        />
        {store.whatsapp ? (
          <p className="mt-1 text-xs text-emerald-600">
            ✓ Orders are sent straight to {formatWhatsAppNumber(store.whatsapp)} on
            WhatsApp, with only your own items and your own order number.
          </p>
        ) : (
          <p className="mt-1 text-xs text-mango-700">
            ⚠ No number yet — customers can&apos;t message you directly, so
            their orders go to Banaadir Mall support to be passed on. Add
            your number to receive them the moment they&apos;re placed.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <SubmitButton>Save Store Settings</SubmitButton>
        {state.message && (
          <span
            className={`text-sm font-semibold ${state.ok ? "text-emerald-600" : "text-coral-600"}`}
          >
            {state.ok ? "✓ " : "⚠ "}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
