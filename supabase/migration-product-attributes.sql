-- ═══════════════════════════════════════════════════════════════════════
--  PRODUCT ATTRIBUTES — the values storefront filters are built from
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  { "fabric": ["cotton"], "neckline": ["v-neck"] } — keys and values come
--  from the standard taxonomy's fixed lists (lib/taxonomy-attributes.ts),
--  which is what lets two stores' products share one filter. Colour and
--  size are also read off variants, so those filters work without this.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS products_attributes_idx ON public.products USING GIN (attributes);

SELECT count(*) FILTER (WHERE attributes <> '{}'::jsonb) AS with_attributes,
       count(*) AS total
FROM public.products;
