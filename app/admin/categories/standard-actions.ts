"use server";

/**
 * Linking Banaadir categories to the standard taxonomy (lib/taxonomy.ts):
 * search it, get proposals (from each category's products — read by AI
 * when configured, matched word by word otherwise),
 * and save the links the admin approves.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getBaseProducts, getCategories } from "@/lib/api";
import { HOLDING_SLUG } from "@/lib/category-holding";
import { mutateDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ALL_CACHE_TAGS } from "@/lib/supabase/public-client";
import {
  categoriesHaveStandardColumn,
  upsertCategoryInSupabase,
  useSupabaseMutations,
} from "@/lib/supabase/mutations";
import { searchStandard, standardNode } from "@/lib/taxonomy";
import { gatherEvidence } from "@/lib/taxonomy-evidence";
import { aiMatchCategories, aiMatchingAvailable } from "@/lib/taxonomy-ai";

async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "admin";
}

export interface StandardOption {
  id: string;
  path: string;
}

export async function searchStandardAction(query: string): Promise<StandardOption[]> {
  if (!(await isAdmin())) return [];
  return searchStandard(query, 30).map((n) => ({ id: n.id, path: n.path }));
}

export interface StandardProposal {
  slug: string;
  standardId: string | null;
  path?: string;
  confidence: number;
  source: "ai" | "words";
  reason: string;
}

export interface ProposeResult {
  proposals: StandardProposal[];
  error?: string;
}

/**
 * Proposals for these categories. Called in small batches by the page so
 * no single request runs long.
 */
export async function proposeStandard(slugs: string[]): Promise<ProposeResult> {
  if (!(await isAdmin())) return { proposals: [], error: "Only the marketplace admin can do this." };

  const [categories, products] = await Promise.all([getCategories(true), getBaseProducts()]);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const wanted = slugs
    .map((s) => bySlug.get(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.slug !== HOLDING_SLUG);

  // What each category holds — its products, subcategories included,
  // classified one by one (lib/taxonomy-evidence.ts).
  const evidence = wanted.map((c) => gatherEvidence(c, categories, products));

  const byWords: StandardProposal[] = evidence.map((e) => ({
    slug: e.slug,
    standardId: e.proposal.standardId,
    path: standardNode(e.proposal.standardId)?.path,
    confidence: e.proposal.confidence,
    source: "words",
    reason: e.proposal.reason,
  }));

  if (!aiMatchingAvailable()) return { proposals: byWords };

  try {
    const ai = await aiMatchCategories(
      evidence
        .filter((e) => e.candidates.length > 0)
        .map((e) => ({
          slug: e.slug,
          name: e.name,
          breadcrumb: e.breadcrumb,
          subcategories: e.subcategories,
          productCount: e.productCount,
          samples: e.samples,
          productSignals: e.signals.map((s) => `${Math.round(s.share * 100)}% ${s.path}`),
          parentLink: e.parentLink?.path,
          candidates: e.candidates,
        })),
    );
    const aiBySlug = new Map(ai.map((a) => [a.slug, a]));
    return {
      proposals: byWords.map((w) => {
        const a = aiBySlug.get(w.slug);
        if (!a) return w;
        return {
          slug: w.slug,
          standardId: a.standardId,
          path: standardNode(a.standardId)?.path,
          confidence: a.confidence,
          source: "ai",
          reason: a.reason || (a.standardId ? "" : "None of the candidates fits"),
        };
      }),
    };
  } catch (err) {
    // The product-based matches still stand; say why the AI didn't run.
    return { proposals: byWords, error: (err as Error).message };
  }
}

/** Save approved links. `standardId: null` removes a link. */
export async function linkStandard(
  links: { slug: string; standardId: string | null }[],
): Promise<{ ok?: string; error?: string }> {
  if (!(await isAdmin())) return { error: "Only the marketplace admin can do this." };

  if (useSupabaseMutations() && !(await categoriesHaveStandardColumn())) {
    return { error: "Run supabase/migration-category-standard.sql in Supabase first — links have nowhere to be saved yet." };
  }

  const categories = await getCategories(true);
  let saved = 0;
  for (const { slug, standardId } of links) {
    const category = categories.find((c) => c.slug === slug);
    if (!category) continue;
    if (standardId && !standardNode(standardId)) continue;

    if (useSupabaseMutations()) {
      const ok = await upsertCategoryInSupabase({
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        tagline: category.tagline,
        hidden: category.hidden,
        standardId,
      });
      if (!ok) return { error: `Could not save "${category.name}". Try again in a moment.` };
    } else {
      await mutateDB((db) => {
        db.categories = db.categories || [];
        const index = db.categories.findIndex((c) => c.slug === slug);
        const next = { ...category, standardId: standardId ?? undefined };
        if (index >= 0) db.categories[index] = next;
        else db.categories.push(next);
      });
    }
    saved++;
  }

  if (saved > 0) {
    await logActivity(
      "platform",
      "category.standard",
      saved === 1
        ? `Linked "${categories.find((c) => c.slug === links[0].slug)?.name}" to ${
            standardNode(links[0].standardId)?.path ?? "no standard category"
          }`
        : `Linked ${saved} categories to the standard taxonomy`,
    );
  }
  for (const tag of ALL_CACHE_TAGS) revalidateTag(tag);
  revalidatePath("/admin/categories/standard");
  return { ok: `Saved ${saved} link${saved === 1 ? "" : "s"}.` };
}
