import type { Metadata } from "next";
import Link from "next/link";
import MarketingBasicsForm from "@/components/dashboard/MarketingBasicsForm";
import SectionArranger from "@/components/dashboard/SectionArranger";
import { getMarketingSettings, getStores } from "@/lib/api";

export const metadata: Metadata = { title: "Marketing" };

/**
 * The storefront control centre: section order, hero copy, the
 * announcement bar, delivery and the site-wide sale. The banners and
 * campaign tiles moved to their own page, /admin/banners, which this one
 * links to. Everything publishes to the live site immediately.
 */
export default async function AdminMarketingPage() {
  const [m, stores] = await Promise.all([getMarketingSettings(), getStores()]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Marketing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build the home page. Changes go live the moment you save.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/flash" className="btn-secondary !px-4 !py-2 text-sm">
            ⚡ Flash Deals
          </Link>
          <Link href="/" className="btn-primary !px-4 !py-2 text-sm">
            View Storefront
          </Link>
        </div>
      </div>

      {/* ── Banners & tiles moved ────────────────────────────────── */}
      <Link
        href="/admin/banners"
        className="card mt-5 flex flex-wrap items-center gap-4 p-5 transition hover:ring-2 hover:ring-ocean-200 sm:p-6"
      >
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ocean-50 text-2xl">
          🖼️
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-ocean-950">Banners, campaigns &amp; tiles</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {m.banners.filter((b) => b.active).length} banner{m.banners.filter((b) => b.active).length === 1 ? "" : "s"} on ·{" "}
            {m.promoTiles.filter((t) => t.active).length} tile{m.promoTiles.filter((t) => t.active).length === 1 ? "" : "s"} on.
            Add, schedule and reorder them — and see which running campaigns fill the home page by themselves —
            in Home banners.
          </p>
        </div>
        <span className="btn-secondary !px-4 !py-2 text-sm">Open Home banners →</span>
      </Link>

      {/* ── Section arranger ─────────────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">🧩 Home page layout</h2>
        <p className="mt-1 mb-4 text-xs text-slate-400">
          Reorder sections with ▲▼ and switch any of them off.
        </p>
        <SectionArranger initial={m.sections} />
      </section>

      {/* ── Who has joined the marketplace deals ──────────────────── */}
      <Participation
        stores={stores.map((s) => ({ slug: s.slug, name: s.name }))}
        deals={[
          { label: `🔥 ${m.campaign.name || "Site-wide sale"} (${m.campaign.pct}%)`, running: m.campaign.active, deal: m.campaign },
          { label: m.promo.code ? `🏷️ Promo code ${m.promo.code} (${m.promo.pct}%)` : "🏷️ Promo code", running: Boolean(m.promo.code), deal: m.promo },
        ]}
      />

      {/* ── Hero, announcement & campaign ────────────────────────── */}
      <div className="mt-5">
        <MarketingBasicsForm marketing={m} />
      </div>
    </div>
  );
}

/**
 * Each shop's answer to each marketplace deal. Shops are invited on their
 * own dashboard and pay for their own discount, so a deal only reaches the
 * shops listed as joined.
 */
function Participation({
  stores,
  deals,
}: {
  stores: { slug: string; name: string }[];
  deals: { label: string; running: boolean; deal: { stores?: string[]; declined?: string[] } }[];
}) {
  return (
    <section className="card mt-5 p-5 sm:p-6">
      <h2 className="font-display font-bold text-ocean-950">🤝 Shop participation</h2>
      <p className="mt-1 text-xs text-slate-400">
        Shops see an invitation on their dashboard and choose to join. Changing a deal&apos;s % asks every
        shop again.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {deals.map(({ label, running, deal }) => {
          const joined = stores.filter((s) => deal.stores?.includes(s.slug));
          const declined = stores.filter((s) => deal.declined?.includes(s.slug));
          const waiting = stores.filter((s) => !deal.stores?.includes(s.slug) && !deal.declined?.includes(s.slug));
          return (
            <div key={label} className="rounded-2xl border border-sand-200 p-4">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ocean-950">
                {label}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${running ? "bg-emerald-100 text-emerald-700" : "bg-sand-100 text-slate-500"}`}>
                  {running ? "Running" : "Off"}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {joined.length} joined · {declined.length} declined · {waiting.length} not answered
              </p>
              {[
                { title: "Joined", list: joined, tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
                { title: "Declined", list: declined, tone: "bg-sand-100 text-slate-600 ring-sand-200" },
                { title: "Not answered", list: waiting, tone: "bg-amber-50 text-amber-800 ring-amber-200" },
              ]
                .filter((g) => g.list.length > 0)
                .map((g) => (
                  <div key={g.title} className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.list.map((s) => (
                        <span key={s.slug} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${g.tone}`}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
