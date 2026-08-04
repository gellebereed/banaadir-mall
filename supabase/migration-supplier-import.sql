-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — SUPPLIER FILE IMPORT
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS ADDS
--  Two columns, both filled by the product importer
--  (/vendor/products/import) and by nothing else:
--
--    products.cost           Odoo standard_price — what a unit cost to buy.
--    products.supplier_meta  Brand, line, season, composition, HS code and
--                            the invoice the stock arrived on.
--
--  WHY cost IS A COLUMN AND NOT A NUMBER IN A SPREADSHEET
--  A supplier invoice carries cost, never retail. The importer derives the
--  selling price from it with a per-category markup — so without cost stored,
--  re-pricing a category later means going back to the original invoice and
--  re-deriving 909 numbers by hand. It is never exposed to customers: no
--  storefront query selects it, and it is absent from product_variant_index.
--
--  WHY supplier_meta IS JSONB
--  An HS code, a season and a shipment number are worth keeping and worth
--  nothing on the storefront — they are never filtered, sorted or joined on.
--  Four columns that no query touches is four columns of schema churn; one
--  document is honest about what they are.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. COLUMNS ──────────────────────────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost NUMERIC(12, 2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_meta JSONB;

COMMENT ON COLUMN public.products.cost IS
  'Purchase cost per unit (Odoo standard_price). Internal only — never '
  'exposed on the storefront. Written by the supplier file importer.';

COMMENT ON COLUMN public.products.supplier_meta IS
  'Import provenance: brand, line, season, composition, hsCode, invoiceNo, '
  'invoiceDate, importedAt. Reference data, never merchandised.';

-- A cost below zero is always a parsing accident (a credit note line, or a
-- minus sign that belonged to the quantity), and it would produce a
-- negative selling price on the next re-pricing run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonnegative'
  ) THEN
    UPDATE public.products SET cost = NULL WHERE cost < 0;
    ALTER TABLE public.products
      ADD CONSTRAINT products_cost_nonnegative CHECK (cost IS NULL OR cost >= 0);
  END IF;
END $$;

-- ── 2. LOOKUPS THE IMPORTER RUNS ────────────────────────────────────────
-- Matching a draft product to an existing one reads every barcode and
-- internal reference in the store. The catalogue-wide indexes from
-- migration-odoo-catalog.sql already cover the codes; this one covers the
-- "show me everything from invoice X" question a stock query asks.
CREATE INDEX IF NOT EXISTS products_supplier_invoice_idx
  ON public.products ((supplier_meta ->> 'invoiceNo'))
  WHERE supplier_meta IS NOT NULL;

-- ── 3. MARGIN VIEW ──────────────────────────────────────────────────────
-- What the cost column is FOR. One row per product that has a cost, with
-- the margin the current selling price actually earns — the check that
-- catches a markup applied to the wrong category before a season's worth
-- of stock has been sold at it.
CREATE OR REPLACE VIEW public.product_margin AS
SELECT
  p.id,
  p.slug,
  p.name,
  p.store,
  p.category,
  p.cost,
  p.price,
  p.stock,
  ROUND(p.price - p.cost, 2)                                  AS margin_per_unit,
  CASE WHEN p.price > 0
       THEN ROUND(((p.price - p.cost) / p.price) * 100, 1)
  END                                                          AS margin_pct,
  CASE WHEN p.cost > 0
       THEN ROUND(p.price / p.cost, 2)
  END                                                          AS markup_multiple,
  ROUND(p.cost * COALESCE(p.stock, 0), 2)                      AS stock_at_cost,
  ROUND(p.price * COALESCE(p.stock, 0), 2)                     AS stock_at_retail,
  p.supplier_meta ->> 'brand'                                  AS brand,
  p.supplier_meta ->> 'season'                                 AS season,
  p.supplier_meta ->> 'invoiceNo'                              AS invoice_no
FROM public.products p
WHERE p.cost IS NOT NULL;

COMMENT ON VIEW public.product_margin IS
  'Cost, price and margin per product. Sellers and admins only — this view '
  'is deliberately NOT granted to anon.';

-- Storefront visitors must never reach cost data, so `anon` is left out.
GRANT SELECT ON public.product_margin TO authenticated;

-- ── 4. VERIFY ───────────────────────────────────────────────────────────
SELECT 'Supplier import migration completed.' AS result;

SELECT COUNT(*)                                   AS products,
       COUNT(cost)                                AS with_cost,
       COUNT(supplier_meta)                       AS with_supplier_meta
FROM public.products;
