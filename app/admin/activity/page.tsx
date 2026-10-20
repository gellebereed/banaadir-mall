import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ActivityList from "@/components/dashboard/ActivityList";
import { getActivity } from "@/lib/activity";
import { getAllStores } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

/** Everything, across every store — or one store, via ?store=. */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "admin") redirect("/login");
  const { store } = await searchParams;
  const [entries, stores] = await Promise.all([getActivity(store || undefined, 400), getAllStores()]);
  const storeNames = Object.fromEntries(stores.map((s) => [s.slug, s.name]));

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">Activity log</h1>
      <p className="mt-1 text-sm text-slate-500">Every recorded change across Banaadir Mall.</p>
      <div className="mb-5 mt-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/activity"
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${!store ? "bg-ocean-900 text-white" : "bg-sand-100 text-slate-600 hover:bg-sand-200"}`}
        >
          All
        </Link>
        {[{ slug: "platform", name: "Marketplace" }, ...stores].map((s) => (
          <Link
            key={s.slug}
            href={`/admin/activity?store=${encodeURIComponent(s.slug)}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${store === s.slug ? "bg-ocean-900 text-white" : "bg-sand-100 text-slate-600 hover:bg-sand-200"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>
      <ActivityList entries={entries} storeNames={store ? undefined : storeNames} />
    </div>
  );
}
