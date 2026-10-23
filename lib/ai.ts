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

/** The parsed answer, or undefined when the model declined or broke format. */
export async function aiJson<T>(question: AiQuestion): Promise<T | undefined> {
  const chosen = provider();
  if (!chosen) return undefined;
  try {
    return chosen === "alibaba" ? await askQwen<T>(question) : await askClaude<T>(question);
  } catch (err) {
    throw friendlyAiError(err);
  }
}

function parse<T>(text: string | undefined | null): T | undefined {
  if (!text) return undefined;
  // A model in plain-JSON mode sometimes wraps its answer in a code fence.
  const bare = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(bare) as T;
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

class QwenError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function askQwen<T>(q: AiQuestion): Promise<T | undefined> {
  const deadline = Date.now() + DEADLINE_MS;
  const content = q.image
    ? [
        { type: "image_url", image_url: { url: q.image } },
        { type: "text", text: q.text },
      ]
    : q.text;

  const request = (format: "schema" | "object") => ({
    model: process.env.QWEN_MODEL?.trim() || QWEN_MODEL,
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
    return await postQwen<T>(request("schema"), deadline);
  } catch (err) {
    /*
     * Strict JSON-schema output is supported by some Qwen models and not
     * others, and the list moves with every release. Rather than pin the
     * importer to one model, a model that refuses the schema is asked
     * again in plain JSON mode — the 400 comes back at once, so there is
     * time — and the callers' own checks do what the schema would have.
     */
    if (err instanceof QwenError && err.status === 400 && /response_format|json_schema|schema/i.test(err.message)) {
      return postQwen<T>(request("object"), deadline);
    }
    throw err;
  }
}

async function postQwen<T>(body: unknown, deadline: number): Promise<T | undefined> {
  const base = (process.env.QWEN_BASE_URL?.trim() || QWEN_BASE_URL).replace(/\/+$/, "");
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
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    error?: { message?: string; code?: string };
    message?: string;
  };
  if (!response.ok) {
    throw new QwenError(response.status, payload.error?.message ?? payload.message ?? response.statusText);
  }
  const choice = payload.choices?.[0];
  // Alibaba's content moderation ends a reply early instead of refusing.
  if (choice?.finish_reason === "content_filter") return undefined;
  return parse<T>(choice?.message?.content);
}

// ── Anthropic (Claude) ────────────────────────────────────────────────

async function askClaude<T>(q: AiQuestion): Promise<T | undefined> {
  const client = new Anthropic({ timeout: DEADLINE_MS, maxRetries: 0 });
  const image = claudeImage(q.image);
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
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
  if (response.stop_reason === "refusal") return undefined;
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? parse<T>(block.text) : undefined;
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
