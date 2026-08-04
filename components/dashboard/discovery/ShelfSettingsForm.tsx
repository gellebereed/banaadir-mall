"use client";

import { useState } from "react";
import { updateRecoSettings } from "@/app/actions";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { SLOT_LABEL, SURFACE_LABEL, type ShelfInfo } from "@/lib/reco/catalogue";
import type { Surface } from "@/lib/reco/types";
import type { RecoSettings, ShelfSlot } from "@/lib/types";

const SLOTS: ShelfSlot[] = ["top", "early", "mid", "late"];
const SURFACES: Surface[] = ["home", "product", "cart", "wishlist", "confirmation"];

/**
 * The engine controls.
 *
 * Deliberately not a wall of sliders. There are exactly three things an
 * operator needs: whether recommendations run at all, how loudly their own
 * pushes argue against the ranking, and which rows are allowed on which
 * page. Anything more granular than that is a knob nobody can predict the
 * effect of, and untunable knobs get set once at random and never touched.
 */
export default function ShelfSettingsForm({
  settings,
  shelves,
}: {
  settings: RecoSettings;
  shelves: ShelfInfo[];
}) {
  const overrides = new Map(settings.shelves.map((entry) => [entry.key, entry]));
  const [strength, setStrength] = useState(settings.pinStrength);
  const [enabled, setEnabled] = useState(settings.enabled);

  return (
    <SafeForm action={updateRecoSettings} className="space-y-5">
      <input type="hidden" name="shelfKeys" value={shelves.map((s) => s.id).join(",")} />

      {/* ── Master switch ──────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-ocean-700"
          />
          <span>
            <span className="font-display font-bold text-ocean-950">
              Recommendations are {enabled ? "on" : "off"}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              Off means no personalised rows anywhere on the storefront, and
              no shopper prompts. The storefront falls back to exactly the
              sections you arrange under Marketing.
            </span>
          </span>
        </label>
      </section>

      {/* ── Push strength ──────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">📌 How hard your pushes argue</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          A pinned product enters the ranking as a strong opinion — it never
          bypasses it. Out-of-stock items, and anything a shopper has said
          &ldquo;not interested&rdquo; to, are still dropped.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <input
            type="range"
            name="pinStrength"
            min={0}
            max={100}
            step={5}
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-sand-200 accent-mango-500"
          />
          <span className="w-28 shrink-0 text-right font-display text-lg font-extrabold text-ocean-950">
            {strength}
          </span>
        </div>
        <p className="mt-1.5 text-xs font-semibold text-slate-400">
          {strength === 0
            ? "Off — pushes are ignored entirely."
            : strength < 30
              ? "A nudge. Your pick wins ties, little else."
              : strength < 70
                ? "Balanced. Your pick competes with the shopper's own signals."
                : "Loud. Your pick leads almost every shelf it's eligible for."}
        </p>
      </section>

      {/* ── Shelves ────────────────────────────────────────────────── */}
      {SURFACES.map((surface) => {
        const group = shelves.filter((shelf) => shelf.surface === surface);
        if (group.length === 0) return null;

        return (
          <section key={surface} className="card p-5 sm:p-6">
            <h2 className="font-display font-bold text-ocean-950">
              {SURFACE_LABEL[surface]}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Rows the engine may build here. Each one still hides itself
              when it has nothing worth showing.
            </p>

            <div className="mt-4 space-y-3">
              {group.map((shelf) => {
                const override = overrides.get(shelf.id);
                return (
                  <div
                    key={shelf.id}
                    className="rounded-2xl border border-sand-200 bg-sand-50/60 p-4"
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        name={`shelf:${shelf.id}`}
                        defaultChecked={override?.visible !== false}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-ocean-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{shelf.title}</span>
                          {!shelf.pinnable && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-sand-200">
                              never merchandised
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {shelf.blurb}
                        </span>
                      </span>
                    </label>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        name={`shelfTitle:${shelf.id}`}
                        defaultValue={override?.title ?? ""}
                        placeholder={`Rename — default: “${shelf.title}”`}
                        maxLength={60}
                        className="input !py-2 text-xs"
                      />
                      {surface === "home" ? (
                        <select
                          name={`shelfSlot:${shelf.id}`}
                          defaultValue={override?.slot ?? shelf.slot}
                          className="input !py-2 text-xs"
                        >
                          {SLOTS.map((slot) => (
                            <option key={slot} value={slot}>
                              {SLOT_LABEL[slot]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input type="hidden" name={`shelfSlot:${shelf.id}`} value={shelf.slot} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-4 flex justify-end">
        <SubmitButton>Save engine settings</SubmitButton>
      </div>
    </SafeForm>
  );
}
