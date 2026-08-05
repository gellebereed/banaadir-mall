-- ═══════════════════════════════════════════════════════════════════════
--  A SINGLE-VARIANT PRODUCT MAY SHARE ITS OWN CODES WITH ITS VARIANT
-- ═══════════════════════════════════════════════════════════════════════
-- Replaces banaadir_check_product_codes() from migration-odoo-catalog.sql.
--
-- ── What was wrong ──────────────────────────────────────────────────────
-- The guard pooled the product's own internal_reference and barcode
-- together with every variant's sku and barcode, then rejected the row if
-- any value appeared twice. For clothing that is right: two variants
-- sharing a barcode makes a scan ambiguous.
--
-- But in Odoo a product.template and its single product.product are two
-- rows describing ONE thing, and they carry the SAME default_code and the
-- same barcode. That is the shape of every product that does not come in
-- colours and sizes — kitchenware, appliances, homeware, most of retail.
--
-- So an import of 1,714 such products failed on all 1,714 rows with
--   Internal reference "DC2363" is used by more than one variant of this
--   product.
-- naming a reference that appeared exactly once, on the one variant there
-- was. The codes were correct; the check counted the template as a variant.
--
-- ── The rule now ────────────────────────────────────────────────────────
--   · variants must never duplicate each other                (unchanged)
--   · the product's own code may equal its ONLY variant's code (allowed)
--   · with 2+ variants, the product's own code must still not
--     collide with any of them — there it really is ambiguous  (unchanged)
--   · cross-product uniqueness                                 (unchanged)
--
-- Safe to run more than once, and safe to run before or after
-- migration-employee-permissions.sql.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.banaadir_check_product_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_variants     JSONB;
  v_variant_n    INT;
  v_codes        TEXT[];
  v_refs         TEXT[];
  v_dup          TEXT;
BEGIN
  -- Normalise: blank is "no code", never an empty string.
  NEW.internal_reference := NULLIF(BTRIM(NEW.internal_reference), '');
  NEW.barcode            := NULLIF(BTRIM(NEW.barcode), '');
  NEW.uom                := COALESCE(NULLIF(BTRIM(NEW.uom), ''), 'Units');

  v_variants := CASE WHEN jsonb_typeof(NEW.variants) = 'array'
                     THEN NEW.variants ELSE '[]'::jsonb END;
  v_variant_n := jsonb_array_length(v_variants);

  -- ── BARCODES ─────────────────────────────────────────────────────────
  -- The product's own barcode joins the pool only when there are two or
  -- more variants. With one (or none) it names the same physical item the
  -- variant does, and repeating it is not a duplicate.
  SELECT ARRAY(
    SELECT code FROM (
      SELECT CASE WHEN v_variant_n > 1 THEN NEW.barcode ELSE NULL::TEXT END AS code
      UNION ALL
      SELECT NULLIF(BTRIM(e.value ->> 'barcode'), '')
      FROM jsonb_array_elements(v_variants) AS e
    ) codes WHERE code IS NOT NULL
  ) INTO v_codes;

  SELECT c INTO v_dup
  FROM unnest(v_codes) AS c
  GROUP BY c HAVING COUNT(*) > 1
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Barcode "%" is used by more than one variant of this product. Each colour/size needs its own barcode.',
      v_dup USING ERRCODE = '23505';
  END IF;

  -- Against the rest of the catalogue. The product's own barcode is always
  -- included here — sharing one with ANOTHER product is never acceptable,
  -- however many variants either of them has.
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

  -- ── INTERNAL REFERENCES ──────────────────────────────────────────────
  -- Same treatment, compared case-insensitively.
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
