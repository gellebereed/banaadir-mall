/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CATEGORY MAPPINGS — supplier groupings onto the marketplace's tree.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only (the suggestion helpers are pure and safe anywhere).
 *
 * ── The rule this enforces ───────────────────────────────────────────────
 * The category tree belongs to the MARKETPLACE. Only the admin adds to it.
 *
 * Imports used to create a category for every supplier grouping they had
 * not seen, filed under the department the seller picked. Every supplier
 * names things its own way, so each new store grew the shared navigation:
 * "Bedding Duvet Cover Set Kings" beside "Bed & Bath", and the tidy-up
 * tool forever cleaning up after it.
 *
 * Now a grouping is MAPPED onto an existing category:
 *   1. remembered — this store mapped it before (category_mappings)
 *   2. chosen     — the seller picks it in the import wizard, from a
 *                   suggestion worked out here
 *   3. otherwise  — the products wait in the hidden "Needs a category"
 *                   shelf, and the admin files them from /admin/categories
 * Whatever a person decides is remembered, so each supplier grouping is
 * decided once per store, not once per import.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { categoryKey } from "./import/categories";
import { getDB, mutateDB } from "./db";
import { getDataClient } from "./supabase/service";
import { isSupabaseConfigured } from "./supabase/storage";
import type { Category } from "./types";

import { HOLDING_NAME, HOLDING_SLUG } from "./category-holding";
export { HOLDING_NAME, HOLDING_SLUG, REVIEW } from "./category-holding";

export interface CategoryMapping {
  store: string;
  /** categoryKey() of the supplier's grouping — survives spelling noise. */
  sourceKey: string;
  sourceName: string;
  category: string;
}

// ── Suggestions (pure) ─────────────────────────────────────────────────

const STOP = new Set(["AND", "FOR", "THE", "WITH", "SET", "SETS", "OF"]);

function words(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/)
    .map((w) => categoryKey(w))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export interface Suggestion {
  slug: string;
  name: string;
  /** 0–100. */
  score: number;
}

/**
 * The existing category a supplier grouping most likely means.
 *
 * Same name (ignoring plurals, accents, punctuation) scores 100. Otherwise
 * it's the share of the category's words found in the grouping — "Bedding
 * Duvet Cover Set Kings" contains all of "Duvet Covers" — with a nudge for
 * categories under the department the seller picked. The holding shelf is
 * never suggested.
 */
export function suggestCategory(
  groupingName: string,
  categories: Category[],
  preferUnder?: string,
): Suggestion | undefined {
  const key = categoryKey(groupingName);
  const groupWords = words(groupingName);
  let best: Suggestion | undefined;

  const ancestors = (c: Category): string[] => {
    const out: string[] = [];
    let cur: Category | undefined = c;
    const seen = new Set<string>();
    while (cur?.parentSlug && !seen.has(cur.parentSlug)) {
      seen.add(cur.parentSlug);
      out.push(cur.parentSlug);
      cur = categories.find((x) => x.slug === cur!.parentSlug);
    }
    return out;
  };

  for (const c of categories) {
    if (c.slug === HOLDING_SLUG) continue;
    let score: number;
    if (categoryKey(c.name) === key) {
      score = 100;
    } else {
      const catWords = words(c.name);
      if (catWords.length === 0 || groupWords.length === 0) continue;
      const hits = catWords.filter((w) => groupWords.includes(w)).length;
      if (hits === 0) continue;
      // Share of the category's words present, lightly penalised when the
      // grouping is much more specific (it may belong one level down).
      score = Math.round((hits / catWords.length) * 85 - Math.max(0, groupWords.length - hits - 2) * 5);
    }
    if (preferUnder && (c.slug === preferUnder || ancestors(c).includes(preferUnder))) score += 8;
    // A deeper (more specific) category wins a tie.
    score += Math.min(ancestors(c).length, 3);
    score = Math.min(100, score);
    if (!best || score > best.score) best = { slug: c.slug, name: c.name, score };
  }
  return best && best.score >= 40 ? best : undefined;
}

// ── Remembered mappings ────────────────────────────────────────────────

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(error.message ?? "")),
  );
}

let warned = false;

/** sourceKey → category slug, for one store. */
export async function getCategoryMappings(store: string): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getDataClient()
      .from("category_mappings")
      .select("source_key, category")
      .eq("store", store);
    if (!error && data) return Object.fromEntries(data.map((r) => [r.source_key, r.category]));
    if (missingTable(error) && !warned) {
      warned = true;
      console.warn("[Categories] category_mappings table missing — run supabase/migration-category-mappings.sql.");
    }
  }
  const local = (await getDB()).categoryMappings ?? [];
  return Object.fromEntries(local.filter((m) => m.store === store).map((m) => [m.sourceKey, m.category]));
}

/** Remember these decisions. Never throws — a lost mapping is asked again next time. */
export async function saveCategoryMappings(mappings: CategoryMapping[]): Promise<void> {
  if (mappings.length === 0) return;
  if (isSupabaseConfigured()) {
    const { error } = await getDataClient()
      .from("category_mappings")
      .upsert(
        mappings.map((m) => ({
          store: m.store,
          source_key: m.sourceKey,
          source_name: m.sourceName,
          category: m.category,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "store,source_key" },
      );
    if (!error) return;
    if (!missingTable(error)) console.warn("[Categories] could not save mappings:", error.message);
  }
  await mutateDB((db) => {
    const kept = (db.categoryMappings ?? []).filter(
      (old) => !mappings.some((m) => m.store === old.store && m.sourceKey === old.sourceKey),
    );
    db.categoryMappings = [...kept, ...mappings];
  });
}

/** The holding shelf, as the category it is. Hidden from all navigation. */
export const HOLDING_CATEGORY: Category = {
  slug: HOLDING_SLUG,
  name: HOLDING_NAME,
  icon: "📥",
  tagline: "Imported products waiting for the marketplace to file them",
  art: { from: "#f1f5f9", to: "#e2e8f0" },
  hidden: true,
};
