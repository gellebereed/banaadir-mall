/**
 * ─────────────────────────────────────────────────────────────────────────
 *  AI PROVIDER — one JSON question, answered by Qwen or by Claude.
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only. Every AI feature here (the ✨ category and attribute
 * suggestions, the admin's category filing and standard-taxonomy matching)
 * asks the same kind of question: here is some text, maybe a photo, and a
 * JSON schema — choose. So they all go through aiJson() and none of them
 * knows which company answers.
 *
 *   DASHSCOPE_API_KEY set   → Alibaba Cloud Model Studio (Qwen)
 *   ANTHROPIC_API_KEY set   → Anthropic (Claude)
 *   neither                 → aiAvailable() is false; callers use words
 *
 * When both are set, AI_PROVIDER=alibaba|anthropic picks; otherwise
 * Alibaba wins, being the one added on purpose later.
 *
 * Whatever comes back is only a suggestion: every caller re-checks the
 * answer against the options it offered, so a model that ignores the
 * schema can produce a bad suggestion but never a bad record.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Anthropic from "@anthropic-ai/sdk";

type Provider = "alibaba" | "anthropic";

function provider(): Provider | undefined {
  const alibaba = Boolean(process.env.DASHSCOPE_API_KEY);
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const preferred = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (preferred === "anthropic" && anthropic) return "anthropic";
  if (preferred === "alibaba" && alibaba) return "alibaba";
  if (alibaba) return "alibaba";
  if (anthropic) return "anthropic";
  return undefined;
}

export function aiAvailable(): boolean {
  return provider() !== undefined;
}

/**
 * Serverless functions are cut off after ~10 seconds (Netlify's default),
 * so every question has to be answered inside one deadline — retries
 * included.
 */
const DEADLINE_MS = 9_000;

export interface AiQuestion {
  system: string;
  text: string;
  /** A data:image/…;base64 URL or an https:// URL. */
  image?: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

/** What the provider sent back, before parsing. */
interface RawAnswer {
  text: string | undefined;
  /** "schema" = strict JSON schema; "object" = plain JSON, schema in the prompt. */
  mode: "schema" | "object";
  /** The provider's own reason for stopping ("stop", "content_filter", "refusal"…). */
  finish: string | undefined;
}

/** The parsed answer, or undefined when the model declined or broke format. */
export async function aiJson<T>(question: AiQuestion): Promise<T | undefined> {
  const chosen = provider();
  if (!chosen) return undefined;
  let raw: RawAnswer;
  try {
    raw = chosen === "alibaba" ? await askQwen(question) : await askClaude(question);
  } catch (err) {
    throw friendlyAiError(err);
  }
  const parsed = parse<T>(raw.text);
  if (parsed === undefined) {
    // Without this an unusable answer is indistinguishable from "the AI had
    // no idea" — the seller sees "no confident suggestion" and the server
    // log says nothing. Netlify → Logs → Functions shows this line.
    console.warn(
      `[ai] ${chosen} answer could not be used (mode=${raw.mode}, finish=${raw.finish}):`,
      (raw.text ?? "<empty>").slice(0, 500),
    );
  }
  return parsed;
}

export interface AiDiagnosis {
  provider: Provider | "none";
  model?: string;
  endpoint?: string;
  ok: boolean;
  mode?: RawAnswer["mode"];
  finish?: string;
  /** The model's reply, verbatim. */
  raw?: string;
  parsed?: unknown;
  error?: string;
  ms?: number;
}

/**
 * One tiny question, with the raw reply — so an admin can see what the
 * configured model actually returns without reading server logs. Used by
 * /api/admin/ai-check.
 */
export async function aiDiagnose(): Promise<AiDiagnosis> {
  const chosen = provider();
  if (!chosen) return { provider: "none", ok: false, error: "No AI key is set (DASHSCOPE_API_KEY or ANTHROPIC_API_KEY)." };
  const info =
    chosen === "alibaba"
      ? { model: qwenModel(), endpoint: qwenBase() }
      : { model: CLAUDE_MODEL, endpoint: "api.anthropic.com" };
  const question: AiQuestion = {
    system: "You file products into an online marketplace's categories. Choose the category for the product, and pick its fabric.",
    text: JSON.stringify({
      product: { name: "Men's 100% cotton long-sleeve shirt", description: "Classic fit, button-down collar." },
      categories: [
        { slug: "mens-shirts", category: "Men's Fashion / Shirts" },
        { slug: "womens-dresses", category: "Women's Fashion / Dresses" },
        { slug: "kitchen", category: "Home / Kitchen" },
      ],
      fabrics: ["cotton = Cotton", "polyester = Polyester", "wool = Wool"],
    }),
    schema: {
      type: "object",
      properties: {
        category_slug: { type: "string", enum: ["mens-shirts", "womens-dresses", "kitchen"] },
        fabric: { type: "array", items: { type: "string", enum: ["cotton", "polyester", "wool"] } },
      },
      required: ["category_slug", "fabric"],
      additionalProperties: false,
    },
    maxTokens: 300,
  };
  const started = Date.now();
  try {
    const raw = chosen === "alibaba" ? await askQwen(question) : await askClaude(question);
    const parsed = parse(raw.text);
    return {
      provider: chosen,
      ...info,
      ok: parsed !== undefined,
      mode: raw.mode,
      finish: raw.finish,
      raw: raw.text,
      parsed,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { provider: chosen, ...info, ok: false, error: friendlyAiError(err).message, ms: Date.now() - started };
  }
}

function parse<T>(text: string | undefined | null): T | undefined {
  if (!text) return undefined;
  // A model in plain-JSON mode sometimes wraps its answer in a code fence,
  // or adds a sentence before it — so take the outermost {...}.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

// ── Alibaba Cloud Model Studio (Qwen) ─────────────────────────────────

/**
 * Model Studio's API keys belong to one region, and so does the endpoint:
 * a Singapore key sent to the Beijing URL is "invalid". International
 * (Singapore) is the default; QWEN_BASE_URL switches it —
 *   https://dashscope-us.aliyuncs.com/compatible-mode/v1   (US, Virginia)
 *   https://dashscope.aliyuncs.com/compatible-mode/v1      (China, Beijing)
 */
const QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Qwen3.7-Plus: Alibaba's recommended general model, and it reads photos,
 * which is what tells a V-neck from a crew neck. QWEN_MODEL overrides it —
 * qwen3.7-flash is the cheaper, faster choice if suggestions time out.
 */
const QWEN_MODEL = "qwen3.7-plus";

function qwenModel(): string {
  return process.env.QWEN_MODEL?.trim() || QWEN_MODEL;
}

function qwenBase(): string {
  return (process.env.QWEN_BASE_URL?.trim() || QWEN_BASE_URL).replace(/\/+$/, "");
}

class QwenError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function askQwen(q: AiQuestion): Promise<RawAnswer> {
  const deadline = Date.now() + DEADLINE_MS;
  const content = q.image
    ? [
        { type: "image_url", image_url: { url: q.image } },
        { type: "text", text: q.text },
      ]
    : q.text;

  const request = (format: "schema" | "object") => ({
    model: qwenModel(),
    max_tokens: q.maxTokens ?? 4000,
    // Choosing among offered options needs no reasoning trace, a seller is
    // waiting, and structured output is refused in thinking mode anyway.
    enable_thinking: false,
    messages: [
      {
        role: "system",
        // JSON-object mode requires the word "JSON" in the prompt, and has
        // no schema of its own — so the schema travels in the prompt.
        content:
          format === "schema"
            ? q.system
            : `${q.system}\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(q.schema)}`,
      },
      { role: "user", content },
    ],
    response_format:
      format === "schema"
        ? { type: "json_schema", json_schema: { name: "answer", strict: true, schema: q.schema } }
        : { type: "json_object" },
  });

  try {
    return { ...(await postQwen(request("schema"), deadline)), mode: "schema" };
  } catch (err) {
    /*
     * Strict JSON-schema output is supported by some Qwen models and not
     * others, and the list moves with every release. Rather than pin the
     * importer to one model, a model that refuses the schema is asked
     * again in plain JSON mode — the 400 comes back at once, so there is
     * time — and the callers' own checks do what the schema would have.
     */
    if (err instanceof QwenError && err.status === 400 && /response_format|json_schema|schema/i.test(err.message)) {
      return { ...(await postQwen(request("object"), deadline)), mode: "object" };
    }
    throw err;
  }
}

async function postQwen(body: unknown, deadline: number): Promise<Omit<RawAnswer, "mode">> {
  const base = qwenBase();
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error("The AI took too long to answer. Try again, or fill this in yourself.");
    }
    throw new Error("Could not reach the AI service. Check the connection and try again.");
  }

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: {
      message?: { content?: string | { type?: string; text?: string }[] | null };
      finish_reason?: string;
    }[];
    error?: { message?: string; code?: string };
    message?: string;
  };
  if (!response.ok) {
    throw new QwenError(response.status, payload.error?.message ?? payload.message ?? response.statusText);
  }
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  // Multimodal models can answer with a list of parts instead of a string.
  const text = Array.isArray(content)
    ? content.map((part) => part?.text ?? "").join("")
    : (content ?? undefined);
  // Alibaba's content moderation ends a reply with "content_filter"; the
  // text is then cut short and fails to parse, which is the right outcome.
  return { text, finish: choice?.finish_reason };
}

// ── Anthropic (Claude) ────────────────────────────────────────────────

const CLAUDE_MODEL = "claude-opus-5-5";

async function askClaude(q: AiQuestion): Promise<RawAnswer> {
  const client = new Anthropic({ timeout: DEADLINE_MS, maxRetries: 0 });
  const image = claudeImage(q.image);
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: q.maxTokens ?? 4000,
    // A declined request is re-run on Anthropic's recommended fallback
    // model instead of coming back empty.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Choosing among offered options: low effort is plenty, and a seller
    // is waiting on the answer.
    output_config: { effort: "low", format: { type: "json_schema", schema: q.schema } },
    system: q.system,
    messages: [{ role: "user", content: image ? [image, { type: "text", text: q.text }] : q.text }],
  });
  const block = response.content.find((b) => b.type === "text");
  return {
    // A refusal's text is an explanation, not the answer.
    text: response.stop_reason === "refusal" || !block || block.type !== "text" ? undefined : block.text,
    mode: "schema",
    finish: response.stop_reason ?? undefined,
  };
}

function claudeImage(image?: string): Anthropic.Beta.BetaImageBlockParam | undefined {
  if (!image) return undefined;
  const data = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (data) {
    return {
      type: "image",
      source: { type: "base64", media_type: `image/${data[1]}` as "image/jpeg", data: data[2] },
    };
  }
  return { type: "image", source: { type: "url", url: image } };
}

// ── Errors ────────────────────────────────────────────────────────────

/** A provider error as a sentence an admin or seller can act on. */
export function friendlyAiError(err: unknown): Error {
  if (err instanceof QwenError) {
    if (err.status === 401 || err.status === 403) {
      return new Error(
        "The Alibaba Cloud API key was rejected — check DASHSCOPE_API_KEY in Netlify, and that QWEN_BASE_URL is the region the key was created in.",
      );
    }
    if (err.status === 429) return new Error("The AI service is busy (rate limited). Wait a minute and try again.");
    return new Error(`The AI service returned an error (${err.status}): ${err.message}`);
  }
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
