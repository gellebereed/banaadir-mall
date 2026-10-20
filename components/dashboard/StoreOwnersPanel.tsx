"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminRemoveStoreOwner,
  adminSetStoreOwner,
  type AccountActionResult,
} from "@/app/admin/accounts/actions";
import type { StoreOwnership } from "@/lib/accounts";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  STORE OWNERS — the admin confirms who owns which store.
 * ─────────────────────────────────────────────────────────────────────────
 * Ownership is only read from a field the server alone can write. Owners
 * recorded the old way (a field the user could edit) sign in as customers
 * until they are confirmed here. Each store lists the accounts that claim
 * it and why; one tap confirms the right one. Any email with an account can
 * also be assigned directly — the case where nobody claims a store yet.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function StoreOwnersPanel({ stores }: { stores: StoreOwnership[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, AccountActionResult>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});

  const unowned = stores.filter((s) => s.owners.length === 0).length;

  function run(slug: string, key: string, action: () => Promise<AccountActionResult>) {
    setBusy(key);
    startTransition(async () => {
      const res = await action();
      setResult((prev) => ({ ...prev, [slug]: res }));
      setBusy(null);
      if (res.ok) {
        setTyped((prev) => ({ ...prev, [slug]: "" }));
        router.refresh();
      }
    });
  }

  return (
    <section className="card mt-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ocean-950">Store owners</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Who opens each store&apos;s dashboard. Confirm the real owner from the accounts
            that claim the store — they get their dashboard back at their next sign-in.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            unowned ? "bg-coral-100 text-coral-700" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {unowned ? `${unowned} store${unowned === 1 ? "" : "s"} without an owner` : "✓ Every store has an owner"}
        </span>
      </div>

      <ul className="mt-5 space-y-3">
        {stores.map((store) => {
          const res = result[store.slug];
          return (
            <li
              key={store.slug}
              className={`rounded-2xl border p-4 ${
                store.owners.length ? "border-sand-200" : "border-coral-500/40 bg-coral-100/20"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-900">{store.name}</p>
                <span className="font-mono text-[11px] text-slate-400">{store.slug}</span>
                <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                  {store.status}
                </span>
              </div>

              {/* Confirmed owners */}
              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Owner</p>
                {store.owners.length === 0 ? (
                  <p className="mt-1 text-sm font-semibold text-coral-700">
                    No owner — nobody can open this store&apos;s dashboard.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {store.owners.map((email) => (
                      <li key={email} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-emerald-700">✓ {email}</span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`Remove ${email} as owner of ${store.name}? They will sign in as a customer.`)) return;
                            run(store.slug, `rm:${store.slug}:${email}`, () => adminRemoveStoreOwner(store.slug, email));
                          }}
                          className="text-xs font-semibold text-slate-400 underline hover:text-coral-600 disabled:opacity-50"
                        >
                          {busy === `rm:${store.slug}:${email}` ? "Removing…" : "Remove"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Claims */}
              {store.claims.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Claimed by — confirm the real owner
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {store.claims.map((claim) => {
                      const key = `set:${store.slug}:${claim.email}`;
                      return (
                        <li
                          key={claim.email}
                          className="flex flex-col gap-2 rounded-xl bg-sand-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 text-sm">
                            <p className="truncate font-semibold text-slate-800">{claim.email}</p>
                            <p className="text-xs text-slate-500">
                              {claim.reason} · joined {claim.createdAt?.slice(0, 10) ?? "—"} · last
                              sign-in {claim.lastSignIn?.slice(0, 10) ?? "never"}
                              {!claim.emailConfirmed && " · email not confirmed"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(store.slug, key, () => adminSetStoreOwner(store.slug, claim.email))}
                            className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {busy === key ? "Confirming…" : "Confirm as owner"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Assign by email */}
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const email = typed[store.slug] ?? "";
                  run(store.slug, `typed:${store.slug}`, () => adminSetStoreOwner(store.slug, email));
                }}
              >
                <input
                  type="email"
                  value={typed[store.slug] ?? ""}
                  onChange={(e) => setTyped((prev) => ({ ...prev, [store.slug]: e.target.value }))}
                  placeholder="Or type the owner's account email"
                  aria-label={`Owner email for ${store.name}`}
                  className="input !py-2 text-sm sm:max-w-sm"
                />
                <button
                  type="submit"
                  disabled={pending || !(typed[store.slug] ?? "").includes("@")}
                  className="rounded-full border border-ocean-700 px-4 py-2 text-xs font-bold text-ocean-800 transition hover:bg-ocean-700 hover:text-white disabled:opacity-40"
                >
                  {busy === `typed:${store.slug}` ? "Saving…" : "Set as owner"}
                </button>
              </form>

              {res && (
                <p
                  role="status"
                  className={`mt-2 text-xs font-semibold ${res.ok ? "text-emerald-700" : "text-coral-600"}`}
                >
                  {res.ok ?? res.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
