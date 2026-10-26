/**
 * ─────────────────────────────────────────────────────────────────────────
 *  CAMPAIGNS — the pieces the browser needs too.
 * ─────────────────────────────────────────────────────────────────────────
 * lib/campaigns.ts gathers the campaigns from the database and is server
 * only. The rules here (is this banner up right now, what is a campaign's
 * public link) are needed by the admin's banner editor as well, which runs
 * in the browser — so they live apart, with no server imports.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { parseShopTime, SHOP_TIME_ZONE } from "./shop-time";
import type { CampaignFeed, MarketingSettings } from "./types";

/** Where something with an on/off switch and an optional window stands. */
export type ScheduleStatus = "live" | "scheduled" | "ended" | "paused";

/**
 * The switch first, then the window. A paused banner reads as paused even
 * when its dates have passed: the switch is the thing the admin touched
 * last, so it is the answer they expect to see.
 */
export function scheduleStatus(
  item: { active: boolean; startsAt?: string; endsAt?: string },
  now = Date.now(),
): ScheduleStatus {
  if (!item.active) return "paused";
  if (item.startsAt && parseShopTime(item.startsAt) > now) return "scheduled";
  if (item.endsAt && parseShopTime(item.endsAt) < now) return "ended";
  return "live";
}

export const isScheduledLive = (item: { active: boolean; startsAt?: string; endsAt?: string }, now = Date.now()) =>
  scheduleStatus(item, now) === "live";

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  live: "Live",
  scheduled: "Scheduled",
  ended: "Ended",
  paused: "Paused",
};

export const STATUS_TONE: Record<ScheduleStatus, string> = {
  live: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-sky-100 text-sky-700",
  ended: "bg-slate-200 text-slate-600",
  paused: "bg-sand-100 text-slate-500",
};

/** The marketplace's own site-wide sale. There is only ever one. */
export const SALE_CAMPAIGN_ID = "sale";
/** The admin's flash-deal campaign (/admin/flash). Also only one. */
export const FLASH_CAMPAIGN_ID = "flash";

export type CampaignKind = "sale" | "flash" | "promotion" | "offer";

export const KIND_LABEL: Record<CampaignKind, string> = {
  sale: "Marketplace sale",
  flash: "Flash deals",
  promotion: "Shop sale",
  offer: "Shop offer",
};

/**
 * A campaign's public page.
 *
 * Flash deals and shop offers already had pages (/flash, /offer/<id>); the
 * site-wide sale and shops' price promotions get /campaign/<id>. A shop
 * that shares the site-wide sale passes its slug, so the page it sends
 * people to opens on its own products — the shop is spending its own
 * discount on this campaign, and the link should send it its customers.
 */
export function campaignPath(campaign: { id: string; kind: CampaignKind }, store?: string): string {
  if (campaign.kind === "flash") return "/flash";
  if (campaign.kind === "offer") return `/offer/${encodeURIComponent(campaign.id)}`;
  const base = `/campaign/${encodeURIComponent(campaign.id)}`;
  return store && campaign.kind === "sale" ? `${base}?store=${encodeURIComponent(store)}` : base;
}

/**
 * The link-preview card's address. `v` changes whenever what the card
 * shows changes, because WhatsApp and Facebook cache a preview image by
 * URL — without it, a shop that raised its discount from 10% to 30% would
 * keep sharing a picture that says 10%.
 */
export function campaignCardPath(
  campaign: { id: string; headline: string; name: string; status: ScheduleStatus; endsAt?: string },
  store?: string,
): string {
  const v = hash(`${campaign.headline}|${campaign.name}|${campaign.status}|${campaign.endsAt ?? ""}`);
  const params = new URLSearchParams({ v });
  if (store) params.set("store", store);
  return `/campaign/${encodeURIComponent(campaign.id)}/card?${params}`;
}

/** Short, stable, not cryptographic — a cache key, nothing more. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The feed settings with their defaults: both on, nothing hidden. */
export function campaignFeed(marketing: Pick<MarketingSettings, "campaign">): Required<CampaignFeed> {
  const feed = marketing.campaign?.feed ?? {};
  return {
    hero: feed.hero !== false,
    tiles: feed.tiles !== false,
    hidden: feed.hidden ?? [],
  };
}

/** A link the admin typed: a page on this site, or a full web address. */
export function isUsableLink(link: string): boolean {
  return /^\/(?!\/)/.test(link) || /^https?:\/\/[^\s]+$/i.test(link);
}

/** "30 Oct" in Mogadishu time — for "Ends 30 Oct" on cards and pages. */
export function shopDay(value: string): string {
  const ms = parseShopTime(value);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TIME_ZONE, day: "numeric", month: "short" }).format(ms);
}

/**
 * Suggested words for a shop to post with its campaign link. Written the
 * way a shop would say it in a WhatsApp status — the offer first, then the
 * deadline, which is what gets people to tap today rather than later.
 */
export function shareCaption(
  campaign: { kind: CampaignKind; headline: string; name: string; endsAt?: string },
  storeName?: string,
): string {
  const at = storeName ? ` at ${storeName}` : "";
  const until = campaign.endsAt ? ` Until ${shopDay(campaign.endsAt)} only!` : "";
  const icon = campaign.kind === "offer" ? "🎁" : campaign.kind === "flash" ? "⚡" : "🔥";
  return `${icon} ${campaign.headline}${at} — ${campaign.name}.${until} Shop now on Banaadir Mall 👇`;
}
