"use server";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE COUNTER — every write the till, the pantry and the recipes perform.
 * ─────────────────────────────────────────────────────────────────────────
 * Its own module rather than more of app/actions.ts, which is already 2,900
 * lines. Everything here shares one guard (`requireTill`) and one rule: the
 * arithmetic is re-run on the server from the stored pantry, never trusted
 * from the form. The browser sends what the owner TYPED — 2 batches, 3
 * rolls — and the server works out what that costs and what it consumes.
 *
 * ── Why every action re-reads the pantry ─────────────────────────────────
 * Two people work a counter. One bakes while the other sells. If the make-a-
 * batch screen posted the ingredient quantities it calculated when the page
 * loaded, a delivery entered on the other phone in between would be
 * overwritten. So the page posts an intent and the server re-derives the
 * consequences from what is on the shelf at that moment.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  getPosSettings,
  getProduct,
  getRecipe,
  getSupplies,
  getSupplyMap,
  getSupplyPurchases,
} from "@/lib/api";
import { getBaseProduct } from "@/lib/api";
import { may } from "@/lib/auth";
import { mutateDB } from "@/lib/db";
import {
  DEFAULT_POS,
  planProduction,
  supplyPosition,
  tillTotals,
  type TillLine,
} from "@/lib/pos";
import { getSession, requireVendor } from "@/lib/session";
import { CACHE_TAGS } from "@/lib/supabase/public-client";
import {
  applyStockMovesInSupabase,
  createOrderInSupabase,
  deleteRecipeFromSupabase,
  deleteSupplyFromSupabase,
  insertProductionRunInSupabase,
  insertSupplyPurchaseInSupabase,
  updatePosSettingsInSupabase,
  updateProductFields,
  upsertRecipeInSupabase,
  upsertSupplyInSupabase,
  useSupabaseMutations,
} from "@/lib/supabase/mutations";
import type {
  PaymentMethod,
  PosSettings,
  ProductionRun,
  Recipe,
  RecipeItem,
  Supply,
  SupplyPurchase,
  SupplyUnit,
} from "@/lib/types";

/** Result shape shared by every form on the counter. */
export interface PosState {
  ok: boolean;
  message: string;
}

/**
 * The store this person may run a till for.
 *
 * `products.edit` is the permission, not a new one: whoever may change what
 * the shop sells and what it costs is whoever may run its counter. Adding a
 * `pos.manage` grant would mean every existing manager silently loses
 * access to a feature on the day it ships.
 */
async function requireTill(): Promise<{ storeSlug: string }> {
  const { session, storeSlug } = await requireVendor();
  if (!may(session, "products.edit")) {
    throw new Error("Your account is not allowed to run the counter.");
  }
  return { storeSlug };
}

/** Drop the cached pantry AND the catalogue — baking moves both. */
function refreshPos() {
  revalidateTag(CACHE_TAGS.pos);
  revalidateTag(CACHE_TAGS.products);
  revalidateTag(CACHE_TAGS.orders);
  revalidateTag(CACHE_TAGS.stores);
}

const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const num = (value: FormDataEntryValue | null, fallback = 0): number => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ── Settings ───────────────────────────────────────────────────────────

export async function savePosSettings(
  _prev: PosState,
  formData: FormData,
): Promise<PosState> {
  const session = await getSession();
  if (!session) redirect("/login");
  const { storeSlug } = await requireVendor();
  if (!may(session, "settings.manage")) {
    return { ok: false, message: "Only someone who can change store settings can do this." };
  }

  const settings: PosSettings = {
    enabled: formData.get("enabled") === "on",
    targetMarginPct: Math.min(90, Math.max(0, num(formData.get("targetMarginPct"), 35))),
    roundTo: Math.max(0, num(formData.get("roundTo"), 5)),
    methods: (["cash", "evc", "edahab", "card"] as PaymentMethod[]).filter(
      (method) => formData.get(`method-${method}`) === "on",
    ),
  };

  if (settings.enabled && settings.methods.length === 0) {
    return { ok: false, message: "Pick at least one way for customers to pay." };
  }

  if (useSupabaseMutations()) {
    const result = await updatePosSettingsInSupabase(storeSlug, settings);
    if (!result.ok) {
      return {
        ok: false,
        message: result.migrationRequired
          ? "This database has not had the counter migration applied, so nothing was " +
            "saved. Run supabase/migration-pos.sql, then save again."
          : "Could not save. Check the server log.",
      };
    }
  } else {
    await mutateDB((db) => {
      db.storeOverrides[storeSlug] = { ...db.storeOverrides[storeSlug], pos: settings };
    });
  }

  refreshPos();
  return {
    ok: true,
    message: settings.enabled
      ? "Saved. The counter is on."
      : "Saved. The counter is off — nothing else changes.",
  };
}

// ── The pantry ─────────────────────────────────────────────────────────

/**
 * Add an ingredient, optionally with the first delivery in the same breath.
 *
 * One form rather than two, because "add flour" and "I bought 25 kg of
 * flour" are the same moment in real life. Making somebody create an empty
 * ingredient and then find it again to record what they bought is the kind
 * of two-step that makes people give up on stock control entirely.
 */
export async function addSupply(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Give the ingredient a name." };

  const existing = await getSupplies(storeSlug);
  if (existing.some((supply) => supply.name.toLowerCase() === name.toLowerCase())) {
    return {
      ok: false,
      message: `${name} is already in the pantry — record what you bought against it instead.`,
    };
  }

  const unit = String(formData.get("unit") ?? "kg") as SupplyUnit;
  const qty = Math.max(0, num(formData.get("qty")));
  const totalCost = Math.max(0, num(formData.get("totalCost")));

  const supply: Supply = {
    id: id("sup"),
    store: storeSlug,
    name,
    unit,
    stock: qty,
    // Straight from the first delivery. supplyPosition() takes over the
    // moment there is more than one.
    unitCost: qty > 0 ? totalCost / qty : 0,
    lowAt: num(formData.get("lowAt")) || undefined,
    icon: String(formData.get("icon") ?? "").trim() || undefined,
  };

  const purchase: SupplyPurchase | null =
    qty > 0
      ? {
          id: id("buy"),
          store: storeSlug,
          supplyId: supply.id,
          qty,
          totalCost,
          date: new Date().toISOString().slice(0, 10),
        }
      : null;

  if (useSupabaseMutations()) {
    if (!(await upsertSupplyInSupabase(supply))) {
      return { ok: false, message: "Could not save that ingredient. Check the server log." };
    }
    if (purchase) await insertSupplyPurchaseInSupabase(purchase);
  } else {
    await mutateDB((db) => {
      db.supplies = [...(db.supplies ?? []), supply];
      if (purchase) db.supplyPurchases = [...(db.supplyPurchases ?? []), purchase];
    });
  }

  refreshPos();
  return {
    ok: true,
    message: purchase
      ? `${name} added — ${qty} ${unit} on the shelf.`
      : `${name} added. Record a delivery when you buy some.`,
  };
}

/**
 * Record a delivery: "25 kg of flour, KES 2,500".
 *
 * The unit cost is RECOMPUTED from every purchase ever made, not nudged.
 * Averaging incrementally accumulates rounding error, and this number ends
 * up in the price on the board.
 */
export async function recordPurchase(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const supplyId = String(formData.get("supplyId") ?? "");
  const supplies = await getSupplyMap(storeSlug);
  const supply = supplies.get(supplyId);
  if (!supply) return { ok: false, message: "That ingredient is not in this pantry." };

  const qty = num(formData.get("qty"));
  const totalCost = num(formData.get("totalCost"));
  if (!(qty > 0)) return { ok: false, message: "How much did you buy?" };
  if (totalCost < 0) return { ok: false, message: "What did it cost?" };

  const purchase: SupplyPurchase = {
    id: id("buy"),
    store: storeSlug,
    supplyId,
    qty,
    totalCost,
    date: String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10),
    note: String(formData.get("note") ?? "").trim() || undefined,
  };

  const history = (await getSupplyPurchases(storeSlug)).filter((p) => p.supplyId === supplyId);
  const position = supplyPosition([...history, purchase]);

  const updated: Supply = {
    ...supply,
    stock: supply.stock + qty,
    unitCost: position.unitCost,
  };

  if (useSupabaseMutations()) {
    if (!(await insertSupplyPurchaseInSupabase(purchase))) {
      return { ok: false, message: "Could not record that delivery. Check the server log." };
    }
    await upsertSupplyInSupabase(updated);
  } else {
    await mutateDB((db) => {
      db.supplyPurchases = [...(db.supplyPurchases ?? []), purchase];
      db.supplies = (db.supplies ?? []).map((s) => (s.id === supplyId ? updated : s));
    });
  }

  refreshPos();
  return {
    ok: true,
    message:
      `Added ${qty} ${supply.unit} of ${supply.name}. ` +
      `It now costs about ${position.unitCost.toFixed(2)} per ${supply.unit}.`,
  };
}

/** Correct the shelf by hand — a spill, a miscount, a stocktake. */
export async function adjustStock(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const supplyId = String(formData.get("supplyId") ?? "");
  const supplies = await getSupplyMap(storeSlug);
  const supply = supplies.get(supplyId);
  if (!supply) return { ok: false, message: "That ingredient is not in this pantry." };

  const counted = num(formData.get("counted"), -1);
  if (counted < 0) return { ok: false, message: "Enter what you actually counted." };

  const updated: Supply = { ...supply, stock: counted };

  if (useSupabaseMutations()) {
    if (!(await upsertSupplyInSupabase(updated))) {
      return { ok: false, message: "Could not save that count." };
    }
  } else {
    await mutateDB((db) => {
      db.supplies = (db.supplies ?? []).map((s) => (s.id === supplyId ? updated : s));
    });
  }

  refreshPos();
  const delta = counted - supply.stock;
  return {
    ok: true,
    message:
      delta === 0
        ? `${supply.name} was already right.`
        : `${supply.name} corrected by ${delta > 0 ? "+" : ""}${delta} ${supply.unit}.`,
  };
}

export async function deleteSupply(supplyId: string): Promise<void> {
  const { storeSlug } = await requireTill();
  const supplies = await getSupplyMap(storeSlug);
  if (!supplies.has(supplyId)) return;

  if (useSupabaseMutations()) {
    await deleteSupplyFromSupabase(supplyId);
  } else {
    await mutateDB((db) => {
      db.supplies = (db.supplies ?? []).filter((s) => s.id !== supplyId);
      db.supplyPurchases = (db.supplyPurchases ?? []).filter((p) => p.supplyId !== supplyId);
    });
  }
  refreshPos();
}

// ── Recipes ────────────────────────────────────────────────────────────

/**
 * Save what a batch is made of.
 *
 * The ingredient lines arrive as JSON from the builder, the same way the
 * variant and photo editors work — the whole recipe is one atomic save
 * rather than a line at a time, so a half-written recipe never reaches the
 * costing screen.
 */
export async function saveRecipe(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const productId = String(formData.get("productId") ?? "");
  const product = await getBaseProduct(productId);
  if (!product || product.store !== storeSlug) {
    return { ok: false, message: "Pick which of your products this recipe makes." };
  }

  let submitted: RecipeItem[] = [];
  try {
    submitted = JSON.parse(String(formData.get("itemsJson") ?? "[]")) as RecipeItem[];
  } catch {
    submitted = [];
  }

  const supplies = await getSupplyMap(storeSlug);
  const items = submitted
    .filter((item) => item.supplyId && supplies.has(item.supplyId) && Number(item.qty) > 0)
    .map((item) => ({
      supplyId: item.supplyId,
      qty: Number(item.qty),
      unit: item.unit as SupplyUnit,
    }));

  if (items.length === 0) {
    return { ok: false, message: "Add at least one ingredient with a quantity." };
  }

  const yieldQty = num(formData.get("yield"));
  if (!(yieldQty > 0)) {
    return { ok: false, message: "How many does one batch make?" };
  }

  const existingId = String(formData.get("id") ?? "").trim();
  const recipe: Recipe = {
    id: existingId || id("rec"),
    store: storeSlug,
    productId,
    name: String(formData.get("name") ?? "").trim() || product.name,
    items,
    yield: yieldQty,
    overhead: Math.max(0, num(formData.get("overhead"))),
    updatedAt: new Date().toISOString(),
  };

  if (useSupabaseMutations()) {
    if (!(await upsertRecipeInSupabase(recipe))) {
      return { ok: false, message: "Could not save that recipe. Check the server log." };
    }
  } else {
    await mutateDB((db) => {
      const list = db.recipes ?? [];
      const index = list.findIndex((r) => r.id === recipe.id);
      db.recipes = index >= 0 ? list.map((r) => (r.id === recipe.id ? recipe : r)) : [...list, recipe];
    });
  }

  refreshPos();
  return { ok: true, message: `Saved. One batch makes ${yieldQty} ${recipe.name}.` };
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const { storeSlug } = await requireTill();
  const recipe = await getRecipe(recipeId);
  if (!recipe || recipe.store !== storeSlug) return;

  if (useSupabaseMutations()) {
    await deleteRecipeFromSupabase(recipeId);
  } else {
    await mutateDB((db) => {
      db.recipes = (db.recipes ?? []).filter((r) => r.id !== recipeId);
    });
  }
  refreshPos();
}

/** Put the suggested price (or a typed one) onto the product itself. */
export async function applyPrice(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const productId = String(formData.get("productId") ?? "");
  const product = await getBaseProduct(productId);
  if (!product || product.store !== storeSlug) {
    return { ok: false, message: "That product is not in this shop." };
  }

  const price = num(formData.get("price"));
  if (!(price > 0)) return { ok: false, message: "Enter a price above zero." };

  const saved = await updateProductFields(productId, { price });
  if (!saved && useSupabaseMutations()) {
    return { ok: false, message: "Could not save that price. Check the server log." };
  }
  if (!saved) {
    await mutateDB((db) => {
      db.productOverrides[productId] = { ...db.productOverrides[productId], price };
    });
  }

  refreshPos();
  return { ok: true, message: `${product.name} is now ${price} on the menu and online.` };
}

// ── Making a batch ─────────────────────────────────────────────────────

/**
 * Bake. Takes the ingredients off the shelf and puts finished stock on it.
 *
 * The plan is recomputed here from the LIVE pantry — see the note at the
 * top of this file. If it cannot be made, nothing moves and the reason is
 * the ingredient that ran out, by name.
 */
export async function makeBatch(_prev: PosState, formData: FormData): Promise<PosState> {
  const { storeSlug } = await requireTill();

  const recipeId = String(formData.get("recipeId") ?? "");
  const recipe = await getRecipe(recipeId);
  if (!recipe || recipe.store !== storeSlug) {
    return { ok: false, message: "That recipe is not in this shop." };
  }

  const batches = num(formData.get("batches"), 1);
  const supplies = await getSupplyMap(storeSlug);
  const plan = planProduction(recipe, supplies, batches);

  if (plan.blockers.length > 0) {
    return { ok: false, message: plan.blockers[0] };
  }

  const product = await getBaseProduct(recipe.productId);
  if (!product) return { ok: false, message: "The product this makes no longer exists." };

  const run: ProductionRun = {
    id: id("run"),
    store: storeSlug,
    recipeId,
    batches: Math.floor(batches),
    madeQty: plan.madeQty,
    unitCost: plan.unitCost,
    date: new Date().toISOString().slice(0, 10),
  };

  const moves = plan.consume.map((entry) => ({
    supplyId: entry.supply.id,
    stock: Math.max(0, entry.supply.stock - entry.qty),
  }));

  const nextStock = (product.stock ?? 0) + plan.madeQty;

  if (useSupabaseMutations()) {
    // Finished stock first. If the pantry write then half-fails, the shop
    // has rolls it can sell and a shelf count that needs correcting —
    // which is recoverable. The other order loses the batch entirely.
    const stocked = await updateProductFields(recipe.productId, { stock: nextStock });
    if (!stocked) {
      return { ok: false, message: "Could not add the finished stock. Nothing was used up." };
    }

    const result = await applyStockMovesInSupabase(moves);
    await insertProductionRunInSupabase(run);

    if (!result.ok) {
      const names = result.failed
        .map((supplyId) => supplies.get(supplyId)?.name ?? supplyId)
        .join(", ");
      refreshPos();
      return {
        ok: false,
        message:
          `Made ${plan.madeQty} ${product.name} — but the pantry count for ${names} ` +
          `did not update. Correct it with "Count stock" on the Pantry screen.`,
      };
    }
  } else {
    await mutateDB((db) => {
      const byId = new Map(moves.map((move) => [move.supplyId, move.stock]));
      db.supplies = (db.supplies ?? []).map((supply) =>
        byId.has(supply.id) ? { ...supply, stock: byId.get(supply.id)! } : supply,
      );
      db.productionRuns = [...(db.productionRuns ?? []), run];
      db.productOverrides[recipe.productId] = {
        ...db.productOverrides[recipe.productId],
        stock: nextStock,
      };
    });
  }

  refreshPos();
  return {
    ok: true,
    message:
      `Made ${plan.madeQty} ${product.name}. ` +
      `They cost ${plan.unitCost.toFixed(2)} each — there are now ${nextStock} to sell.`,
  };
}

// ── The till ───────────────────────────────────────────────────────────

export interface SaleResult extends PosState {
  orderId?: string;
  total?: number;
  change?: number;
}

/**
 * Ring up a sale.
 *
 * ── It writes a real order ───────────────────────────────────────────────
 * Not a "POS sale" in a table of its own. The counter's takings then appear
 * in the seller dashboard, the admin's revenue, the customer analytics and
 * the commission engine without any of them being taught that a till
 * exists. `channel: "pos"` is the only thing that distinguishes it.
 *
 * Prices come from the CATALOGUE, never from the browser. A form that posts
 * its own prices is a form that can be edited to post its own prices.
 */
export async function ringUpSale(_prev: SaleResult, formData: FormData): Promise<SaleResult> {
  const { storeSlug } = await requireTill();
  const settings = await getPosSettings(storeSlug);
  if (!settings.enabled) {
    return { ok: false, message: "The counter is switched off for this shop." };
  }

  let submitted: { productId: string; qty: number }[] = [];
  try {
    submitted = JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    submitted = [];
  }

  const wanted = submitted.filter((line) => line.productId && Number(line.qty) > 0);
  if (wanted.length === 0) return { ok: false, message: "Nothing on the counter yet." };

  const lines: TillLine[] = [];
  for (const line of wanted) {
    // getProduct, not getBaseProduct: a promotion running in the shop
    // applies at the counter too. A customer standing in front of the till
    // during a sale should not pay more than one on the website.
    const product = await getProduct(line.productId);
    const base = product ?? (await getBaseProduct(line.productId));
    if (!base || base.store !== storeSlug) {
      return { ok: false, message: "One of those items is not in this shop." };
    }
    lines.push({
      productId: base.id,
      name: base.name,
      price: base.price,
      qty: Math.floor(Number(line.qty)),
    });
  }

  const totals = tillTotals(lines);
  const method = String(formData.get("payment") ?? "cash") as PaymentMethod;
  const cashGiven = num(formData.get("cashGiven"));

  if (method === "cash" && cashGiven > 0 && cashGiven < totals.total) {
    return { ok: false, message: "The cash given is less than the total." };
  }

  const now = new Date();
  const order = {
    id: `POS-${now.getTime().toString(36).toUpperCase()}`,
    customer: String(formData.get("customer") ?? "").trim() || "Walk-in",
    email: "",
    phone: String(formData.get("phone") ?? "").trim(),
    address: "",
    city: "",
    store: storeSlug,
    items: lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      name: line.name,
      price: line.price,
      store: storeSlug,
    })),
    total: totals.total,
    // Paid for and carried out of the shop — it is finished, not pending.
    status: "delivered" as const,
    date: now.toISOString().slice(0, 10),
    seenAt: now.toISOString(),
    timeline: [{ status: "delivered" as const, at: now.toISOString() }],
    channel: "pos" as const,
    payment: method,
  };

  if (useSupabaseMutations()) {
    if (!(await createOrderInSupabase(order))) {
      return { ok: false, message: "Could not record the sale. Nothing was charged." };
    }
  } else {
    await mutateDB((db) => {
      db.newProducts = db.newProducts ?? [];
      db.orderStatus[order.id] = "delivered";
    });
  }

  /*
   * Then take it off the shelf.
   *
   * After the order, deliberately: a sale that is recorded but leaves the
   * stock count high is a counting error somebody can fix, while stock
   * taken for a sale that was never recorded is money missing from the day.
   */
  for (const line of lines) {
    const product = await getBaseProduct(line.productId);
    if (!product) continue;
    const nextStock = Math.max(0, (product.stock ?? 0) - line.qty);
    const saved = await updateProductFields(line.productId, { stock: nextStock });
    if (!saved && !useSupabaseMutations()) {
      await mutateDB((db) => {
        db.productOverrides[line.productId] = {
          ...db.productOverrides[line.productId],
          stock: nextStock,
        };
      });
    }
  }

  refreshPos();

  return {
    ok: true,
    message: `${totals.units} item${totals.units === 1 ? "" : "s"} · ${totals.total}`,
    orderId: order.id,
    total: totals.total,
    change: method === "cash" && cashGiven > 0 ? cashGiven - totals.total : undefined,
  };
}

/** Re-exported so the screens can render defaults without importing lib/pos. */
export async function posDefaults(): Promise<PosSettings> {
  return DEFAULT_POS;
}
