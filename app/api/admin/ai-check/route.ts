/**
 * AI CHECK — /api/admin/ai-check, admins only.
 *
 * Asks the configured model one small test question and shows its reply
 * verbatim, with the provider, model and endpoint in use. "No confident
 * suggestion" in the editor can mean the model had no idea, or that it
 * answered in a shape we could not read; this tells the two apart without
 * digging through Netlify's function logs. Nothing is saved.
 */

import { aiDiagnose } from "@/lib/ai";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Not allowed", { status: 403 });
  const result = await aiDiagnose();
  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
