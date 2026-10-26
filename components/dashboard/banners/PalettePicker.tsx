"use client";

import { LIGHT_PALETTES, PALETTES, sceneBackground, type Palette } from "@/lib/scenes";

/**
 * One-tap colour schemes for a banner or tile — the same jewel tones the
 * home page gives running campaigns, so the admin's own artwork sits with
 * them rather than against them. The two colour inputs stay underneath
 * for anything custom.
 */
export default function PalettePicker({
  from,
  to,
  onPick,
  light = false,
}: {
  from: string;
  to: string;
  onPick: (palette: Palette) => void;
  /** Offer the pale schemes too (tiles). */
  light?: boolean;
}) {
  const options = Object.entries({ ...PALETTES, ...(light ? LIGHT_PALETTES : {}) });
  return (
    <div>
      <span className="text-xs font-semibold text-slate-600">Colour scheme</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map(([name, p]) => {
          const on = p.from.toLowerCase() === from.toLowerCase() && p.to.toLowerCase() === to.toLowerCase();
          return (
            <button
              key={name}
              type="button"
              title={name[0].toUpperCase() + name.slice(1)}
              aria-label={`${name} colour scheme`}
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={`h-9 w-9 rounded-full ring-offset-2 transition hover:scale-110 ${
                on ? "ring-2 ring-ocean-600" : "ring-1 ring-black/10"
              }`}
              style={{ background: sceneBackground(p.from, p.to) }}
            />
          );
        })}
      </div>
    </div>
  );
}
