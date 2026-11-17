-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — PRODUCT LABELS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again. Changes no existing data.
-- ═════════════════════════════════════════════════════════════════════════
--
--  A label is a seller's PRIVATE tag on a product — "Clearance",
--  "Winter 2026", "Old stock". Shoppers never see it (the badge on the card
--  stays automatic, lib/badges.ts). Promotions use labels to pick products
--  (include_labels) or to leave some out (exclude_labels). See lib/labels.ts.
--
--  Until this has run, saving a label or a label-based promotion stops with
--  a message pointing here; nothing else changes.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS labels         JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS include_labels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS exclude_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Let PostgREST see the new columns straight away.
NOTIFY pgrst, 'reload schema';

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'labels') AS products_labels,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions'
      AND column_name IN ('include_labels', 'exclude_labels')) AS promotion_label_columns;
