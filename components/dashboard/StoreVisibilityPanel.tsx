"use client";

import { useState, useTransition } from "react";
import { setStoreHidden } from "@/app/actions";
import StoreAvatar from "@/components/StoreAvatar";
import { isSetUp, type SetupCheck } from "@/lib/store-setup";
import type { Store } from "@/lib/types";

/**
 * "Who can shoppers see?" — every active store, whether it is live or
 * hidden while it is set up (Store.hidden), what it still lacks, and the
 * switch.
 *
 * Its own panel, above the directory, because this is the question asked
 * before going live: the marketplace can't open with half-built shops in
 * it, and those shops shouldn't be suspended either — their owners need
 * the dashboard to finish. The checks (lib/store-setup.ts) are advice, not
 * a lock: the admin decides.
 */
export default function StoreVisibilityPanel({
  stores,
}: {
  stores: { store: Store; setup: SetupCheck[] }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ slug: string; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const hiddenCount = stores.filter(({ store }) => store.hidden).length;

  function toggle(store: Store) {
    const hide = !store.hidden;
    if (
      hide &&
      !confirm(
        `Hide ${store.name} from shoppers?\n\nIts store page, products and campaigns disappear from the site until you make it live again. The owner can still sign in and finish setting up.`,
      )
    ) {
      return;
    }
    setBusy(store.slug);
    setMessage(null);
    startTransition(async () => {
      const result = await setStoreHidden(store.slug, hide);
      if ("error" in result) setMessage({ slug: store.slug, text: result.error });
      setBusy(null);
    });
  }

  if (stores.length === 0) return null;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ocean-950">Who shoppers can see</h2>
      <p className="mt-1 text-xs text-slate-500">
        Hide a store while it is being set up: shoppers see nothing of it — no store page, products
        or campaigns — and its owner keeps the dashboard to finish.{" "}
        {hiddenCount > 0
          ? `${hiddenCount} of ${stores.length} hidden right now.`
          : "Every active store is live."}
      </p>

      <ul className="mt-4 divide-y divide-sand-100">
        {stores.map(({ store, setup }) => {
          const ready = isSetUp(setup);
          return (
            <li key={store.slug} className="flex flex-wrap items-center gap-3 py-3">
              <StoreAvatar store={store} size={40} className="h-10 w-10 shrink-0 rounded-xl border border-sand-200" />
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-slate-900">{store.name}</p>
                  {store.hidden ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      🙈 Hidden
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ● Live
                    </span>
                  )}
                  {!ready && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Not fully set up
                    </span>
                  )}
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  {setup.map((check) => (
                    <li
                      key={check.key}
                      className={
                        check.done
                          ? "text-emerald-700"
                          : check.required
                            ? "font-semibold text-coral-600"
                            : "text-slate-400"
                      }
                    >
                      {check.done ? "✓" : "✗"} {check.label}
                      {!check.done && !check.required ? " (optional)" : ""}
                    </li>
                  ))}
                </ul>
                {message?.slug === store.slug && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-coral-700">
                    {message.text}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => toggle(store)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                  store.hidden
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {busy === store.slug ? "Saving…" : store.hidden ? "Make live" : "Hide from shoppers"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
