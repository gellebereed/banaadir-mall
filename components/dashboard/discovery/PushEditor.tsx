"use client";

import { useState } from "react";
import type { ShelfInfo } from "@/lib/reco/catalogue";
import { toShopInput } from "@/lib/shop-time";
import type { RecoPin } from "@/lib/types";
import { PositionPicker, ReasonChips, whereItShows } from "./push-parts";

/**
 * Edit one push in place: where it goes, which card, its reason and its
 * dates. Saved through /api/admin/reco-pins (PATCH) for the same reason the
 * composer adds through it — see that route.
 */
export default function PushEditor({
  pin,
  shelves,
  hiddenShelves,
  strength,
  onSaved,
  onCancel,
}: {
  pin: RecoPin;
  shelves: ShelfInfo[];
  hiddenShelves: Set<string>;
  strength: number;
  onSaved: (pin: RecoPin) => void;
  onCancel: () => void;
}) {
  const pinnable = shelves.filter((s) => s.pinnable && (!hiddenShelves.has(s.id) || s.id === pin.shelf));
  const [shelf, setShelf] = useState(pin.shelf);
  const [position, setPosition] = useState<number | undefined>(pin.position);
  const [note, setNote] = useState(pin.note ?? "");
  const [startsAt, setStartsAt] = useState(toShopInput(pin.startsAt));
  const [endsAt, setEndsAt] = useState(toShopInput(pin.endsAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/reco-pins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pin.id, shelf, position: position ?? null, note, startsAt, endsAt }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; pin?: RecoPin };
      if (!response.ok || !result.ok || !result.pin) {
        setError(result.error ?? "Couldn't save the change. Try again.");
        return;
      }
      onSaved(result.pin);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const target = shelves.find((s) => s.id === shelf);

  return (
    <div className="mt-3 w-full space-y-4 rounded-2xl border border-ocean-200 bg-ocean-50/40 p-4">
      <div>
        <label className="label" htmlFor={`edit-shelf-${pin.id}`}>
          Where
        </label>
        <select id={`edit-shelf-${pin.id}`} value={shelf} onChange={(e) => setShelf(e.target.value)} className="input">
          <option value="auto">Anywhere — the first general row each shopper sees</option>
          {pinnable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.surface}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Position on the row</span>
        <PositionPicker value={position} onChange={setPosition} strength={strength} />
      </div>

      <div>
        <label className="label" htmlFor={`edit-note-${pin.id}`}>
          Reason on the card <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id={`edit-note-${pin.id}`}
          value={note}
          maxLength={90}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Picked by Banaadir Mall"
          className="input"
        />
        <ReasonChips value={note} onChange={setNote} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`edit-start-${pin.id}`}>
            Starts <span className="font-normal text-slate-400">(blank = now)</span>
          </label>
          <input
            id={`edit-start-${pin.id}`}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`edit-end-${pin.id}`}>
            Ends <span className="font-normal text-slate-400">(blank = no end)</span>
          </label>
          <input
            id={`edit-end-${pin.id}`}
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="input"
          />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-slate-400">Times are Mogadishu time.</p>

      <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-sand-200">
        <span className="font-bold text-slate-800">Will show: </span>
        {whereItShows(target, position, strength, shelves)}
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary !px-5 !py-2 text-sm disabled:opacity-70">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary !px-5 !py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
