-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — POINT OF SALE (pantry, recipes, batches, counter sales)
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  For the shop that has no till at all — a bakery, a café, a corner
--  kitchen. It answers the question those shops cannot answer today: what
--  does one cinnamon roll actually cost me, and what should I charge?
--
--  ── Off unless a shop turns it on ───────────────────────────────────────
--  `stores.pos` defaults to disabled. A store that already runs a till of
--  its own never sees any of this, and applying this migration changes
--  nothing for anybody until an owner switches it on in their settings.
--
--  ── Counter sales are ORDERS ────────────────────────────────────────────
--  There is no "pos_sales" table on purpose. A sale at the counter is a
--  real sale, so it is written to `orders` with channel = 'pos'. Every
--  figure in the app — the seller dashboard, the admin analytics, the
--  commission engine — then counts it without anyone having to remember it
--  exists. A parallel table is how a marketplace ends up with two revenue
--  numbers that never quite agree.
-- ═════════════════════════════════════════════════════════════════════════

-- ── The switch, and the shop's own pricing preferences ──────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pos JSONB
  DEFAULT '{"enabled":false,"targetMarginPct":35,"roundTo":5,"methods":["cash","evc","edahab"]}'::jsonb;

UPDATE public.stores
SET pos = '{"enabled":false,"targetMarginPct":35,"roundTo":5,"methods":["cash","evc","edahab"]}'::jsonb
WHERE pos IS NULL;

-- ── Where a store's products are allowed to appear ──────────────────────
-- 'marketplace' (default) — browse, search, categories, recommendations,
--   the home page rails and the store directory, exactly as before.
-- 'own-store-only' — none of those. The store page, its product pages, its
--   shareable link, its till and checkout all keep working; it simply stops
--   being SUGGESTED. See Store.listing in lib/types.ts.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS listing TEXT NOT NULL DEFAULT 'marketplace'
  CHECK (listing IN ('marketplace', 'own-store-only'));

-- ── Where a sale happened ───────────────────────────────────────────────
-- NULL means the website, which is what every order placed before the till
-- existed was. Left nullable rather than back-filled so nothing is claimed
-- about historic orders that was not recorded at the time.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment TEXT;

-- ── Things the kitchen buys ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplies (
  id           TEXT PRIMARY KEY,
  store        TEXT NOT NULL REFERENCES public.stores(slug) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- Conversion only ever happens inside a family (see lib/pos.ts), so the
  -- unit a supply is counted in is fixed once and never guessed at.
  unit         TEXT NOT NULL DEFAULT 'kg'
               CHECK (unit IN ('g', 'kg', 'ml', 'l', 'piece', 'dozen')),
  -- What is on the shelf, in `unit`. Moved by purchases and by baking.
  stock        NUMERIC(14, 3) NOT NULL DEFAULT 0,
  -- Weighted average across every purchase. DERIVED — never typed by hand;
  -- see supplyPosition() for why the average and not the latest price.
  unit_cost    NUMERIC(14, 4) NOT NULL DEFAULT 0,
  low_at       NUMERIC(14, 3),
  icon         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplies_store_idx ON public.supplies (store);

-- One pantry entry per name per shop. Two rows called "Flour" is how a
-- kitchen ends up baking from one and buying into the other.
CREATE UNIQUE INDEX IF NOT EXISTS supplies_store_name_idx
  ON public.supplies (store, lower(name));

-- ── What was bought, and for how much ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supply_purchases (
  id           TEXT PRIMARY KEY,
  store        TEXT NOT NULL REFERENCES public.stores(slug) ON DELETE CASCADE,
  supply_id    TEXT NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  qty          NUMERIC(14, 3) NOT NULL,
  -- What the receipt says IN TOTAL. Nobody has the per-unit figure in front
  -- of them, and making them divide it is where the typos come from.
  total_cost   NUMERIC(14, 2) NOT NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supply_purchases_store_idx ON public.supply_purchases (store);
CREATE INDEX IF NOT EXISTS supply_purchases_supply_idx ON public.supply_purchases (supply_id);

-- ── What one batch is made of ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipes (
  id           TEXT PRIMARY KEY,
  store        TEXT NOT NULL REFERENCES public.stores(slug) ON DELETE CASCADE,
  -- The product that actually gets sold. Deleting the product takes its
  -- recipe with it: a recipe for something the shop no longer sells is
  -- clutter that outlives its usefulness immediately.
  product_id   TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- [{ supplyId, qty, unit }] — see RecipeItem in lib/types.ts.
  items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- How many sellable units one batch yields.
  yield_qty    NUMERIC(12, 2) NOT NULL DEFAULT 1,
  -- Gas, boxes, the hour it takes. Optional, and the reason a price built
  -- from flour and sugar alone leaves a kitchen working for nothing.
  overhead     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recipes_store_idx ON public.recipes (store);

-- ── Batches actually made ───────────────────────────────────────────────
-- The audit trail behind every stock movement the till did not cause.
CREATE TABLE IF NOT EXISTS public.production_runs (
  id           TEXT PRIMARY KEY,
  store        TEXT NOT NULL REFERENCES public.stores(slug) ON DELETE CASCADE,
  recipe_id    TEXT NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  batches      NUMERIC(10, 2) NOT NULL DEFAULT 1,
  made_qty     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- Stamped at the time, not recomputed later: what a tray cost in March
  -- is a fact about March, and today's flour price must not restate it.
  unit_cost    NUMERIC(14, 4) NOT NULL DEFAULT 0,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS production_runs_store_idx ON public.production_runs (store);

-- ── Row level security ──────────────────────────────────────────────────
-- Matches how the rest of this schema is set up: the app authenticates and
-- authorises in the server actions (requireVendor / assertOwnsStore), and
-- reads go through the anon key.
ALTER TABLE public.supplies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplies' AND policyname = 'supplies_all') THEN
    CREATE POLICY supplies_all ON public.supplies FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supply_purchases' AND policyname = 'supply_purchases_all') THEN
    CREATE POLICY supply_purchases_all ON public.supply_purchases FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recipes' AND policyname = 'recipes_all') THEN
    CREATE POLICY recipes_all ON public.recipes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_runs' AND policyname = 'production_runs_all') THEN
    CREATE POLICY production_runs_all ON public.production_runs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT 'supplies' AS table, count(*) FROM public.supplies
UNION ALL SELECT 'supply_purchases', count(*) FROM public.supply_purchases
UNION ALL SELECT 'recipes', count(*) FROM public.recipes
UNION ALL SELECT 'production_runs', count(*) FROM public.production_runs;
