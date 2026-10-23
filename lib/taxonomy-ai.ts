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
  /** "Men's Fashion / Shirts" — where it sits in our menu. */
  breadcrumb: string;
  subcategories: string[];
  productCount: number;
  /** A spread of product names from inside it and its subcategories. */
  samples: string[];
  /** "80% Apparel › Clothing › Clothing Tops" — what the products matched, by share. */
  productSignals: string[];
  /** The standard node its parent category is linked to. */
  parentLink?: string;
  candidates: { id: string; path: string }[];
}

export interface AiMatch {
  slug: string;
  /** null = none of the candidates fits. */
  standardId: string | null;
  confidence: number;
  reason: string;
}

const SYSTEM = `You link an online marketplace's product categories to a standard product taxonomy (Shopify's).

For each category you get: its name and place in the marketplace's menu, its subcategories, a sample of the products inside it (subcategories included), how a word matcher classified those products (share of products per taxonomy node), the taxonomy node its parent category is linked to, and candidate taxonomy nodes.

Decide what the category CONTAINS, then choose the candidate that describes it:
- The products are the evidence; the name is only a hint. Supplier names are often vague or coded ("Solids", "Uppers", "Big pieces", "5 Pockets") — judge by the products.
- Choose the MOST SPECIFIC node that covers nearly all of the products. If they are shirts and T-shirts, that is Clothing Tops, not Shirts. If they are all shirts, it is Shirts, not Clothing.
- The word matcher's shares are a rough guide and can be wrong on individual words ("Boxer" briefs are underwear, not swimwear); correct them using the product names.
- A child category normally sits inside its parent's linked node. Leave it only when the products clearly belong elsewhere.
- Gender and age words ("Men's", "Women's") don't need a matching node: in this taxonomy gender is an attribute.
- A broad department ("Home & Living") maps to the broad node (Home & Garden).
- If no candidate fits, return an empty standard_id. Never invent an id.
- confidence is 0-100: 90+ only when the products leave no real doubt.
- reason: one short sentence for the person approving it, naming what the products are.`;

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
