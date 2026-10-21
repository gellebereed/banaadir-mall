"use server";

/**
 * Filing products off the "Needs a category" shelf — one supplier grouping
 * of one store at a time — and remembering the decision so that store's
 * next import files those products itself. See lib/category-mappings.ts.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProducts, getCategories } from "@/lib/api";
import { HOLDING_SLUG, saveCategoryMappings } from "@/lib/category-mappings";
import { mutateDB } from "@/lib/db";
import { categoryKey } from "@/lib/import/categories";
import { classifyProduct } from "@/lib/product-classify";
import { primaryImage } from "@/lib/product-utils";
import { getSession } from "@/lib/session";
import { updateProductFields } from "@/lib/supabase/mutations";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";

export interface FileState {
  ok?: string;
  error?: string;
}

export async function fileHeldProducts(
  store: string,
  grouping: string,
  category: string,
): Promise<FileState> {
  const session = await getSession();
  if (session?.role !== "admin") return { error: "Only the marketplace team can file these." };

  const target = (await getCategories(true)).find((c) => c.slug === category);
  if (!target || target.slug === HOLDING_SLUG) return { error: "Choose a category to file them in." };

  const held = (await getBaseProducts()).filter(
    (p) => p.category === HOLDING_SLUG && p.store === store && (p.supplier?.grouping ?? "") === grouping,
  );
  if (held.length === 0) return { error: "Nothing left to file here — reload the page." };

  let moved = 0;
  for (const product of held) {
    const ok = await updateProductFields(product.id, { category: target.slug });
    if (!ok) {
      await mutateDB((db) => {
        const created = db.newProducts.find((p) => p.id === product.id);
        if (created) created.category = target.slug;
        else db.productOverrides[product.id] = { ...db.productOverrides[product.id], category: target.slug };
      });
    }
    moved++;
  }

  if (grouping) {
    await saveCategoryMappings([
      { store, sourceKey: categoryKey(grouping), sourceName: grouping, category: target.slug },
    ]);
  }
  await logActivity(
    store,
    "category.file",
    `Filed ${moved} product${moved === 1 ? "" : "s"}${grouping ? ` from "${grouping}"` : ""} into ${target.name}`,
    target.slug,
  );

  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/admin/categories");
  return {
    ok: `Filed ${moved} product${moved === 1 ? "" : "s"} into ${target.name}.${grouping ? " Future imports from this store will do this automatically." : ""}`,
  };
}

export interface HeldSuggestion {
  slug?: string;
  name?: string;
  reason?: string;
  error?: string;
}

/**
 * Claude's choice of category for one waiting group, from its supplier
 * grouping, up to ten of its product names and the first one's photo.
 * One AI call — the page asks group by group — and nothing is filed: the
 * answer only pre-selects the dropdown for the admin to confirm.
 */
export async function suggestHeldCategory(store: string, grouping: string): Promise<HeldSuggestion> {
  const session = await getSession();
  if (session?.role !== "admin") return { error: "Only the marketplace team can do this." };

  const held = (await getBaseProducts()).filter(
    (p) => p.category === HOLDING_SLUG && p.store === store && (p.supplier?.grouping ?? "") === grouping,
  );
  if (held.length === 0) return { error: "Nothing left here — reload the page." };

  const photo = held.map(primaryImage).find((url) => url?.startsWith("https://"));
  const categories = await getCategories(true);
  const result = await classifyProduct(
    {
      name: grouping || held[0].name,
      description: `A supplier's product group${grouping ? ` called "${grouping}"` : ""}. Products in it: ${held
        .slice(0, 10)
        .map((p) => p.name)
        .join("; ")}`,
      image: photo,
    },
    categories,
  );
  const slug = result.category?.slug;
  return {
    slug,
    name: categories.find((c) => c.slug === slug)?.name,
    reason: result.category?.reason,
    error: result.error ?? (slug ? undefined : "No confident match — choose one yourself."),
  };
}
