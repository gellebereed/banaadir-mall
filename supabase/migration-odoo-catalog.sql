-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — ODOO-COMPATIBLE PRODUCT STRUCTURE
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS ADDS
--  The catalogue gains the three things an Odoo database keys on, so the
--  two systems can be connected later without a reconciliation project:
--
--    products.internal_reference   Odoo product.template.default_code
--    products.barcode              Odoo product.template.barcode
--    products.uom                  Odoo product.template.uom_id (name)
--    products.odoo_id              Odoo product.template.id
--    variants[].sku / .barcode     Odoo product.product.default_code/.barcode
--    categories.parent_slug        Odoo product.category.parent_id  → a TREE
--    categories.odoo_id            Odoo product.category.id
--
--  AND THE RULES THAT MAKE THEM TRUSTWORTHY
--    · A barcode identifies exactly ONE sellable unit, marketplace-wide.
--      Odoo enforces this on product.product; so do we, across products
--      AND the variants nested inside them.
--    · An internal reference is likewise unique, case-insensitively.
--      Without this, "krc-tenc-24" and "KRC-TENC-24" import as two products.
--    · A category cannot be its own ancestor.
--
--  Variants stay in the existing JSONB column — the app reads and writes
--  them as one document and that behaviour is unchanged. What's new is
--  `product_variant_index`, a view that FLATTENS them into one row per
--  sellable unit, which is the shape Odoo's product.product has and the
--  shape a barcode scan needs to resolve against.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 0. PREREQUISITES ────────────────────────────────────────────────────
-- Columns from earlier migrations that the views below read. Declared here
-- too so this file can be run on its own without a cryptic "column stock
-- does not exist" from the middle of a CREATE VIEW.
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- ── 1. PRODUCT IDENTITY COLUMNS ─────────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS internal_reference TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'Units';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS odoo_id BIGINT;
-- Odoo's write_date for the record we last pulled. An incremental sync asks
-- Odoo for `write_date > max(odoo_synced_at)` instead of re-reading the
-- whole catalogue every run.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ;

-- Empty strings are not "no barcode" — they would collide with each other
-- under a unique index. Normalise before the indexes are created.
UPDATE public.products SET internal_reference = NULLIF(BTRIM(internal_reference), '')
WHERE internal_reference IS NOT NULL AND BTRIM(internal_reference) = '';
UPDATE public.products SET barcode = NULLIF(BTRIM(barcode), '')
WHERE barcode IS NOT NULL AND BTRIM(barcode) = '';
UPDATE public.products SET uom = 'Units' WHERE uom IS NULL OR BTRIM(uom) = '';

-- ── 2. CATEGORY TREE COLUMNS ────────────────────────────────────────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_slug TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS odoo_id BIGINT;

-- A parent that doesn't exist would strand every child, so point the FK at
-- the real column and null the link out if a parent is ever deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_slug_fkey'
  ) THEN
    -- Drop links to categories that were deleted before the FK existed.
    UPDATE public.categories c SET parent_slug = NULL
    WHERE parent_slug IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.categories p WHERE p.slug = c.parent_slug);
    UPDATE public.categories SET parent_slug = NULL WHERE parent_slug = slug;

    ALTER TABLE public.categories
      ADD CONSTRAINT categories_parent_slug_fkey
      FOREIGN KEY (parent_slug) REFERENCES public.categories(slug) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. UNIQUENESS ───────────────────────────────────────────────────────
-- Partial indexes: only rows that HAVE a code are constrained, so the many
-- products still without one don't collide on NULL.

-- Case-insensitive, because an Odoo import matching on default_code must
-- not be able to create a second product differing only in casing.
CREATE UNIQUE INDEX IF NOT EXISTS products_internal_reference_uniq
  ON public.products (LOWER(internal_reference))
  WHERE internal_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uniq
  ON public.products (barcode)
  WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_odoo_id_uniq
  ON public.products (odoo_id)
  WHERE odoo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_odoo_id_uniq
  ON public.categories (odoo_id)
  WHERE odoo_id IS NOT NULL;

-- Scanning at the counter looks a code up on every keystroke, and variant
-- codes live inside JSONB — without this it is a full table scan each time.
CREATE INDEX IF NOT EXISTS products_variants_gin
  ON public.products USING GIN (variants jsonb_path_ops);

CREATE INDEX IF NOT EXISTS categories_parent_slug_idx
  ON public.categories (parent_slug);

-- ── 4. product_variant_index — THE product.product PROJECTION ───────────
-- One row per sellable unit. A product with no variants yields exactly one
-- row (its own codes), which is precisely how Odoo materialises a template
-- with no attributes into a single product.product.
CREATE OR REPLACE VIEW public.product_variant_index AS
SELECT
  p.id                                   AS product_id,
  p.slug                                 AS product_slug,
  p.name                                 AS product_name,
  p.store                                AS store,
  p.category                             AS category,
  p.hidden                               AS hidden,
  COALESCE(v.value ->> 'id', p.id)       AS variant_id,
  -- Variant code wins; the template's is the fallback. Same precedence
  -- Odoo applies when reading product.product.default_code.
  NULLIF(BTRIM(COALESCE(NULLIF(BTRIM(v.value ->> 'sku'), ''), p.internal_reference)), '')
                                         AS default_code,
  NULLIF(BTRIM(COALESCE(NULLIF(BTRIM(v.value ->> 'barcode'), ''), p.barcode)), '')
                                         AS barcode,
  NULLIF(BTRIM(CONCAT_WS(' · ', NULLIF(BTRIM(v.value ->> 'color'), ''),
                                NULLIF(BTRIM(v.value ->> 'size'), ''))), '')
                                         AS variant_label,
  COALESCE(NULLIF(v.value ->> 'price', '')::NUMERIC, p.price)      AS price,
  COALESCE(NULLIF(v.value ->> 'stock', '')::NUMERIC, p.stock, 0)   AS qty_available,
  COALESCE(p.uom, 'Units')               AS uom,
  (v.value IS NOT NULL)                  AS is_variant
FROM public.products p
LEFT JOIN LATERAL jsonb_array_elements(
  -- Guard the cast: a row whose `variants` is null or an object (rather
  -- than an array) must still produce its single template row.
  CASE WHEN jsonb_typeof(p.variants) = 'array' THEN p.variants ELSE '[]'::jsonb END
) AS v ON TRUE;

COMMENT ON VIEW public.product_variant_index IS
  'One row per sellable unit — the Odoo product.product projection of '
  'products + their JSONB variants. Query this for barcode/SKU lookups.';

-- ── 5. category_tree — THE product.category PROJECTION ──────────────────
-- Recursive, so `complete_name` reads "Home & Living / Cookware" exactly as
-- Odoo displays it, and `depth`/`root_slug` drive the storefront navigation.
CREATE OR REPLACE VIEW public.category_tree AS
WITH RECURSIVE tree AS (
  SELECT
    c.slug, c.name, c.parent_slug, c.odoo_id,
    0                      AS depth,
    c.name::TEXT           AS complete_name,
    c.slug                 AS root_slug,
    ARRAY[c.slug]          AS path
  FROM public.categories c
  WHERE c.parent_slug IS NULL

  UNION ALL

  SELECT
    c.slug, c.name, c.parent_slug, c.odoo_id,
    t.depth + 1,
    (t.complete_name || ' / ' || c.name)::TEXT,
    t.root_slug,
    t.path || c.slug
  FROM public.categories c
  JOIN tree t ON c.parent_slug = t.slug
  -- Belt and braces: even if a cycle were somehow written, the recursion
  -- terminates instead of hanging the database.
  WHERE NOT c.slug = ANY (t.path)
)
SELECT slug, name, parent_slug, odoo_id, depth, complete_name, root_slug, path
FROM tree;

COMMENT ON VIEW public.category_tree IS
  'Recursive category hierarchy with Odoo-style complete_name paths.';

-- ── 6. GLOBAL CODE UNIQUENESS (products + nested variants) ──────────────
-- The partial indexes above cover template-level codes. Variant codes live
-- inside JSONB where no index can reach them, so a trigger closes the gap.
-- Without it, two sellers could both label a box 8691106123456 and every
-- scan afterwards would be ambiguous.
CREATE OR REPLACE FUNCTION public.banaadir_check_product_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_variants   JSONB;
  v_variant_n  INT;
  v_codes      TEXT[];
  v_refs       TEXT[];
  v_dup        TEXT;
BEGIN
  -- Normalise: blank is "no code", never an empty string.
  NEW.internal_reference := NULLIF(BTRIM(NEW.internal_reference), '');
  NEW.barcode            := NULLIF(BTRIM(NEW.barcode), '');
  NEW.uom                := COALESCE(NULLIF(BTRIM(NEW.uom), ''), 'Units');

  v_variants := CASE WHEN jsonb_typeof(NEW.variants) = 'array'
                     THEN NEW.variants ELSE '[]'::jsonb END;
  v_variant_n := jsonb_array_length(v_variants);

  /*
   * A SINGLE-VARIANT PRODUCT IS ITS VARIANT.
   *
   * product.template and product.product are two rows describing one thing
   * whenever there is only one variant, and they carry the SAME
   * default_code and barcode. Counting the template's own codes as a
   * separate claimant rejected that entirely normal shape — which is every
   * product that does not come in colours and sizes.
   *
   * So the product's own codes join the WITHIN-product duplicate pool only
   * when there are two or more variants, where a template code sitting on
   * one specific variant genuinely is ambiguous. Cross-product checks below
   * always include them: sharing a code with another product is never fine.
   */

  -- Every barcode this row claims against ITSELF.
  SELECT ARRAY(
    SELECT code FROM (
      SELECT CASE WHEN v_variant_n > 1 THEN NEW.barcode ELSE NULL::TEXT END AS code
      UNION ALL
      SELECT NULLIF(BTRIM(e.value ->> 'barcode'), '')
      FROM jsonb_array_elements(v_variants) AS e
    ) codes WHERE code IS NOT NULL
  ) INTO v_codes;

  -- (a) Duplicates WITHIN this product — two variants sharing one barcode.
  SELECT c INTO v_dup
  FROM unnest(v_codes) AS c
  GROUP BY c HAVING COUNT(*) > 1
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Barcode "%" is used by more than one variant of this product. Each colour/size needs its own barcode.',
      v_dup USING ERRCODE = '23505';
  END IF;

  -- (b) Duplicates against the REST of the catalogue. The view reads the
  -- pre-update state of this row, so exclude it by id.
  SELECT ARRAY(
    SELECT code FROM (
      SELECT NEW.barcode AS code
      UNION ALL
      SELECT NULLIF(BTRIM(e.value ->> 'barcode'), '')
      FROM jsonb_array_elements(v_variants) AS e
    ) codes WHERE code IS NOT NULL
  ) INTO v_codes;

  IF array_length(v_codes, 1) > 0 THEN
    SELECT i.barcode INTO v_dup
    FROM public.product_variant_index i
    WHERE i.product_id <> NEW.id
      AND i.barcode = ANY (v_codes)
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION
        'Barcode "%" already belongs to another product in the marketplace.',
        v_dup USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Same treatment for internal references, compared case-insensitively.
  SELECT ARRAY(
    SELECT UPPER(ref) FROM (
      SELECT CASE WHEN v_variant_n > 1 THEN NEW.internal_reference ELSE NULL::TEXT END AS ref
      UNION ALL
      SELECT NULLIF(BTRIM(e.value ->> 'sku'), '')
      FROM jsonb_array_elements(v_variants) AS e
    ) refs WHERE ref IS NOT NULL
  ) INTO v_refs;

  SELECT r INTO v_dup
  FROM unnest(v_refs) AS r
  GROUP BY r HAVING COUNT(*) > 1
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Internal reference "%" is used by more than one variant of this product.',
      v_dup USING ERRCODE = '23505';
  END IF;

  SELECT ARRAY(
    SELECT UPPER(ref) FROM (
      SELECT NEW.internal_reference AS ref
      UNION ALL
      SELECT NULLIF(BTRIM(e.value ->> 'sku'), '')
      FROM jsonb_array_elements(v_variants) AS e
    ) refs WHERE ref IS NOT NULL
  ) INTO v_refs;

  IF array_length(v_refs, 1) > 0 THEN
    SELECT i.default_code INTO v_dup
    FROM public.product_variant_index i
    WHERE i.product_id <> NEW.id
      AND UPPER(i.default_code) = ANY (v_refs)
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
      RAISE EXCEPTION
        'Internal reference "%" already belongs to another product in the marketplace.',
        v_dup USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS banaadir_product_codes_guard ON public.products;
CREATE TRIGGER banaadir_product_codes_guard
  BEFORE INSERT OR UPDATE OF internal_reference, barcode, variants, uom
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.banaadir_check_product_codes();

-- ── 7. CATEGORY CYCLE GUARD ─────────────────────────────────────────────
-- Odoo raises "You cannot create recursive categories". A cycle here would
-- hang the recursive view and orphan every product beneath it.
CREATE OR REPLACE FUNCTION public.banaadir_check_category_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cursor TEXT;
  v_guard  INT := 0;
BEGIN
  NEW.parent_slug := NULLIF(BTRIM(NEW.parent_slug), '');
  IF NEW.parent_slug IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_slug = NEW.slug THEN
    RAISE EXCEPTION 'A category cannot be its own parent.' USING ERRCODE = '23514';
  END IF;

  -- Walk up from the proposed parent; meeting ourselves means a cycle.
  v_cursor := NEW.parent_slug;
  WHILE v_cursor IS NOT NULL AND v_guard < 64 LOOP
    IF v_cursor = NEW.slug THEN
      RAISE EXCEPTION
        'Cannot file "%" under "%" — that would make the category its own ancestor.',
        NEW.slug, NEW.parent_slug USING ERRCODE = '23514';
    END IF;
    SELECT parent_slug INTO v_cursor FROM public.categories WHERE slug = v_cursor;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS banaadir_category_parent_guard ON public.categories;
CREATE TRIGGER banaadir_category_parent_guard
  BEFORE INSERT OR UPDATE OF parent_slug
  ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.banaadir_check_category_parent();

-- ── 8. SCAN LOOKUP ──────────────────────────────────────────────────────
-- What a barcode scanner (or the admin search box) calls. Matches a barcode
-- first, then falls back to the internal reference, both case-insensitively.
CREATE OR REPLACE FUNCTION public.find_by_code(p_code TEXT)
RETURNS SETOF public.product_variant_index
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.product_variant_index
  WHERE p_code IS NOT NULL AND BTRIM(p_code) <> ''
    AND (barcode = BTRIM(p_code) OR UPPER(default_code) = UPPER(BTRIM(p_code)))
  ORDER BY (barcode = BTRIM(p_code)) DESC;
$$;

-- Views inherit the underlying tables' RLS, so no extra policies are needed;
-- these grants just make them reachable through PostgREST.
GRANT SELECT ON public.product_variant_index TO anon, authenticated;
GRANT SELECT ON public.category_tree         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_by_code(TEXT) TO anon, authenticated;

-- ── 9. VERIFY ───────────────────────────────────────────────────────────
SELECT 'Odoo catalogue migration completed.' AS result;

-- Sellable units and how many are scannable today:
SELECT COUNT(*)                             AS sellable_units,
       COUNT(barcode)                       AS with_barcode,
       COUNT(default_code)                  AS with_internal_reference
FROM public.product_variant_index;

-- The category hierarchy as Odoo would print it:
SELECT depth, complete_name, slug, parent_slug
FROM public.category_tree
ORDER BY complete_name;
