"use client";

import type { ShelfInfo } from "@/lib/reco/catalogue";

/**
 * Pieces the push composer and the push editor share, so a push reads and
 * is set the same way wherever it is touched.
 */

export const REASONS = ["New arrival", "Back in stock", "Staff pick", "Limited stock", "Best seller"];

const SURFACE: Record<ShelfInfo["surface"], string> = {
  home: "the home page",
  product: "product pages",
  cart: "the basket",
  wishlist: "the wishlist",
  confirmation: "the order confirmation",
};

/** The card an automatic push takes — mirrors pinPlacement in lib/reco/shelves.ts. */
export function autoCard(strength: number): number {
  return Math.round((1 - Math.min(100, Math.max(0, strength)) / 100) * 3) + 1;
}

/**
 * Where a push actually appears, in words. "Anywhere" is not everywhere:
 * each page builds its own rows of recommendations, and the push takes the
 * first one that is showing for that shopper among the rows whose heading
 * holds for any product (ShelfInfo.anywhere).
 */
export function whereItShows(
  shelf: ShelfInfo | undefined,
  position: number | undefined,
  strength: number,
  shelves: ShelfInfo[],
): string {
  const card = `card ${position ?? autoCard(strength)}${position ? "" : " (automatic)"}`;
  if (!shelf) {
    const rows = shelves.filter((s) => s.pinnable && s.anywhere);
    const example = rows.find((s) => s.surface === "home")?.title;
    return `the first general row each shopper sees on a page${example ? ` (such as “${example}”)` : ""}, at ${card}`;
  }
  return `“${shelf.title}” on ${SURFACE[shelf.surface]}, at ${card}`;
}

export function PositionPicker({
  value,
  onChange,
  strength,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  strength: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Position on the row">
      <Chip on={value === undefined} onClick={() => onChange(undefined)}>
        Automatic · card {autoCard(strength)}
      </Chip>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <Chip key={n} on={value === n} onClick={() => onChange(n)} label={`Card ${n}`}>
          {n}
        </Chip>
      ))}
    </div>
  );
}

export function ReasonChips({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {REASONS.map((r) => (
        <Chip key={r} on={value === r} onClick={() => onChange(r)}>
          {r}
        </Chip>
      ))}
    </div>
  );
}

export function Chip({
  on,
  onClick,
  children,
  label,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`min-w-[2rem] rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${
        on ? "bg-ocean-900 text-white ring-ocean-900" : "bg-white text-slate-600 ring-sand-200 hover:ring-ocean-300"
      }`}
    >
      {children}
    </button>
  );
}
