/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRODUCT CLASSIFIER — which category, and which attributes? Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 * Suggestions for the product editor's "✨ Suggest" button, from the
 * product's name, description and (when given) its cover photo:
 *
 *   1. the Banaadir category it belongs in, unless the seller already
 *      chose one;
 *   2. values for that category's standard attributes (Fabric, Neckline…).
 *
 * With ANTHROPIC_API_KEY, Claude reads all of it, the photo included — a
 * neckline or a pattern is rarely written down but always visible. Without
 * it, word matching does what text alone allows. Either way the seller
 * applies a suggestion or ignores it; nothing is saved by this file.
 *
 * Claude can only CHOOSE: categories from our list, values from the
 * attribute's fixed list (enforced by the response schema and checked
 * again after).
 * ─────────────────────────────────────────────────────────────────────────
 */

import Anthropic from "@anthropic-ai/sdk";
import { HOLDING_SLUG } from "./category-holding";
import { categoryKey } from "./import/categories";
import { standardCandidates, standardNode } from "./taxonomy";
import { aiMatchingAvailable, friendlyAiError } from "./taxonomy-ai";
import { attributesForStandard, cleanAttributes, FROM_VARIANTS, type AttributeDef } from "./taxonomy-attributes";
import type { Category } from "./types";

export interface ClassifyInput {
  name: string;
  description: string;
  /** The seller's choice, when made — then only attributes are suggested. */
  category?: string;
  /** Cover photo: a small JPEG data URL, or an https URL of a stored photo. */
  image?: string;
}

export interface ClassifyResult {
  category?: { slug: string; reason: string };
  attributes: Record<string, string[]>;
  source: "ai" | "words";
  /** Set when the AI was configured but failed; the word suggestions stand. */
  error?: string;
}

/** The categories a seller can file into, with what each one means. */
function choices(categories: Category[]) {
  return categories.filter((c) => c.slug !== HOLDING_SLUG && !c.hidden);
}

export async function classifyProduct(input: ClassifyInput, categories: Category[]): Promise<ClassifyResult> {
  const name = input.name.trim().slice(0, 200);
  const description = input.description.trim().slice(0, 1500);
  const options = choices(categories);
  const chosen = input.category ? options.find((c) => c.slug === input.category) : undefined;

  // Words first: they are the fallback, and they cost nothing.
  const wordCategory = chosen ? undefined : categoryByWords(name, description, options, categories);
  const target = chosen ?? options.find((c) => c.slug === wordCategory?.slug);
  const words: ClassifyResult = {
    category: wordCategory,
    attributes: target ? attributesByWords(name, description, editable(target)) : {},
    source: "words",
  };
  if (!aiMatchingAvailable()) return words;

  /*
   * ONE model call per click, with a deadline: serverless functions are cut
   * off after ~10 seconds (Netlify's default), and two calls in a row could
   * cross it. So without a category the AI picks the category and the
   * attributes come from words; once the category is set, the next click
   * asks the AI for attributes, photo included.
   */
  try {
    const client = new Anthropic({ timeout: 9_000, maxRetries: 0 });
    const image = imageBlock(input.image);
    if (!chosen) {
      const picked = await aiCategory(client, name, description, image, options, categories);
      const category = options.find((c) => c.slug === picked?.slug);
      if (!category) return { ...words, source: "ai" };
      return {
        category: { slug: category.slug, reason: picked!.reason },
        attributes: attributesByWords(name, description, editable(category)),
        source: "ai",
      };
    }
    const attrs = editable(chosen);
    return {
      attributes: attrs.length ? await aiAttributes(client, name, description, image, chosen, attrs) : {},
      source: "ai",
    };
  } catch (err) {
    return { ...words, error: friendlyAiError(err).message };
  }
}

/** Colour and size come from variants; the rest is the seller's to fill. */
function editable(category: Category): AttributeDef[] {
  return attributesForStandard(category.standardId).filter((a) => !FROM_VARIANTS.has(a.handle));
}

// ── Words ─────────────────────────────────────────────────────────────

const WOMEN = /\b(women|womens|woman|ladies|lady|female|girls?|dumar|kadın|kadin|bayan)\b/i;
const MEN = /\b(men|mens|man|gents?|male|boys?|rag|erkek|bay)\b/i;

/**
 * The standard taxonomy finds what the product IS ("Shirts"); our tree
 * decides where that lives ("Men's Fashion", linked to Apparel). So each
 * category scores by the best candidate at or beneath its standard node —
 * deeper links count for more, being more specific — and gender words,
 * which the standard deliberately ignores, settle Men's vs Women's.
 */
function categoryByWords(name: string, description: string, options: Category[], all: Category[]) {
  const candidates = standardCandidates(name, [description.slice(0, 300)], 40, false);
  if (candidates.length === 0) return undefined;
  const text = `${name} ${description.slice(0, 300)}`;
  const wantsWomen = WOMEN.test(text);
  const wantsMen = !wantsWomen && MEN.test(text);
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  // "Dresses" under "Women's Fashion" is a women's category too.
  const genderOf = (category: Category) => {
    const names: string[] = [];
    for (let c: Category | undefined = category; c; c = c.parentSlug ? bySlug.get(c.parentSlug) : undefined) {
      names.push(c.name);
    }
    const joined = names.join(" ");
    return WOMEN.test(joined) ? "women" : MEN.test(joined) ? "men" : undefined;
  };

  let best: { slug: string; score: number } | undefined;
  for (const category of options) {
    const linked = standardNode(category.standardId);
    if (!linked) continue;
    let s = -1;
    for (const c of candidates) {
      if (c.node.id === linked.id || c.node.id.startsWith(`${linked.id}-`)) s = Math.max(s, c.score);
    }
    if (s < 0) continue;
    s += linked.depth * 5;
    // A tie-breaker between Men's and Women's, not a trump card: "perfume
    // for men" is still Beauty, not Men's Fashion.
    const gender = genderOf(category);
    if (gender && (wantsWomen || wantsMen)) s += gender === (wantsWomen ? "women" : "men") ? 12 : -12;
    if (!best || s > best.score) best = { slug: category.slug, score: s };
  }
  // The matched node's name reads oddly when the match is loose ("Non-stick
  // pan" shares a word with Stick Vacuums), so the seller sees a plain note.
  return best ? { slug: best.slug, reason: "Closest match from the product name" } : undefined;
}

/** Values whose name is written in the text: "100% cotton V-neck dress" → Cotton, V-neck. */
function attributesByWords(name: string, description: string, attrs: AttributeDef[]): Record<string, string[]> {
  const text = `${name}\n${description}`;
  const haystack = ` ${categoryKeyText(text)} `;
  const out: Record<string, string[]> = {};
  // Nobody writes "Target gender: Male"; they write "Men's".
  if (attrs.some((a) => a.handle === "target-gender")) {
    if (WOMEN.test(text)) out["target-gender"] = ["female"];
    else if (MEN.test(text)) out["target-gender"] = ["male"];
  }
  for (const attr of attrs) {
    const hits = attr.values
      .filter((v) => v.name !== "Other" && v.name.length >= 3)
      .filter((v) => haystack.includes(` ${categoryKeyText(v.name)} `))
      .map((v) => v.key);
    if (hits.length && !out[attr.handle]) out[attr.handle] = hits.slice(0, 3);
  }
  return out;
}

/** Singular, upper-case words — so "Dresses"/"dress" and "V-Neck"/"v neck" meet. */
function categoryKeyText(text: string): string {
  return text
    .split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/)
    .map((w) => categoryKey(w))
    .filter(Boolean)
    .join(" ");
}

// ── Claude ────────────────────────────────────────────────────────────

type ImageBlock = Anthropic.Beta.BetaImageBlockParam;

/** Longest value list sent as a schema enum. */
const ENUM_LIMIT = 60;

function imageBlock(image?: string): ImageBlock | undefined {
  if (!image) return undefined;
  const data = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (data && data[2].length < 1_500_000) {
    return {
      type: "image",
      source: { type: "base64", media_type: `image/${data[1]}` as "image/jpeg", data: data[2] },
    };
  }
  if (/^https:\/\/[^\s]+$/.test(image)) return { type: "image", source: { type: "url", url: image } };
  return undefined;
}

async function ask<T>(
  client: Anthropic,
  system: string,
  text: string,
  image: ImageBlock | undefined,
  schema: Record<string, unknown>,
): Promise<T | undefined> {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    // A declined request is re-run on Anthropic's recommended fallback
    // model instead of coming back empty.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Choosing among offered options: low effort is plenty, and a seller
    // is waiting on the answer.
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: image ? [image, { type: "text", text }] : text }],
  });
  if (response.stop_reason === "refusal") return undefined;
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return undefined;
  try {
    return JSON.parse(block.text) as T;
  } catch {
    return undefined;
  }
}

async function aiCategory(
  client: Anthropic,
  name: string,
  description: string,
  image: ImageBlock | undefined,
  options: Category[],
  all: Category[],
): Promise<{ slug: string; reason: string } | undefined> {
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  const list = options.map((c) => ({
    slug: c.slug,
    category: [bySlug.get(c.parentSlug ?? "")?.name, c.name].filter(Boolean).join(" / "),
    means: standardNode(c.standardId)?.path,
  }));
  const answer = await ask<{ category_slug: string; reason: string }>(
    client,
    `You file products into an online marketplace's categories. Choose the single most specific category this product belongs in, from the list given. Gender matters here: the marketplace keeps men's and women's departments apart. Answer with its slug and one short reason for the seller.`,
    JSON.stringify({ product: { name, description }, categories: list }),
    image,
    {
      type: "object",
      properties: {
        category_slug:
          options.length <= ENUM_LIMIT * 3 ? { type: "string", enum: options.map((c) => c.slug) } : { type: "string" },
        reason: { type: "string" },
      },
      required: ["category_slug", "reason"],
      additionalProperties: false,
    },
  );
  if (!answer || !options.some((c) => c.slug === answer.category_slug)) return undefined;
  return { slug: answer.category_slug, reason: answer.reason.slice(0, 200) };
}

async function aiAttributes(
  client: Anthropic,
  name: string,
  description: string,
  image: ImageBlock | undefined,
  category: Category,
  attrs: AttributeDef[],
): Promise<Record<string, string[]>> {
  // One array per attribute, limited to its own values by the schema when
  // the list is short. Long lists (Size: 80) go as plain strings — huge
  // enums make for a heavy schema — and cleanAttributes() below drops
  // anything that isn't on the list either way.
  const properties: Record<string, unknown> = {};
  for (const a of attrs) {
    properties[a.handle] = {
      type: "array",
      items: a.values.length <= ENUM_LIMIT ? { type: "string", enum: a.values.map((v) => v.key) } : { type: "string" },
    };
  }
  const answer = await ask<Record<string, string[]>>(
    client,
    `You fill in a product's standard attributes for an online marketplace, choosing values only from each attribute's list. Fill an attribute only when the name, description or photo makes it clear; leave its list empty when unsure — a wrong value hides the product from shoppers' filters. Most attributes take one value.`,
    JSON.stringify({
      product: { name, description, category: category.name },
      attributes: attrs.map((a) => ({ handle: a.handle, name: a.name, values: a.values.map((v) => `${v.key} = ${v.name}`) })),
    }),
    image,
    { type: "object", properties, required: attrs.map((a) => a.handle), additionalProperties: false },
  );
  return cleanAttributes(answer ?? {}, attrs);
}
