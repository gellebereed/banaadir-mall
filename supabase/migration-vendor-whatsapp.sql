-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — VENDOR WHATSAPP NUMBERS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  Order notifications are sent to each store's OWN WhatsApp number, so a
--  multi-vendor order reaches every vendor with just their own items.
--  Without a number on file a store falls back to the platform number,
--  which means one person manually relaying orders — so this column is
--  what turns the feature on per seller.
--
--  `stores.phone` already existed but was never read by the app. The read
--  layer falls back to it (lib/supabase/db-api.ts), and the backfill below
--  copies it across, so no seller has to re-type a number they already gave.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone    TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Seed from the existing contact number where one was entered.
UPDATE public.stores
SET whatsapp = NULLIF(BTRIM(phone), '')
WHERE (whatsapp IS NULL OR BTRIM(whatsapp) = '')
  AND phone IS NOT NULL
  AND BTRIM(phone) <> '';

-- Blank is "no number", never an empty string — the app tests for absence
-- to decide whether to fall back to the platform number.
UPDATE public.stores SET whatsapp = NULL WHERE BTRIM(COALESCE(whatsapp, '')) = '';
UPDATE public.stores SET phone    = NULL WHERE BTRIM(COALESCE(phone, ''))    = '';

COMMENT ON COLUMN public.stores.whatsapp IS
  'International WhatsApp number in bare digits (e.g. 252613334444). '
  'Order notifications are sent here; normalised on save by lib/whatsapp.ts.';

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                   AS stores,
  COUNT(*) FILTER (WHERE whatsapp IS NOT NULL)               AS can_receive_orders,
  COUNT(*) FILTER (WHERE whatsapp IS NULL AND status = 'active')
                                                             AS active_without_number
FROM public.stores;

SELECT slug, name, whatsapp
FROM public.stores
WHERE status = 'active'
ORDER BY (whatsapp IS NULL) DESC, slug;
