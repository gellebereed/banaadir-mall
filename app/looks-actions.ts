"use server";

/**
 * SHOP THE LOOK — create, edit, switch off and delete looks
 * (lib/look-utils.ts for the model, lib/looks.ts for storage).
 *
 * Two people make looks:
 *   • a shop's team (products.edit) — from their own products only, with
 *     an optional "buy the whole look" discount;
 *   • the marketplace admin (marketing access) — from any shop's products,
 *     which is what lets a look mix stores. No discount on those: a
 *     discount is a shop's offer, and one shop cannot discount another's.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProductsByStore, getMarketplaceProducts, getOffers } from "@/lib/api";
import { can, may, type Session } from "@/lib/auth";
import { mutateDB } from "@/lib/db";
import {
  isOccasion,
  lookPath,
  LOOK_MAX_BUNDLE,
  LOOK_MAX_DISCOUNT,
  LOOK_MAX_ITEMS,
  LOOK_MIN_ITEMS,
  type Look,
  type LookItem,
} from "@/lib/look-utils";
import { deleteLook as removeLook, getLook, getLooks, saveLook as storeLook } from "@/lib/looks";
import { offerProblem } from "@/lib/offers";
import { getSession } from "@/lib/session";
import { deleteOfferFromSupabase, upsertOfferInSupabase, useSupabaseMutations } from "@/lib/supabase/mutations";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";
import { deleteUpload, filesFrom, saveImages } from "@/lib/uploads";
import type { Offer, Product } from "@/lib/types";

export interface LookState {
  ok?: string;
  error?: string;
}

type Maker = { session: Session; store?: string; admin: boolean };

async function whoMakes(): Promise<Maker | { error: string }> {
  const session = await getSession();
  if (session?.role === "admin" && can(session, "marketing")) return { session, admin: true };
  if (session?.role === "seller" && session.store) {
    if (!may(session, "products.edit")) return { error: "Your account can't change how products are shown." };
    return { session, store: session.store, admin: false };
  }
  return { error: "Sign in with your store account to make looks." };
}

/** A shop may touch only its own looks; the admin any. */
function owns(maker: Maker, look: Look): boolean {
  return maker.admin || (Boolean(look.store) && look.store === maker.store);
}

function refreshPages() {
  // Offers are read through tagged caches; a look's discount is an offer.
  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/", "page");
  revalidatePath("/looks");
  revalidatePath("/vendor/looks");
  revalidatePath("/admin/looks");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(100, Math.max(0, round2(n)));

async function writeOffer(offer: Offer): Promise<string | null> {
  if (useSupabaseMutations()) {
    const saved = await upsertOfferInSupabase(offer);
    if (saved === "missing-table") return "Offers need one database update first — run supabase/migration-offers.sql.";
    if (saved !== "ok") return "Could not save the look's discount — please try again.";
    return null;
  }
  await mutateDB((db) => {
    const list = db.offers ?? [];
    const index = list.findIndex((o) => o.id === offer.id);
    if (index >= 0) list[index] = offer;
    else list.push(offer);
    db.offers = list;
  });
  return null;
}

async function dropOffer(id: string): Promise<void> {
  if (useSupabaseMutations()) await deleteOfferFromSupabase(id);
  else
    await mutateDB((db) => {
      db.offers = (db.offers ?? []).filter((o) => o.id !== id);
    });
}

/**
 * Keep the look's discount offer in step with the look.
 *
 * The discount is a bundle offer — "one of each of these for $X" — because
 * the basket, the checkout and submitOrderAction already price bundles,
 * and a second pricing path for looks would be a second place for the
 * shop's money to go wrong. The price is fixed from today's prices when
 * the look is saved; saving the look again re-prices it.
 *
 * Returns the offer id to keep on the look (or undefined), plus a warning
 * when the discount could not be applied.
 */
async function syncOffer(look: Look, products: Product[]): Promise<{ offerId?: string; warning?: string }> {
  const ids = [...new Set(look.items.map((i) => i.productId))];
  const pct = look.discountPct ?? 0;
  const eligible = Boolean(look.store) && pct > 0 && ids.length >= LOOK_MIN_ITEMS && ids.length <= LOOK_MAX_BUNDLE;

  if (!eligible) {
    if (look.offerId) await dropOffer(look.offerId);
    return {
      warning:
        look.store && pct > 0 && ids.length > LOOK_MAX_BUNDLE
          ? `The discount works on looks of up to ${LOOK_MAX_BUNDLE} pieces, so this one was saved without it.`
          : undefined,
    };
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const members = ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  const sum = members.reduce((t, p) => t + p.price, 0);
  const offer: Offer = {
    id: look.offerId ?? `offer-look-${look.id}`,
    store: look.store!,
    name: `Full look: ${look.title}`.slice(0, 80),
    kind: "bundle",
    active: look.active,
    productIds: members.map((p) => p.id),
    bundle: members.map((p) => ({
      productId: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      image: p.images?.[0],
      icon: p.icon,
    })),
    price: round2(sum * (1 - pct / 100)),
    createdAt: look.createdAt,
  };
  const problem = offerProblem(offer);
  if (problem) return { warning: `Saved without the discount: ${problem}` };
  const failed = await writeOffer(offer);
  if (failed) return { warning: `Saved without the discount. ${failed}` };
  return { offerId: offer.id };
}

export async function saveLook(_prev: LookState, formData: FormData): Promise<LookState> {
  const maker = await whoMakes();
  if ("error" in maker) return maker;

  const id = String(formData.get("id") ?? "");
  const current = id ? await getLook(id) : undefined;
  if (id && (!current || !owns(maker, current))) return { error: "That look no longer exists." };
  // A shop's look stays that shop's, even when the admin edits it.
  const store = current ? current.store : maker.store;

  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  if (title.length < 2) return { error: "Give the look a name, e.g. \"Eid in white\"." };
  const description = String(formData.get("description") ?? "").trim().slice(0, 300) || undefined;
  const occasions = [...new Set(formData.getAll("occasions").map(String))].filter(isOccasion);
  const active = formData.get("active") === "on";
  const rawPct = Number(formData.get("discountPct") ?? 0);
  const discountPct = store && Number.isFinite(rawPct) && rawPct > 0 ? Math.min(LOOK_MAX_DISCOUNT, round2(rawPct)) : undefined;

  // The products a dot may point at: the shop's own, or for a marketplace
  // look anything shoppers can see.
  const products = store ? await getBaseProductsByStore(store) : await getMarketplaceProducts();
  const allowed = new Set(products.map((p) => p.id));
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
  } catch {
    raw = [];
  }
  const seen = new Set<string>();
  const items: LookItem[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const productId = String((entry as LookItem)?.productId ?? "");
    const x = Number((entry as LookItem)?.x);
    const y = Number((entry as LookItem)?.y);
    if (!allowed.has(productId) || seen.has(productId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(productId);
    items.push({ productId, x: clamp(x), y: clamp(y) });
  }
  if (items.length < LOOK_MIN_ITEMS) {
    return { error: `Tap the photo to add a dot on at least ${LOOK_MIN_ITEMS} pieces, and pick the product for each.` };
  }
  if (items.length > LOOK_MAX_ITEMS) return { error: `A look can have at most ${LOOK_MAX_ITEMS} pieces.` };

  // The photo: a new upload replaces the old one.
  const [file] = filesFrom(formData, "photo").filter((f) => f.size > 0);
  let image = current?.image ?? "";
  if (file) {
    const [url] = await saveImages([file], `looks/${store ?? "marketplace"}`);
    if (!url) return { error: "That photo could not be uploaded — use a JPG, PNG or WebP under 5 MB." };
    if (current?.image && current.image !== url) await deleteUpload(current.image).catch(() => {});
    image = url;
  }
  if (!image) return { error: "Add the outfit photo." };

  const now = new Date().toISOString();
  const existing = current ? [] : await getLooks(store);
  const look: Look = {
    id: current?.id ?? `look-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    store,
    title,
    description,
    image,
    occasions,
    items,
    discountPct,
    offerId: current?.offerId,
    active,
    // New looks go first in the shop's list.
    position: current?.position ?? Math.min(0, ...existing.map((l) => l.position)) - 1,
    createdAt: current?.createdAt ?? now,
  };

  const { offerId, warning } = await syncOffer(look, products);
  look.offerId = offerId;
  if (!offerId) look.discountPct = warning ? undefined : look.discountPct;

  try {
    await storeLook(look);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (store) {
    await logActivity(store, current ? "look.update" : "look.create", `${current ? "Updated" : "Created"} look "${title}" (${items.length} pieces)`, look.id);
  }
  refreshPages();
  revalidatePath(lookPath(look));
  const done = current ? "Look saved." : active ? `"${title}" is live.` : `"${title}" saved as hidden.`;
  return warning ? { ok: `${done} ${warning}` } : { ok: done };
}

export async function toggleLook(id: string): Promise<LookState> {
  const maker = await whoMakes();
  if ("error" in maker) return maker;
  const look = await getLook(id);
  if (!look || !owns(maker, look)) return { error: "That look no longer exists." };
  const next = { ...look, active: !look.active };
  try {
    await storeLook(next);
    // The discount follows the look: a hidden look must not keep
    // discounting its pieces in the basket.
    if (look.offerId) {
      const offer = (await getOffers()).find((o) => o.id === look.offerId);
      if (offer) await writeOffer({ ...offer, active: next.active });
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  refreshPages();
  revalidatePath(lookPath(look));
  return { ok: next.active ? `"${look.title}" is live.` : `"${look.title}" is hidden.` };
}

export async function deleteLook(id: string): Promise<LookState> {
  const maker = await whoMakes();
  if ("error" in maker) return maker;
  const look = await getLook(id);
  if (!look || !owns(maker, look)) return { error: "That look no longer exists." };
  try {
    await removeLook(id);
    if (look.offerId) await dropOffer(look.offerId);
    await deleteUpload(look.image).catch(() => {});
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (look.store) await logActivity(look.store, "look.delete", `Deleted look "${look.title}"`, id);
  refreshPages();
  return { ok: `Deleted "${look.title}". The products are untouched.` };
}

/** Move a look one place earlier (-1) or later (+1) in its list. */
export async function moveLook(id: string, direction: -1 | 1): Promise<LookState> {
  const maker = await whoMakes();
  if ("error" in maker) return maker;
  const list = (await getLooks(maker.store)).filter((l) => owns(maker, l));
  const index = list.findIndex((l) => l.id === id);
  const swap = index + direction;
  if (index < 0 || swap < 0 || swap >= list.length) return {};
  [list[index], list[swap]] = [list[swap], list[index]];
  try {
    for (const [i, l] of list.entries()) if (l.position !== i) await storeLook({ ...l, position: i });
  } catch (err) {
    return { error: (err as Error).message };
  }
  refreshPages();
  return {};
}
