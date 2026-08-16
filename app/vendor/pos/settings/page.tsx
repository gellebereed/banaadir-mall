import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PosSettingsForm from "@/components/pos/PosSettingsForm";
import { getPosSettings } from "@/lib/api";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Counter settings" };

export default async function PosSettingsPage() {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "settings.manage")) redirect("/vendor/pos");

  const settings = await getPosSettings(storeSlug);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-extrabold text-ocean-950">
        Counter settings
      </h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        The switch, and the two numbers behind every price it suggests.
      </p>

      <div className="card p-5">
        <PosSettingsForm initial={settings} />
      </div>
    </div>
  );
}
