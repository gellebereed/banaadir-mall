import type { Metadata } from "next";
import Link from "next/link";
import PinManager from "@/components/dashboard/discovery/PinManager";
import PromptSettingsForm from "@/components/dashboard/discovery/PromptSettingsForm";
import ShelfSettingsForm from "@/components/dashboard/discovery/ShelfSettingsForm";
import StoryManager from "@/components/dashboard/discovery/StoryManager";
import { getAllStories, getBaseProducts, getCategories, getRecoSettings, getStores } from "@/lib/api";
import { SHELF_CATALOGUE } from "@/lib/reco/catalogue";

export const metadata: Metadata = { title: "Discovery" };

export const dynamic = "force-dynamic";

/**
 * The discovery control room.
 *
 * Three things live here because they are the same job seen from three
 * angles: what the engine is allowed to show (shelves), what the
 * marketplace wants pushed regardless (pins), and what shoppers get asked
 * (prompts) — plus the guides that make a listing worth reading.
 *
 * Splitting these across four sidebar entries would hide the fact that
 * they interact: a pin is worthless on a hidden shelf, and a prompt is what
 * gives the engine the taste data the shelves rank against.
 */
export default async function AdminDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { tab = "engine", saved } = await searchParams;

  const [settings, products, stories, categories, stores] = await Promise.all([
    getRecoSettings(),
    getBaseProducts(),
    getAllStories(),
    getCategories(true),
    getStores(),
  ]);

  const livePins = settings.pins.filter((pin) => pin.active).length;
  const drafts = stories.filter((story) => !story.published).length;

  const tabs = [
    { key: "engine", label: "Engine", icon: "🎛️" },
    { key: "pins", label: "Pushes", icon: "📌", badge: livePins },
    { key: "prompts", label: "Ask shoppers", icon: "💬" },
    { key: "stories", label: "Guides", icon: "📖", badge: drafts },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Discovery</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            What the storefront recommends, what you push on top of it, and
            what shoppers get asked. Everything here goes live on save.
          </p>
        </div>
        <Link href="/" className="btn-primary !px-4 !py-2 text-sm">
          View Storefront
        </Link>
      </div>

      {saved && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
          ✓ Saved and live.
        </p>
      )}

      {!settings.enabled && tab !== "engine" && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          Recommendations are switched off, so nothing on this tab is
          currently reaching shoppers.{" "}
          <Link href="/admin/discovery?tab=engine" className="underline">
            Turn them on
          </Link>
        </p>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1 rail-scroll">
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            href={`/admin/discovery?tab=${entry.key}`}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === entry.key
                ? "bg-ocean-950 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
            }`}
          >
            <span aria-hidden>{entry.icon}</span>
            {entry.label}
            {entry.badge ? (
              <span
                className={`rounded-full px-1.5 text-[10px] font-extrabold ${
                  tab === entry.key ? "bg-mango-500 text-ocean-950" : "bg-sand-100 text-slate-500"
                }`}
              >
                {entry.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        {tab === "engine" && (
          <ShelfSettingsForm settings={settings} shelves={SHELF_CATALOGUE} />
        )}

        {tab === "pins" && (
          <PinManager
            settings={settings}
            products={products}
            shelves={SHELF_CATALOGUE}
          />
        )}

        {tab === "prompts" && <PromptSettingsForm settings={settings} />}

        {tab === "stories" && (
          <StoryManager
            stories={stories}
            products={products}
            categories={categories}
            stores={stores}
          />
        )}
      </div>
    </div>
  );
}
