"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  APPLYING A CATEGORY TIDY-UP
 * ─────────────────────────────────────────────────────────────────────────
 * The proposals come from lib/category-tidy.ts, an admin ticks the ones
 * they agree with, and this carries them out.
 *
 * ── The cascade, which makes this dangerous ──────────────────────────────
 * `products.category` is declared
 *
 *     REFERENCES categories(slug) ON DELETE CASCADE
 *
 * so deleting a category DELETES EVERY PRODUCT FILED UNDER IT. A merge ends
 * in a delete, which means a merge is one missed product away from erasing
 * stock. Every merge below therefore moves the products first, re-reads the
 * catalogue to prove none are left, and only then removes the empty
 * category — and if a single product refuses to move, the delete is
 * abandoned and the admin is told which one.
 *
 * A re-parent moves nothing and deletes nothing. It is a single field
 * change and is trivially reversible from the same screen, which is why it
 * is the action the tool pre-selects.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getBaseProducts, getCategories } from "@/lib/api";
import { mutateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";
import {
  deleteCategoryFromSupabase,
  updateProductFields,
  upsertCategoryInSupabase,
  useSupabaseMutations,
} from "@/lib/supabase/mutations";
import type { TidyAction } from "@/lib/category-tidy";
import type { Category } from "@/lib/types";

export interface TidyState {
  ok: boolean;
  message: string;
  /** One line per thing that happened, shown as a receipt. */
  details: string[];
}

interface Decision {
  slug: string;
  action: TidyAction;
  targetSlug: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");
  return session;
}

export async function applyCategoryTidy(
  _prev: TidyState,
  formData: FormData,
): Promise<TidyState> {
  await requireAdmin();

  let decisions: Decision[] = [];
  try {
    decisions = JSON.parse(String(formData.get("decisionsJson") ?? "[]"));
  } catch {
    decisions = [];
  }

  if (decisions.length === 0) {
    return { ok: false, message: "Nothing was ticked.", details: [] };
  }

  const categories = await getCategories(true);
  const bySlug = new Map(categories.map((category) => [category.slug, category]));

  const details: string[] = [];
  let moved = 0;
  let merged = 0;
  let failed = 0;

  for (const decision of decisions) {
    const stray = bySlug.get(decision.slug);
    const target = bySlug.get(decision.targetSlug);

    if (!stray || !target) {
      failed++;
      details.push(`✕ ${decision.slug} — it or its destination no longer exists.`);
      continue;
    }

    // Guard against the obvious catastrophes, cheaply, right here: a
    // category cannot become its own parent, and a parent cannot be moved
    // inside its own child.
    if (stray.slug === target.slug || target.parentSlug === stray.slug) {
      failed++;
      details.push(`✕ ${stray.name} — that move would create a loop.`);
      continue;
    }

    if (decision.action === "reparent") {
      const ok = await saveParent(stray, target.slug);
      if (ok) {
        moved++;
        details.push(`→ ${stray.name} moved into ${target.name}.`);
      } else {
        failed++;
        details.push(`✕ ${stray.name} could not be moved.`);
      }
      continue;
    }

    // ── Merge ───────────────────────────────────────────────────────
    const products = (await getBaseProducts()).filter(
      (product) => product.category === stray.slug,
    );

    let stuck = 0;
    for (const product of products) {
      const ok = await updateProductFields(product.id, { category: target.slug });
      if (ok) continue;

      if (useSupabaseMutations()) {
        stuck++;
      } else {
        await mutateDB((db) => {
          db.productOverrides[product.id] = {
            ...db.productOverrides[product.id],
            category: target.slug,
          };
        });
      }
    }

    if (stuck > 0) {
      failed++;
      details.push(
        `✕ ${stray.name} — ${stuck} of ${products.length} products would not move, ` +
          `so it was left alone rather than deleted.`,
      );
      continue;
    }

    /*
     * Prove it is empty before deleting.
     *
     * Not a formality. This is the last moment before an irreversible
     * delete that takes its products with it, and the check costs one
     * re-read of a list already in memory.
     */
    revalidateTag("bm:products");
    const remaining = (await getBaseProducts()).filter(
      (product) => product.category === stray.slug,
    ).length;

    if (remaining > 0) {
      failed++;
      details.push(
        `✕ ${stray.name} still has ${remaining} product${remaining === 1 ? "" : "s"} ` +
          `in it — not deleted.`,
      );
      continue;
    }

    const deleted = useSupabaseMutations()
      ? await deleteCategoryFromSupabase(stray.slug)
      : true;

    if (!deleted) {
      failed++;
      details.push(`✕ ${stray.name} is empty but could not be removed.`);
      continue;
    }

    await mutateDB((db) => {
      db.categories = (db.categories ?? []).filter((c) => c.slug !== stray.slug);
    });

    merged++;
    details.push(
      `✓ ${stray.name} merged into ${target.name}` +
        (products.length > 0
          ? ` — ${products.length} product${products.length === 1 ? "" : "s"} moved.`
          : "."),
    );
  }

  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/", "layout");

  const done = moved + merged;
  return {
    ok: failed === 0 && done > 0,
    message:
      done === 0
        ? "Nothing could be applied."
        : `Tidied ${done} categor${done === 1 ? "y" : "ies"}` +
          (merged > 0 ? ` — ${merged} merged, ${moved} moved` : "") +
          (failed > 0 ? `. ${failed} needs a look.` : "."),
    details,
  };
}

/**
 * Re-parent one category, preserving everything else about it.
 *
 * The whole record goes back, not just the slug and the new parent.
 * `upsertCategoryInSupabase` writes every column it is given, so passing a
 * partial one moves the category and quietly blanks its tagline, its cover
 * photo and its hidden flag — a tidy-up that erases the artwork somebody
 * chose is not a tidy-up.
 */
async function saveParent(category: Category, parentSlug: string): Promise<boolean> {
  if (useSupabaseMutations()) {
    return upsertCategoryInSupabase({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      tagline: category.tagline ?? "",
      hidden: category.hidden,
      image: category.image ?? null,
      parentSlug,
    });
  }

  let found = false;
  await mutateDB((db) => {
    db.categories = (db.categories ?? []).map((existing) => {
      if (existing.slug !== category.slug) return existing;
      found = true;
      return { ...existing, parentSlug };
    });
  });
  return found;
}
