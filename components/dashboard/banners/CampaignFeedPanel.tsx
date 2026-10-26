"use client";

import { useState, useTransition } from "react";
import { setCampaignFeed, setCampaignHidden } from "@/app/actions";
import CampaignShareButton from "@/components/CampaignShareButton";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, type CampaignKind, type ScheduleStatus } from "@/lib/campaign-utils";
import { formatShopTime } from "@/lib/shop-time";

/** One campaign as the admin panel needs it — plain data, built on the server. */
export interface CampaignRow {
  id: string;
  kind: CampaignKind;
  name: string;
  headline: string;
  status: ScheduleStatus;
  storeName?: string;
  shopCount: number;
  productCount: number;
  path: string;
  cardPath: string;
  startsAt?: string;
  endsAt?: string;
  /** Where it is on the home page right now. */
  placements: ("hero" | "tile")[];
  /** Why it is not, when it is not. */
  reason?: string;
  hidden: boolean;
}

const KIND_ICON: Record<CampaignKind, string> = { sale: "🔥", flash: "⚡", promotion: "🏷️", offer: "🎁" };

/**
 * The automatic half of the home page: the two switches that let running
 * campaigns fill the hero and the tiles, and every campaign on the
 * marketplace with where it is showing — or the reason it isn't — and its
 * shareable link. The admin's veto is per campaign (hide this one), not
 * per shop: a shop that runs one bad campaign keeps the next.
 */
export default function CampaignFeedPanel({
  hero,
  tiles,
  campaigns,
}: {
  hero: boolean;
  tiles: boolean;
  campaigns: CampaignRow[];
}) {
  const [filter, setFilter] = useState<"running" | "all">("running");
  const shown = filter === "running" ? campaigns.filter((c) => c.status === "live" || c.status === "scheduled") : campaigns;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FeedSwitch
          setting="hero"
          on={hero}
          title="Campaign slides in the hero"
          detail="The site-wide sale, flash deals and the strongest shop sales get a slide after your banners."
        />
        <FeedSwitch
          setting="tiles"
          on={tiles}
          title="Campaign tiles in Today's Campaigns"
          detail="Every running campaign gets a tile after yours, up to two rows."
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-ocean-950">
          {campaigns.filter((c) => c.status === "live").length} running ·{" "}
          {campaigns.filter((c) => c.status === "scheduled").length} scheduled
        </p>
        <div className="flex rounded-full bg-sand-100 p-0.5 text-xs font-bold">
          {(["running", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 transition ${filter === f ? "bg-white text-ocean-950 shadow-sm" : "text-slate-500"}`}
            >
              {f === "running" ? "Running & upcoming" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 divide-y divide-sand-100 overflow-hidden rounded-2xl border border-sand-200 bg-white">
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nothing running. When a shop starts a sale, or you switch on the site-wide sale or flash deals, it
            appears here — and on the home page — by itself.
          </p>
        )}
        {shown.map((c) => (
          <CampaignLine key={c.id} campaign={c} />
        ))}
      </div>
    </div>
  );
}

function FeedSwitch({
  setting,
  on,
  title,
  detail,
}: {
  setting: "hero" | "tiles";
  on: boolean;
  title: string;
  detail: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() => start(async () => void (await setCampaignFeed(setting, !on)))}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        on ? "border-emerald-300 bg-emerald-50/60" : "border-sand-200 bg-white"
      } ${pending ? "opacity-60" : "hover:border-ocean-300"}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}
      >
        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
      </span>
      <span>
        <span className="block text-sm font-bold text-ocean-950">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
      </span>
    </button>
  );
}

function CampaignLine({ campaign: c }: { campaign: CampaignRow }) {
  const [pending, start] = useTransition();
  const who = c.storeName ?? (c.kind === "sale" ? `${c.shopCount} shop${c.shopCount === 1 ? "" : "s"} joined` : "Banaadir Mall");
  const when = [c.startsAt && c.status === "scheduled" ? `starts ${formatShopTime(c.startsAt)}` : "", c.endsAt ? `ends ${formatShopTime(c.endsAt)}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${pending ? "opacity-60" : ""}`}>
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-xl"
      >
        {KIND_ICON[c.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800">{c.headline}</span>
          <span className="truncate text-sm text-slate-500">· {c.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {KIND_LABEL[c.kind]} · {who} · {c.productCount} product{c.productCount === 1 ? "" : "s"}
          {when && ` · ${when}`}
        </p>
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {c.placements.includes("hero") && (
            <span className="rounded-full bg-ocean-100 px-2 py-0.5 text-[10px] font-bold text-ocean-800">Hero slide</span>
          )}
          {c.placements.includes("tile") && (
            <span className="rounded-full bg-mango-100 px-2 py-0.5 text-[10px] font-bold text-mango-800">Campaign tile</span>
          )}
          {c.placements.length === 0 && c.reason && (
            <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{c.reason}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CampaignShareButton
          path={c.path}
          cardPath={c.cardPath}
          title={c.name}
          caption={`${c.headline}${c.storeName ? ` at ${c.storeName}` : ""} — ${c.name}. Shop it on Banaadir Mall 👇`}
        />
        <a
          href={c.path}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-3 py-1.5 text-xs font-bold text-ocean-700 ring-1 ring-sand-200 transition hover:bg-sand-50"
        >
          View ↗
        </a>
        {(c.status === "live" || c.status === "scheduled") && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void (await setCampaignHidden(c.id, !c.hidden)))}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              c.hidden
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                : "bg-sand-100 text-slate-600 hover:bg-sand-200"
            }`}
          >
            {c.hidden ? "Show on home" : "Hide from home"}
          </button>
        )}
      </div>
    </div>
  );
}
