"use client";

import { useActionState, useState } from "react";
import {
  addSupply,
  adjustStock,
  deleteSupply,
  recordPurchase,
  type PosState,
} from "@/app/vendor/pos/actions";
import { money } from "@/lib/format";
import { SUPPLY_UNITS, trim, unitLabel } from "@/lib/pos";
import type { Supply, SupplyPurchase, SupplyUnit } from "@/lib/types";

const EMPTY: PosState = { ok: false, message: "" };

/** A few starters so the first ingredient takes one tap, not typing. */
const SUGGESTIONS: { name: string; icon: string; unit: SupplyUnit }[] = [
  { name: "Flour", icon: "🌾", unit: "kg" },
  { name: "Sugar", icon: "🍬", unit: "kg" },
  { name: "Eggs", icon: "🥚", unit: "piece" },
  { name: "Milk", icon: "🥛", unit: "l" },
  { name: "Butter", icon: "🧈", unit: "kg" },
  { name: "Cinnamon", icon: "🥄", unit: "g" },
  { name: "Yeast", icon: "🫙", unit: "g" },
  { name: "Boxes", icon: "📦", unit: "piece" },
];

export default function PantryClient({
  supplies,
  purchases,
}: {
  supplies: Supply[];
  purchases: SupplyPurchase[];
}) {
  const [tab, setTab] = useState<"shelf" | "add">(supplies.length === 0 ? "add" : "shelf");
  const [openId, setOpenId] = useState<string | null>(null);

  const spent = purchases.reduce((total, purchase) => total + purchase.totalCost, 0);
  const shelfValue = supplies.reduce(
    (total, supply) => total + supply.stock * supply.unitCost,
    0,
  );
  const low = supplies.filter(
    (supply) => supply.lowAt !== undefined && supply.stock <= supply.lowAt,
  );

  return (
    <div className="space-y-4">
      {/* ── What the shelf is worth ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Ingredients" value={String(supplies.length)} />
        <Stat label="On the shelf" value={money(shelfValue)} tone="good" />
        <Stat label="Spent, all time" value={money(spent)} />
      </div>

      {low.length > 0 && (
        <div className="rounded-2xl border border-mango-200 bg-mango-50 p-4">
          <p className="text-sm font-bold text-mango-900">
            ⚠ Running low: {low.map((supply) => supply.name).join(", ")}
          </p>
          <p className="mt-0.5 text-xs text-mango-900/80">
            Buy more before your next batch, or you will be stopped halfway.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <TabButton active={tab === "shelf"} onClick={() => setTab("shelf")}>
          What I have ({supplies.length})
        </TabButton>
        <TabButton active={tab === "add"} onClick={() => setTab("add")}>
          + Add an ingredient
        </TabButton>
      </div>

      {tab === "add" ? (
        <AddSupplyCard />
      ) : supplies.length === 0 ? (
        <div className="card p-8 text-center">
          <span className="text-4xl">🛒</span>
          <p className="mt-3 font-display font-bold text-ocean-950">
            Your pantry is empty
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Add the things you buy — flour, sugar, eggs — and what you paid.
            Everything else works itself out from there.
          </p>
          <button onClick={() => setTab("add")} className="btn-primary mt-5">
            Add the first one
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {supplies.map((supply) => (
            <SupplyCard
              key={supply.id}
              supply={supply}
              purchases={purchases.filter((purchase) => purchase.supplyId === supply.id)}
              open={openId === supply.id}
              onToggle={() => setOpenId(openId === supply.id ? null : supply.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One ingredient ─────────────────────────────────────────────────── */

function SupplyCard({
  supply,
  purchases,
  open,
  onToggle,
}: {
  supply: Supply;
  purchases: SupplyPurchase[];
  open: boolean;
  onToggle: () => void;
}) {
  const [buyState, buyAction, buying] = useActionState<PosState, FormData>(
    recordPurchase,
    EMPTY,
  );
  const [countState, countAction, counting] = useActionState<PosState, FormData>(
    adjustStock,
    EMPTY,
  );

  const isLow = supply.lowAt !== undefined && supply.stock <= supply.lowAt;
  const value = supply.stock * supply.unitCost;

  return (
    <div className={`card overflow-hidden ${isLow ? "border-mango-300" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-sand-50"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
          {supply.icon || "🧂"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold text-ocean-950">{supply.name}</p>
          <p className="text-xs text-slate-500">
            {money(supply.unitCost)} per {supply.unit}
            {value > 0 && <> · {money(value)} on the shelf</>}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`font-display text-lg font-extrabold ${
              isLow ? "text-mango-700" : "text-ocean-950"
            }`}
          >
            {trim(supply.stock)}
          </p>
          <p className="text-[11px] text-slate-400">{unitLabel(supply.unit)} left</p>
        </div>

        <span className="shrink-0 text-slate-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-sand-100 bg-sand-50/60 p-4">
          {/* Record a delivery — the thing done most often, so it is first. */}
          <form action={buyAction} className="space-y-3">
            <input type="hidden" name="supplyId" value={supply.id} />
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              I bought more
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  How much ({unitLabel(supply.unit)})
                </span>
                <input
                  name="qty"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="25"
                  className="input !py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  What it cost in total
                </span>
                <input
                  name="totalCost"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="2500"
                  className="input !py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={buying}
              className="btn-primary !py-2 w-full text-sm disabled:opacity-60"
            >
              {buying ? "Saving…" : "Add to the shelf"}
            </button>
            {buyState.message && (
              <p
                className={`text-xs font-semibold ${
                  buyState.ok ? "text-emerald-700" : "text-coral-700"
                }`}
              >
                {buyState.ok ? "✓ " : "✕ "}
                {buyState.message}
              </p>
            )}
          </form>

          {/* Stocktake */}
          <form action={countAction} className="mt-4 border-t border-sand-200 pt-4">
            <input type="hidden" name="supplyId" value={supply.id} />
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Count stock
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Spilled something, or the number looks wrong? Put in what is
              actually there.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                name="counted"
                type="number"
                min="0"
                step="any"
                defaultValue={supply.stock}
                className="input !py-2 flex-1 text-sm"
              />
              <button
                type="submit"
                disabled={counting}
                className="btn-secondary !px-4 !py-2 text-sm disabled:opacity-60"
              >
                {counting ? "…" : "Correct it"}
              </button>
            </div>
            {countState.message && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  countState.ok ? "text-emerald-700" : "text-coral-700"
                }`}
              >
                {countState.ok ? "✓ " : "✕ "}
                {countState.message}
              </p>
            )}
          </form>

          {/* History — why the cost per unit is what it is. */}
          {purchases.length > 0 && (
            <details className="mt-4 border-t border-sand-200 pt-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">
                Everything I bought ({purchases.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {purchases.slice(0, 12).map((purchase) => (
                  <li
                    key={purchase.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-slate-500">{purchase.date}</span>
                    <span className="text-slate-700">
                      {trim(purchase.qty)} {supply.unit} · {money(purchase.totalCost)}
                    </span>
                    <span className="text-slate-400">
                      {money(purchase.totalCost / (purchase.qty || 1))}/{supply.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-400">
                The {money(supply.unitCost)} per {supply.unit} above is the average
                across all of these — not the last price you paid.
              </p>
            </details>
          )}

          <form
            action={async () => {
              await deleteSupply(supply.id);
            }}
            className="mt-4 border-t border-sand-200 pt-3 text-right"
          >
            <button
              type="submit"
              className="text-xs font-bold text-coral-600 hover:underline"
            >
              Remove {supply.name} from the pantry
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Add ────────────────────────────────────────────────────────────── */

function AddSupplyCard() {
  const [state, formAction, pending] = useActionState<PosState, FormData>(addSupply, EMPTY);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🧂");
  const [unit, setUnit] = useState<SupplyUnit>("kg");

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div>
        <p className="font-display font-bold text-ocean-950">Add an ingredient</p>
        <p className="mt-0.5 text-sm text-slate-500">
          What you buy, how it is measured, and what you paid for it this time.
        </p>
      </div>

      {/* One tap for the usual suspects. */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            onClick={() => {
              setName(suggestion.name);
              setIcon(suggestion.icon);
              setUnit(suggestion.unit);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              name === suggestion.name
                ? "border-ocean-600 bg-ocean-50 text-ocean-800"
                : "border-sand-200 bg-white text-slate-600 hover:border-ocean-300"
            }`}
          >
            <span aria-hidden>{suggestion.icon}</span>
            {suggestion.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[80px_1fr_130px]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Icon</span>
          <input
            name="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={4}
            className="input !py-2 text-center text-lg"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">Name</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Flour"
            className="input !py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            Counted in
          </span>
          <select
            name="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as SupplyUnit)}
            className="input !py-2"
          >
            {SUPPLY_UNITS.map((option) => (
              <option key={option} value={option}>
                {unitLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl bg-sand-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          What you bought this time{" "}
          <span className="font-normal normal-case text-slate-400">(optional)</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              How much ({unitLabel(unit)})
            </span>
            <input
              name="qty"
              type="number"
              min="0"
              step="any"
              placeholder="25"
              className="input !py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Total price paid
            </span>
            <input
              name="totalCost"
              type="number"
              min="0"
              step="any"
              placeholder="2500"
              className="input !py-2 text-sm"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Put in what the receipt says altogether — it works out the price per{" "}
          {unit} itself.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-500">
          Warn me when it drops below{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          name="lowAt"
          type="number"
          min="0"
          step="any"
          placeholder={`e.g. 5 ${unit}`}
          className="input !py-2 text-sm sm:max-w-xs"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? "Adding…" : "Add to pantry"}
        </button>
        {state.message && (
          <p
            role="status"
            className={`text-sm font-semibold ${
              state.ok ? "text-emerald-700" : "text-coral-700"
            }`}
          >
            {state.ok ? "✓ " : "✕ "}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div className={`rounded-2xl p-4 ${tone === "good" ? "bg-emerald-50" : "bg-white ring-1 ring-sand-200"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-extrabold text-ocean-950">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-ocean-950 text-white"
          : "bg-white text-slate-600 ring-1 ring-sand-200 hover:bg-sand-100"
      }`}
    >
      {children}
    </button>
  );
}
