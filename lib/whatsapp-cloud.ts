/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHATSAPP CLOUD API — sending a message without a person tapping "send".
 * ─────────────────────────────────────────────────────────────────────────
 * Everything else in this app that says "WhatsApp" opens the app with a
 * message written (lib/whatsapp.ts) and leaves a human to press send. That
 * needs no account and costs nothing, but it only happens if somebody
 * remembers. This is the other way: Meta's WhatsApp Business Platform,
 * which sends from the marketplace's own business number.
 *
 * It is OFF until three things exist, and stays off without complaint:
 *
 *   WHATSAPP_CLOUD_TOKEN       a permanent access token for the business
 *   WHATSAPP_CLOUD_PHONE_ID    the sending number's Phone Number ID
 *   WHATSAPP_ALERT_TEMPLATE    an APPROVED template's name
 *
 * The template matters. WhatsApp lets a business start a conversation only
 * with a message Meta has approved in advance, so free text cannot be sent
 * here. Create a "Utility" template whose body has three variables:
 *
 *   Hello, this is Banaadir Mall. You asked us to tell you: {{1}}.
 *   From {{2}}. Order it here: {{3}}
 *
 * ({{1}} "Zahra Abaya is back in stock", {{2}} the shop, {{3}} the link.)
 * Its language is WHATSAPP_ALERT_LANG, default "en". Meta bills each
 * message sent this way.
 *
 * Server-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

const TOKEN = process.env.WHATSAPP_CLOUD_TOKEN ?? "";
const PHONE_ID = process.env.WHATSAPP_CLOUD_PHONE_ID ?? "";
const TEMPLATE = process.env.WHATSAPP_ALERT_TEMPLATE ?? "";
const LANG = process.env.WHATSAPP_ALERT_LANG || "en";
const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0";

/** Are all three settings present? Nothing is sent, or attempted, otherwise. */
export function cloudWhatsAppConfigured(): boolean {
  return Boolean(TOKEN && PHONE_ID && TEMPLATE);
}

/** Send the alert template to one number. Never throws. */
export async function sendAlertTemplate(
  to: string,
  variables: [headline: string, store: string, url: string],
): Promise<{ ok: boolean; error?: string }> {
  if (!cloudWhatsAppConfigured()) return { ok: false, error: "not configured" };
  try {
    const response = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: TEMPLATE,
          language: { code: LANG },
          components: [
            {
              type: "body",
              // Template variables may not contain newlines or runs of spaces.
              parameters: variables.map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").trim() })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return { ok: true };
    const body = await response.text();
    return { ok: false, error: `${response.status} ${body.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
