import type { Metadata } from "next";
import Link from "next/link";
import RecipeBuilder from "@/components/pos/RecipeBuilder";
import {
  getAllProductsByStore,
  getPosSettings,
  getRecipes,
  getSupplies,
  getSupplyMap,
} from "@/lib/api";
import { money } from "@/lib/format";
import { batchCapacity, recipeCost, suggestPrice, trim } from "@/lib/pos";
import { requireVendor } from "@/lib/session";

export const metadata: Metadata = { title: "Recipes" };

/**
 * The recipe list, and the builder for whichever one is open.
 *
 * `?id=` opens an existing recipe, `?new=1` starts a blank one. Kept in the
 * URL rather than in client state so the back button behaves and a
 * half-finished recipe survives a reload — on a phone in a kitchen, that
 * happens.
 */
export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; new?: string }>;
}) {
  const { storeSlug } = await requireVendor();
  const params = await searchParams;

  const [recipes, products, supplies, supplyMap, settings] = await Promise.all([
    getRecipes(storeSlug),
    getAllProductsByStore(storeSlug),
    getSupplies(storeSlug),
    getSupplyMap(storeSlug),
    getPosSettings(storeSlug),
  ]);

  const open = params.id ? recipes.find((recipe) => recipe.id === params.id) : undefined;
  const writing = Boolean(params.new) || Boolean(open);

  if (writing) {
    return (
      <div>
        <Link
          href="/vendor/pos/recipes"
          className="text-sm font-semibold text-ocean-700 hover:underline"
        >
          ← All recipes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-ocean-950">
          {open ? open.name : "New recipe"}
        </h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Add what goes in, say how many come out, and it works out the rest.
        </p>

        <RecipeBuilder
          recipe={open}
          product={open ? products.find((p) => p.id === open.productId) : undefined}
          products={products}
          supplies={supplies}
          settings={settings}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Recipes</h1>
          <p className="mt-1 text-sm text-slate-500">
            What each thing is made of, what it costs you, and what to charge.
          </p>
        </div>
        <Link href="/vendor/pos/recipes?new=1" className="btn-primary !py-2.5 text-sm">
          + New recipe
        </Link>
      </div>

      {recipes.length === 0 ? (
        <div className="card p-8 text-center">
          <span className="text-4xl">🥐</span>
          <p className="mt-3 font-display font-bold text-ocean-950">No recipes yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            A recipe is just a list: flour, sugar, eggs, milk — and how many
            come out. Once it is written, the app can tell you what each one
            costs and what to sell it for.
          </p>
          <Link href="/vendor/pos/recipes?new=1" className="btn-primary mt-5">
            Write the first one
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {recipes.map((recipe) => {
            const product = products.find((p) => p.id === recipe.productId);
            const cost = recipeCost(recipe, supplyMap);
            const capacity = batchCapacity(recipe, supplyMap);
            const suggested = suggestPrice(cost.unitCost, settings);
            const underpriced =
              product && cost.unitCost > 0 && product.price < cost.unitCost;

            return (
              <Link
                key={recipe.id}
                href={`/vendor/pos/recipes?id=${recipe.id}`}
                className="card p-5 transition hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-2xl">
                    {product?.icon ?? "🥐"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold text-ocean-950">
                      {recipe.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {recipe.items.length} ingredient
                      {recipe.items.length === 1 ? "" : "s"} → {trim(recipe.yield)}{" "}
                      {product?.name ?? "items"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-sand-50 p-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">
                      Costs
                    </p>
                    <p className="font-display text-sm font-extrabold text-ocean-950">
                      {money(cost.unitCost)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-sand-50 p-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">
                      Sells at
                    </p>
                    <p className="font-display text-sm font-extrabold text-ocean-950">
                      {product ? money(product.price) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">
                      Suggest
                    </p>
                    <p className="font-display text-sm font-extrabold text-emerald-700">
                      {suggested > 0 ? money(suggested) : "—"}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  {capacity.batches > 0
                    ? `🥣 Enough for ${capacity.batches} more batch${capacity.batches === 1 ? "" : "es"} (${capacity.units} items)`
                    : "🛒 Not enough in the pantry for a batch"}
                </p>

                {underpriced && (
                  <p className="mt-2 rounded-lg bg-coral-100/60 px-2.5 py-1.5 text-xs font-semibold text-coral-700">
                    ⚠ Selling below what it costs to make
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
