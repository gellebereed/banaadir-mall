-- ═══════════════════════════════════════════════════════════════════════
--  PRE-ORDERS — selling stock that is still on its way
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  One JSON column holds everything about a product's pre-order
--  (lib/preorder.ts):
--
--    { "arrivesAt": "2026-11-25",   the date the shop expects the stock
--      "total": 40,                 units opened for pre-order
--      "earlyPct": 10,              early price, until it lands (optional)
--      "note": "…",                 one line from the shop (optional)
--      "startedAt": "…",            when pre-orders opened
--      "arrivedAt": "…" }           set when the shop marks it arrived
--
--  NULL — every existing row — means "an ordinary product", so nothing
--  changes for the catalogue until a seller opens a pre-order.
--
--  Until this is run, a seller who ticks "take pre-orders" is told to run
--  it and nothing is saved; everything else keeps working as before.
--  "New" badges need nothing: they are measured from products.created_at,
--  which the table has always had.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preorder JSONB;

-- The storefront lists open pre-orders (/preorder); they are a handful of
-- rows out of thousands, so index only those.
CREATE INDEX IF NOT EXISTS products_preorder_idx
    ON public.products ((preorder ->> 'arrivesAt'))
 WHERE preorder IS NOT NULL;

-- PostgREST caches the table's columns; tell it there is a new one.
NOTIFY pgrst, 'reload schema';

SELECT count(*) FILTER (WHERE preorder IS NOT NULL AND preorder ->> 'arrivedAt' IS NULL) AS open_preorders,
       count(*) AS total
FROM public.products;
