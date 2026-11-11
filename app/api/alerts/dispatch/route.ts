import { NextResponse } from "next/server";
import { dispatchDueAlerts } from "@/lib/alert-dispatch";

/**
 * GET /api/alerts/dispatch — send every alert whose moment has come.
 *
 * For a scheduler to call every few minutes (a Netlify scheduled function,
 * cron-job.org, an uptime pinger): it catches the alerts that come due
 * without anyone opening a product editor — a stock upload, a promotion
 * that started on its schedule.
 *
 * Protected by ALERTS_CRON_SECRET, sent as `Authorization: Bearer <secret>`
 * or `?key=<secret>`. With no secret set the endpoint refuses everyone: an
 * open URL that makes the shop message its customers is not a default.
 * It does nothing at all until the WhatsApp Cloud API is configured
 * (lib/whatsapp-cloud.ts) — sellers send by hand from /vendor/alerts.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.ALERTS_CRON_SECRET;
  const given =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("key") ??
    "";
  if (!secret || given !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await dispatchDueAlerts();
  return NextResponse.json({ ok: true, ...result });
}
