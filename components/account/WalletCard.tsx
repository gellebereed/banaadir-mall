import Link from "next/link";
import { money } from "@/lib/format";
import type { T } from "@/lib/i18n";
import type { Wallet } from "@/lib/rewards";
import type { RewardSettings } from "@/lib/types";

/**
 * THE WALLET — the first card on the account page.
 *
 * First, because it is the one thing here that is a reason to shop again
 * rather than a record of having shopped. The balance leads; the pending
 * amount sits right under it, since "more is coming when your parcel
 * arrives" is what keeps somebody checking back.
 *
 * Shown only while the programme is running or the customer still holds
 * credit — an empty wallet for a scheme that is switched off is clutter.
 */
export default function WalletCard({
  wallet,
  settings,
  storeNames,
  t,
}: {
  wallet: Wallet;
  settings: RewardSettings;
  /** slug → display name, for the history rows. */
  storeNames: Record<string, string>;
  t: T;
}) {
  const holdsCredit = wallet.available > 0 || wallet.pending > 0;
  if (!settings.active && !holdsCredit) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-mango-400 to-mango-300 px-5 py-5 text-ocean-950">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em]">🎁 {t("rewards.title")}</p>
          <p className="mt-1 font-display text-4xl font-extrabold leading-none tabular-nums">{money(wallet.available)}</p>
          <p className="mt-1 text-xs font-semibold">{t("rewards.balance")}</p>
        </div>
        <Link href="/products" className="rounded-full bg-ocean-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-ocean-800">
          {t("nav.allProducts")} →
        </Link>
      </div>

      <div className="space-y-3 px-5 py-4">
        {wallet.pending > 0 && (
          <p className="rounded-xl bg-mango-50 px-3 py-2 text-sm font-semibold text-mango-900">
            ⏳ {t("rewards.pending", { amount: money(wallet.pending) })}
          </p>
        )}
        {settings.active && (
          <p className="text-xs text-slate-500">
            {t("rewards.how", { pct: settings.earnPct, max: settings.maxSpendPct })}
            {!holdsCredit && wallet.history.length === 0 && <> {t("rewards.empty")}</>}
          </p>
        )}

        {wallet.history.length > 0 && (
          <ul className="divide-y divide-sand-100 border-t border-sand-100">
            {wallet.history.slice(0, 6).map((entry) => (
              <li key={entry.orderId} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-700">
                    {storeNames[entry.store] ?? entry.store.replace(/-/g, " ")}
                  </span>
                  <span className="text-slate-400">
                    {entry.orderId} · {entry.date}
                  </span>
                </span>
                <span className="shrink-0 text-right font-bold tabular-nums">
                  {entry.earn > 0 && (
                    <span className={`block ${entry.state === "available" ? "text-emerald-700" : "text-mango-700"}`}>
                      +{money(entry.earn)}
                      {entry.state === "pending" && <span className="font-medium"> · {t("rewards.onTheWay")}</span>}
                    </span>
                  )}
                  {entry.spent > 0 && <span className="block text-slate-500">−{money(entry.spent)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
