/**
 * ─────────────────────────────────────────────────────────────────────────
 *  AI MATCHING — which standard category does each of ours mean?
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Optional: without ANTHROPIC_API_KEY the admin page uses the
 * word matcher in lib/taxonomy.ts alone.
 *
 * Word overlap finds good CANDIDATES but picks badly between them —
 * "Coffee Cups" under Home & Living overlaps "Beverages › Coffee" as much
 * as "Tableware › Drinkware". Claude reads the category's name, where it
 * sits, and a few of the products inside it, and chooses among those
 * candidates (or none). It can only CHOOSE — an id it returns that wasn't
 * offered is discarded — and a person approves every link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Anthropic from "@anthropic-ai/sdk";
import { standardNode } from "./taxonomy";

export function aiMatchingAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** An SDK error as a sentence an admin or seller can act on. */
export function friendlyAiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("The Anthropic API key was rejected — check ANTHROPIC_API_KEY in Netlify.");
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new Error("The AI took too long to answer. Try again, or fill this in yourself.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error("Could not reach the AI service. Check the connection and try again.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("The AI service is busy (rate limited). Wait a minute and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`The AI service returned an error (${err.status}): ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

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
  // A deadline under the ~10s serverless cut-off; the page sends small batches.
  const client = new Anthropic({ timeout: 9_000, maxRetries: 0 });

  let response;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // A declined request is re-run on Anthropic's recommended fallback
      // model instead of coming back empty.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // A classification choice among offered options: low effort is plenty.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ categories: items }) }],
    });
  } catch (err) {
    throw friendlyAiError(err);
  }

  if (response.stop_reason === "refusal") return [];
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") return [];

  let parsed: { choices?: { slug: string; standard_id: string; confidence: number; reason: string }[] };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    return [];
  }

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
