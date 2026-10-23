/**
 * ─────────────────────────────────────────────────────────────────────────
 *  AI MATCHING — which standard category does each of ours mean?
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Optional: without an AI key (DASHSCOPE_API_KEY or
 * ANTHROPIC_API_KEY, see lib/ai.ts) the admin page uses the word matcher in
 * lib/taxonomy.ts alone.
 *
 * Word overlap finds good CANDIDATES but picks badly between them —
 * "Coffee Cups" under Home & Living overlaps "Beverages › Coffee" as much
 * as "Tableware › Drinkware". The model reads the category's name, where it
 * sits, and a few of the products inside it, and chooses among those
 * candidates (or none). It can only CHOOSE — an id it returns that wasn't
 * offered is discarded — and a person approves every link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { aiAvailable, aiJson, friendlyAiError } from "./ai";
import { standardNode } from "./taxonomy";

/** Kept under its old name: pages ask "is AI on?" through this. */
export function aiMatchingAvailable(): boolean {
  return aiAvailable();
}

export { friendlyAiError };

export interface AiMatchInput {
  slug: string;
  name: string;
  /** "Home & Living", or empty for a top-level category. */
  parent: string;
  /** A few product names from inside the category. */
  samples: string[];
  candidates: { id: string; path: string }[];
}

export interface AiMatch {
  slug: string;
  /** null = none of the candidates fits. */
  standardId: string | null;
  confidence: number;
  reason: string;
}

const SYSTEM = `You map an online marketplace's product categories onto a standard product taxonomy (Shopify's).

For each category you get its name, its parent category in the marketplace's menu, a few product names from inside it, and candidate taxonomy nodes. Choose the candidate that best describes what the category CONTAINS.

- Judge by the products when they disagree with the name: a category named "Cups" holding coffee mugs is drinkware, not coffee.
- Gender and age words in a marketplace name ("Women's Fashion", "Men's Shoes") don't need a matching node: in this taxonomy gender is an attribute, so "Men's Shoes" is simply Shoes.
- A broad department ("Home & Living") maps to the broad node (Home & Garden), not to one narrow corner of it.
- If no candidate fits, return an empty standard_id. Never invent an id.
- confidence is 0-100: 90+ only when you would not expect a human to disagree.
- reason: one short sentence for the person approving it.`;

const SCHEMA = {
  type: "object",
  properties: {
    choices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          standard_id: { type: "string" },
          confidence: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["slug", "standard_id", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["choices"],
  additionalProperties: false,
} as const;

/** One request for a batch of categories (keep batches small — ~5). */
export async function aiMatchCategories(items: AiMatchInput[]): Promise<AiMatch[]> {
  if (items.length === 0) return [];
  const parsed = await aiJson<{
    choices?: { slug: string; standard_id: string; confidence: number; reason: string }[];
  }>({
    system: SYSTEM,
    text: JSON.stringify({ categories: items }),
    schema: SCHEMA,
  });
  if (!parsed) return [];

  const offered = new Map(items.map((i) => [i.slug, new Set(i.candidates.map((c) => c.id))]));
  return (parsed.choices ?? [])
    .filter((c) => offered.has(c.slug))
    .map((c) => {
      const id = c.standard_id?.trim();
      // Only an id we offered, and one that exists, is accepted.
      const valid = id && offered.get(c.slug)!.has(id) && standardNode(id) ? id : null;
      return {
        slug: c.slug,
        standardId: valid,
        confidence: valid ? Math.max(0, Math.min(100, Math.round(c.confidence))) : 0,
        reason: c.reason?.slice(0, 300) ?? "",
      };
    });
}
