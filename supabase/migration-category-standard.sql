-- ═══════════════════════════════════════════════════════════════════════
--  CATEGORY → STANDARD TAXONOMY
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  Each Banaadir category is linked to the node of the standard product
--  taxonomy (Shopify's, MIT — lib/taxonomy/standard.json) that it means.
--  Set from /admin/categories/standard. See lib/taxonomy.ts.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS standard_id TEXT;
CREATE INDEX IF NOT EXISTS categories_standard_id_idx ON public.categories (standard_id);

SELECT count(*) FILTER (WHERE standard_id IS NOT NULL) AS linked,
       count(*) AS total
FROM public.categories;
