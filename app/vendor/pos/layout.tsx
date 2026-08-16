import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PosSettingsForm from "@/components/pos/PosSettingsForm";
import PosTabs from "@/components/pos/PosTabs";
import { getPosSettings } from "@/lib/api";
import { may } from "@/lib/auth";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Counter", template: "%s · Counter · Banaadir Mall" },
};

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE COUNTER
 * ─────────────────────────────────────────────────────────────────────────
 * Three screens, in the order the day actually happens:
 *
 *   Pantry   what I bought        →  25 kg of flour, KES 2,500
 *   Recipes  what I make from it  →  flour + eggs + milk = 24 rolls
 *   Sell     what I sold          →  tap, total, paid, done
 *
 * ── Off unless the shop turns it on ──────────────────────────────────────
 * Most shops on a marketplace already have a till, and for them every one
 * of these screens is clutter. So the whole section is behind one switch
 * the owner controls, and this layout is where that switch is enforced —
 * once, rather than in each page.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) redirect("/vendor");

  const settings = await getPosSettings(storeSlug);

  // ── Switched off ──────────────────────────────────────────────────
  // Not a 404 and not a redirect: somebody who followed a link here is
  // interested, and the useful response is to explain what it is and offer
  // the switch — not to pretend the page does not exist.
  if (!settings.enabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-ocean-900 to-ocean-600 px-6 py-8 text-center text-white">
            <span className="text-5xl">🧾</span>
            <h1 className="mt-3 font-display text-2xl font-extrabold">
              Sell over the counter
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-ocean-100">
              For shops that do not have a till yet. Write down what you buy,
              say what a batch is made of, and it works out what each one costs
              you and what to charge — then rings up the sale.
            </p>
          </div>

          <div className="p-6">
            <ol className="space-y-4">
              {[
                {
                  icon: "🛒",
                  title: "Write down what you bought",
                  body: "“25 kg of flour, KES 2,500.” That is the whole job — it works out the cost per kilo itself.",
                },
                {
                  icon: "🥐",
                  title: "Say what one batch is made of",
                  body: "Flour + sugar + eggs + milk = 24 cinnamon rolls. It adds up what the tray costs and suggests a price.",
                },
                {
                  icon: "💵",
                  title: "Sell",
                  body: "Tap what the customer is buying, take the money, done. Stock comes off by itself.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-100 text-xl">
                    {step.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-ocean-950">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-sand-100 pt-6">
              {may(session, "settings.manage") ? (
                <PosSettingsForm initial={settings} />
              ) : (
                <p className="rounded-xl bg-sand-50 px-4 py-3 text-sm text-slate-600">
                  Ask whoever manages this store&apos;s settings to switch the
                  counter on.
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Already have a till you like?{" "}
          <Link href="/vendor" className="font-semibold text-ocean-700 hover:underline">
            Nothing here is required — go back to the dashboard.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <PosTabs canManageSettings={may(session, "settings.manage")} />
      {children}
    </div>
  );
}
