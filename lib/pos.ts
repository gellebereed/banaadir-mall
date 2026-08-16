/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE COUNTER — what things cost, what a batch makes, what to charge.
 * ─────────────────────────────────────────────────────────────────────────
 * Pure functions, no database. Everything the till and the pantry screens
 * display is computed here, so the number on the recipe card and the number
 * in the day's takings cannot disagree.
 *
 * ── The one idea the whole thing rests on ────────────────────────────────
 * A small kitchen does not know what its food costs. It knows what it PAID
 * for a sack of flour, and it knows roughly what goes into a tray. Given
 * those two things — a purchase and a recipe — everything else is
 * arithmetic: cost per roll, what to charge, how many trays the shelf can
 * still support, and what the day actually earned.
 *
 * So nothing here asks the owner for a number they would have to work out.
 * They enter what the receipt says and what the tray holds. That is all.
 *
 * ── Weighted average, not last price ─────────────────────────────────────
 * A shop buys the same flour at three prices in a month. Costing the tray
 * at whatever the most recent sack happened to cost makes the price of a
 * cinnamon roll jump around for reasons that have nothing to do with the
 * cinnamon roll. The average across everything still on the shelf is the
 * honest answer, and it is the one an accountant would recognise.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  PosSettings,
  Recipe,
  RecipeItem,
  Supply,
  SupplyPurchase,
  SupplyUnit,
} from "./types";

/** A shop that has just switched the till on, before it changes anything. */
export const DEFAULT_POS: PosSettings = {
  enabled: false,
  // A third of the selling price. High enough to survive gas, rent and the
  // tray that gets dropped; low enough that the suggestion is not absurd.
  targetMarginPct: 35,
  roundTo: 5,
  methods: ["cash", "evc", "edahab"],
};

// ── Units ──────────────────────────────────────────────────────────────

type UnitFamily = "weight" | "volume" | "count";

/**
 * Every unit, and how many BASE units it is worth.
 *
 * One base per family: the gram, the millilitre, the single item. Every
 * conversion goes through the base, so there is exactly one number per unit
 * to get right rather than a grid of pairs.
 */
const UNITS: Record<SupplyUnit, { family: UnitFamily; perBase: number; label: string }> = {
  g: { family: "weight", perBase: 1, label: "grams" },
  kg: { family: "weight", perBase: 1000, label: "kg" },
  ml: { family: "volume", perBase: 1, label: "ml" },
  l: { family: "volume", perBase: 1000, label: "litres" },
  piece: { family: "count", perBase: 1, label: "pieces" },
  dozen: { family: "count", perBase: 12, label: "dozen" },
};

export const SUPPLY_UNITS = Object.keys(UNITS) as SupplyUnit[];

export function unitLabel(unit: SupplyUnit): string {
  return UNITS[unit]?.label ?? unit;
}

/** The units a supply's recipe lines may be written in. */
export function compatibleUnits(unit: SupplyUnit): SupplyUnit[] {
  const family = UNITS[unit]?.family;
  return SUPPLY_UNITS.filter((candidate) => UNITS[candidate].family === family);
}

/**
 * Convert between units of the same family.
 *
 * Returns `null` across families rather than guessing. A recipe line in
 * litres against a supply counted in kilos is a data-entry mistake, and the
 * screens surface it as one — a silent conversion would produce a plausible
 * cost per roll that happens to be wrong.
 */
export function convert(qty: number, from: SupplyUnit, to: SupplyUnit): number | null {
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.family !== b.family) return null;
  return (qty * a.perBase) / b.perBase;
}

// ── What a supply costs ────────────────────────────────────────────────

export interface SupplyPosition {
  /** Total quantity received, in the supply's own unit. */
  received: number;
  /** Everything ever paid for it. */
  spent: number;
  /** Weighted average cost of one unit, or 0 when nothing was ever bought. */
  unitCost: number;
}

/**
 * Roll a supply's purchase history into a position.
 *
 * Deliberately over the WHOLE history rather than over what is left on the
 * shelf. Costing what remains would mean the average lurched every time a
 * tray was baked, and the owner would watch their cinnamon roll change
 * price because they used some flour.
 */
export function supplyPosition(purchases: SupplyPurchase[]): SupplyPosition {
  const received = purchases.reduce((total, purchase) => total + (purchase.qty || 0), 0);
  const spent = purchases.reduce((total, purchase) => total + (purchase.totalCost || 0), 0);
  return {
    received: round2(received),
    spent: round2(spent),
    unitCost: received > 0 ? spent / received : 0,
  };
}

/** What one recipe line costs, and whether it can even be costed. */
export interface LineCost {
  item: RecipeItem;
  supply?: Supply;
  /** The line's quantity expressed in the supply's own unit. */
  qtyInSupplyUnit: number | null;
  cost: number;
  /** Set when the line cannot be costed, phrased for the person reading it. */
  problem?: string;
}

export function lineCost(item: RecipeItem, supplies: Map<string, Supply>): LineCost {
  const supply = supplies.get(item.supplyId);
  if (!supply) {
    return {
      item,
      qtyInSupplyUnit: null,
      cost: 0,
      problem: "This ingredient is no longer in the pantry.",
    };
  }

  const qty = convert(item.qty, item.unit, supply.unit);
  if (qty === null) {
    return {
      item,
      supply,
      qtyInSupplyUnit: null,
      cost: 0,
      problem: `${supply.name} is counted in ${unitLabel(supply.unit)}, so this line cannot be in ${unitLabel(item.unit)}.`,
    };
  }

  return {
    item,
    supply,
    qtyInSupplyUnit: qty,
    cost: qty * (supply.unitCost || 0),
    problem:
      (supply.unitCost || 0) > 0
        ? undefined
        : `Nothing has been bought for ${supply.name} yet, so it counts as free.`,
  };
}

// ── What a batch costs ─────────────────────────────────────────────────

export interface RecipeCost {
  lines: LineCost[];
  /** Ingredients only. */
  ingredientCost: number;
  overhead: number;
  /** Everything one batch costs. */
  batchCost: number;
  /** What one sellable unit costs to make. */
  unitCost: number;
  /** Lines that could not be costed — shown, never silently dropped. */
  problems: string[];
}

export function recipeCost(recipe: Recipe, supplies: Map<string, Supply>): RecipeCost {
  const lines = recipe.items.map((item) => lineCost(item, supplies));
  const ingredientCost = lines.reduce((total, line) => total + line.cost, 0);
  const overhead = Math.max(0, recipe.overhead || 0);
  const batchCost = ingredientCost + overhead;
  // A yield of zero is a half-finished recipe, not a divide-by-zero.
  const madePerBatch = Math.max(0, recipe.yield || 0);

  return {
    lines,
    ingredientCost: round2(ingredientCost),
    overhead: round2(overhead),
    batchCost: round2(batchCost),
    unitCost: madePerBatch > 0 ? round2(batchCost / madePerBatch) : 0,
    problems: lines
      .map((line) => line.problem)
      .filter((problem): problem is string => Boolean(problem)),
  };
}

// ── What to charge ─────────────────────────────────────────────────────

/**
 * A price to suggest, rounded to something a person would actually write on
 * a board.
 *
 * ── Margin is on the PRICE, not on the cost ──────────────────────────────
 * "35% margin" means 35% of what the customer pays, which is how a shop
 * talks about it and how the figure has to behave: price = cost / (1 - m).
 * Adding 35% to the cost instead gives 26% margin and quietly undercharges
 * every item in the shop by the difference.
 *
 * Then it is rounded UP to the nearest `roundTo`. Up, not to-nearest: a
 * suggestion that lands below cost-plus-margin is worse than useless, and
 * KES 47 on a price board looks like a mistake beside KES 50.
 */
export function suggestPrice(unitCost: number, settings: PosSettings): number {
  if (!(unitCost > 0)) return 0;

  const margin = Math.min(90, Math.max(0, settings.targetMarginPct || 0)) / 100;
  const raw = unitCost / (1 - margin);

  const step = Math.max(0, settings.roundTo || 0);
  if (step <= 0) return round2(raw);
  return round2(Math.ceil(raw / step) * step);
}

/** What a price actually earns, once it is set. */
export interface Margin {
  price: number;
  unitCost: number;
  profit: number;
  /** Profit as a share of the price, 0–100. */
  pct: number;
  /** True when the price does not cover what it costs to make. */
  belowCost: boolean;
}

export function marginFor(price: number, unitCost: number): Margin {
  const profit = price - unitCost;
  return {
    price: round2(price),
    unitCost: round2(unitCost),
    profit: round2(profit),
    pct: price > 0 ? round2((profit / price) * 100) : 0,
    belowCost: price > 0 && profit < 0,
  };
}

// ── What the pantry can still support ──────────────────────────────────

export interface BatchCapacity {
  /** Whole batches the shelf can support right now. */
  batches: number;
  /** Sellable units that comes to. */
  units: number;
  /** The ingredient that runs out first, when something does. */
  limitedBy?: { supply: Supply; have: number; needPerBatch: number };
  /** Ingredients with nothing left at all. */
  missing: string[];
}

/**
 * How many batches could be made without buying anything.
 *
 * The useful half of this is not the number — it is `limitedBy`. "You can
 * make 3 more trays, and it is the eggs that stop you" is a sentence
 * somebody can act on before the morning rush; "3" on its own is not.
 */
export function batchCapacity(recipe: Recipe, supplies: Map<string, Supply>): BatchCapacity {
  if (recipe.items.length === 0) return { batches: 0, units: 0, missing: [] };

  let batches = Infinity;
  let limitedBy: BatchCapacity["limitedBy"];
  const missing: string[] = [];

  for (const item of recipe.items) {
    const supply = supplies.get(item.supplyId);
    if (!supply) {
      missing.push("an ingredient that is no longer in the pantry");
      batches = 0;
      continue;
    }

    const need = convert(item.qty, item.unit, supply.unit);
    if (need === null || need <= 0) continue;

    const have = supply.stock || 0;
    if (have <= 0) missing.push(supply.name);

    const possible = Math.floor(have / need);
    if (possible < batches) {
      batches = possible;
      limitedBy = { supply, have, needPerBatch: need };
    }
  }

  const safe = Number.isFinite(batches) ? Math.max(0, batches) : 0;
  return {
    batches: safe,
    units: safe * Math.max(0, recipe.yield || 0),
    limitedBy,
    missing,
  };
}

// ── Making a batch ─────────────────────────────────────────────────────

export interface ProductionPlan {
  /** supplyId → how much to take off the shelf, in the supply's unit. */
  consume: { supply: Supply; qty: number }[];
  /** Sellable units produced. */
  madeQty: number;
  unitCost: number;
  totalCost: number;
  /** Why this cannot be made. Empty when it can. */
  blockers: string[];
}

/**
 * Work out exactly what making `batches` would consume, WITHOUT doing it.
 *
 * Separated from the write on purpose: the screen shows the owner what is
 * about to leave the shelf and what the tray will have cost before they
 * confirm, and the same function is what the server re-runs when they do.
 * One set of arithmetic, checked twice.
 */
export function planProduction(
  recipe: Recipe,
  supplies: Map<string, Supply>,
  batches: number,
): ProductionPlan {
  const blockers: string[] = [];
  const count = Math.max(0, Math.floor(batches || 0));

  if (count < 1) blockers.push("Choose at least one batch.");
  if (!(recipe.yield > 0)) {
    blockers.push("Say how many this recipe makes before making a batch.");
  }
  if (recipe.items.length === 0) blockers.push("This recipe has no ingredients yet.");

  const consume: { supply: Supply; qty: number }[] = [];

  for (const item of recipe.items) {
    const supply = supplies.get(item.supplyId);
    if (!supply) {
      blockers.push("One of the ingredients is no longer in the pantry.");
      continue;
    }

    const perBatch = convert(item.qty, item.unit, supply.unit);
    if (perBatch === null) {
      blockers.push(
        `${supply.name} is counted in ${unitLabel(supply.unit)} but the recipe asks for ${unitLabel(item.unit)}.`,
      );
      continue;
    }

    const needed = perBatch * count;
    if (needed > (supply.stock || 0) + 1e-9) {
      blockers.push(
        `Not enough ${supply.name}: ${count} batch${count === 1 ? "" : "es"} needs ` +
          `${trim(needed)} ${unitLabel(supply.unit)} and there is ${trim(supply.stock || 0)}.`,
      );
      continue;
    }

    consume.push({ supply, qty: needed });
  }

  const cost = recipeCost(recipe, supplies);
  return {
    consume,
    madeQty: count * Math.max(0, recipe.yield || 0),
    unitCost: cost.unitCost,
    totalCost: round2(cost.batchCost * count),
    blockers,
  };
}

// ── The counter ────────────────────────────────────────────────────────

export interface TillLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface TillTotals {
  lines: number;
  units: number;
  total: number;
}

export function tillTotals(lines: TillLine[]): TillTotals {
  return {
    lines: lines.length,
    units: lines.reduce((total, line) => total + line.qty, 0),
    total: round2(lines.reduce((total, line) => total + line.price * line.qty, 0)),
  };
}

/**
 * The change to hand back.
 *
 * Its own function because it is the single most-used number at a counter
 * and the one most often got wrong in a hurry. Negative means the cash on
 * the counter does not cover it yet, which the screen says plainly rather
 * than showing a minus sign.
 */
export function changeDue(total: number, cashGiven: number): number {
  return round2((cashGiven || 0) - (total || 0));
}

export const PAYMENT_LABELS: Record<string, { label: string; icon: string }> = {
  cash: { label: "Cash", icon: "💵" },
  evc: { label: "EVC Plus", icon: "📱" },
  edahab: { label: "eDahab", icon: "📲" },
  card: { label: "Card", icon: "💳" },
};

// ── Small helpers ──────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Drop trailing zeros so "2.00 kg" reads as "2 kg". */
export function trim(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
