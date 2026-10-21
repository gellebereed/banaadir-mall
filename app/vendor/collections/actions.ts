"use server";

/**
 * Store collections (lib/collections.ts): create, edit, reorder, delete.
 * Anyone on the store's team who may edit products may manage them —
 * a collection is a way of showing products, not a change to them.
 */

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProductsByStore } from "@/lib/api";
import { may } from "@/lib/auth";
import {
  collectionSlug,
  deleteCollection as removeCollection,
  getCollections,
  saveCollection as storeCollection,
  type StoreCollection,
} from "@/lib/collections";
import { getSession } from "@/lib/session";

export interface CollectionState {
  ok?: string;
  error?: string;
}

async function requireStoreEditor(): Promise<{ store: string } | { error: string }> {
  const session = await getSession();
  if (!session || session.role !== "seller" || !session.store) {
    return { error: "Sign in with your store account to manage collections." };
  }
  if (!may(session, "products.edit")) return { error: "Your account can't change how products are shown." };
  return { store: session.store };
}

function refreshPages(store: string) {
  revalidatePath("/vendor/collections");
  revalidatePath(`/store/${store}`);
}

export async function saveCollection(_prev: CollectionState, formData: FormData): Promise<CollectionState> {
  const who = await requireStoreEditor();
  if ("error" in who) return who;
  const { store } = who;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const description = String(formData.get("description") ?? "").trim().slice(0, 300);
  const hidden = formData.get("hidden") === "on";
  if (name.length < 2) return { error: "Give the collection a name, e.g. \"Ramadan picks\"." };

  let picked: unknown;
  try {
    picked = JSON.parse(String(formData.get("productIdsJson") ?? "[]"));
  } catch {
    picked = [];
  }
  // Only this store's own products, each once, in the order given.
  const own = new Set((await getBaseProductsByStore(store)).map((p) => p.id));
  const productIds = [
    ...new Set((Array.isArray(picked) ? picked : []).filter((x): x is string => typeof x === "string" && own.has(x))),
  ].slice(0, 500);

  const existing = await getCollections(store, true);
  const current = id ? existing.find((c) => c.id === id) : undefined;
  if (id && !current) return { error: "That collection no longer exists." };

  // The slug follows the name but must stay unique within the store; once
  // set it is kept, so links already shared keep working after a rename.
  let slug = current?.slug ?? collectionSlug(name);
  if (!current) {
    const taken = new Set(existing.map((c) => c.slug));
    for (let n = 2; taken.has(slug); n++) slug = `${collectionSlug(name)}-${n}`;
  }

  const collection: StoreCollection = {
    id: current?.id ?? `col-${store}-${Date.now().toString(36)}`,
    store,
    slug,
    name,
    description: description || undefined,
    productIds,
    position: current?.position ?? existing.reduce((max, c) => Math.max(max, c.position + 1), 0),
    hidden,
  };
  try {
    await storeCollection(collection);
  } catch (err) {
    return { error: (err as Error).message };
  }
  await logActivity(
    store,
    current ? "collection.update" : "collection.create",
    `${current ? "Updated" : "Created"} collection "${name}" (${productIds.length} product${productIds.length === 1 ? "" : "s"})`,
    collection.id,
  );
  refreshPages(store);
  return { ok: current ? "Collection saved." : `"${name}" created.` };
}

export async function deleteCollection(id: string): Promise<CollectionState> {
  const who = await requireStoreEditor();
  if ("error" in who) return who;
  const collection = (await getCollections(who.store, true)).find((c) => c.id === id);
  if (!collection) return { error: "That collection no longer exists." };
  try {
    await removeCollection(id);
  } catch (err) {
    return { error: (err as Error).message };
  }
  await logActivity(who.store, "collection.delete", `Deleted collection "${collection.name}"`, id);
  refreshPages(who.store);
  return { ok: `Deleted "${collection.name}". Its products are untouched.` };
}

/** Move one collection a place earlier (-1) or later (+1) among the store's tabs. */
export async function moveCollection(id: string, direction: -1 | 1): Promise<CollectionState> {
  const who = await requireStoreEditor();
  if ("error" in who) return who;
  const list = await getCollections(who.store, true);
  const index = list.findIndex((c) => c.id === id);
  const swap = index + direction;
  if (index < 0 || swap < 0 || swap >= list.length) return {};
  [list[index], list[swap]] = [list[swap], list[index]];
  try {
    // Renumber all: positions may have gaps or ties from earlier data. One
    // at a time — the local JSON store is read-modify-write per call.
    for (const [i, c] of list.entries()) {
      if (c.position !== i) await storeCollection({ ...c, position: i });
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  refreshPages(who.store);
  return {};
}
