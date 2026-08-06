-- ═══════════════════════════════════════════════════════════════════════
--  products.updated_at — WHEN WAS THIS LAST TOUCHED
-- ═══════════════════════════════════════════════════════════════════════
-- The seller's product list had no way to answer "what was I just working
-- on". It could sort by name, price and stock — none of which is how
-- anybody actually finds the thing they edited five minutes ago in a
-- catalogue of seventeen hundred.
--
-- ── Maintained by a trigger, not by the application ─────────────────────
-- A dozen code paths write to this table: the edit form, the batch
-- toolbar, the importer, the photo importer, the stock sync. Any one of
-- them forgetting to stamp the column would make the sort quietly lie, and
-- a sort that is right most of the time is worse than none. The database
-- stamps it on every UPDATE, so nothing can forget.
--
-- Existing rows are backfilled from created_at rather than NOW(), so the
-- first sort after this runs reflects real history instead of showing the
-- entire catalogue as edited at the same instant.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.products
   SET updated_at = COALESCE(created_at, NOW())
 WHERE updated_at IS NULL;

ALTER TABLE public.products ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.banaadir_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS banaadir_products_touch_updated_at ON public.products;
CREATE TRIGGER banaadir_products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.banaadir_touch_updated_at();

-- Sorting the whole catalogue by this column is the list's default view.
CREATE INDEX IF NOT EXISTS products_updated_at_idx
  ON public.products (updated_at DESC);
