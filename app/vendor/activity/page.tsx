import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActivityList from "@/components/dashboard/ActivityList";
import { getActivity } from "@/lib/activity";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/** Who changed what in this store. The owner, and managers of the team. */
export default async function VendorActivityPage() {
  const { session, storeSlug } = await requireVendor();
  if (session.access && !may(session, "team.manage")) redirect("/vendor");
  const entries = await getActivity(storeSlug, 300);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-ocean-950 sm:text-3xl">Activity</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        Who changed what in your store — products, orders, team, settings and payouts. The last 300
        changes.
      </p>
      <ActivityList entries={entries} />
    </div>
  );
}
