-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — SUBCATEGORIES
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  Subcategories are created implicitly: a seller types one on a product
--  (e.g. "Cookware" under Home & Living) and it immediately becomes a
--  filter on that category page and a suggestion for the next product.
--  No separate admin screen and no second table to keep in sync.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Category pages filter on (category, subcategory), so index the pair.
CREATE INDEX IF NOT EXISTS products_category_subcategory_idx
  ON public.products (category, subcategory);

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT category, COALESCE(subcategory, '(none)') AS subcategory, COUNT(*)
FROM public.products
GROUP BY category, subcategory
ORDER BY category, subcategory;
