-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — CHECKOUT SETTINGS (delivery fee + promo code)
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  The delivery fee, free-delivery threshold and promo code used to be
--  constants inside app/cart/page.tsx, so changing them meant a code edit
--  and a redeploy. They now live here and are editable from
--  /admin/marketing.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.marketing_settings
  ADD COLUMN IF NOT EXISTS delivery JSONB
  DEFAULT '{"fee":3,"freeThreshold":25,"estimate":"Same-day in Mogadishu · 2–4 days nationwide"}'::jsonb;

ALTER TABLE public.marketing_settings
  ADD COLUMN IF NOT EXISTS promo JSONB
  DEFAULT '{"code":"BANAADIR10","pct":10}'::jsonb;

UPDATE public.marketing_settings
SET delivery = '{"fee":3,"freeThreshold":25,"estimate":"Same-day in Mogadishu · 2–4 days nationwide"}'::jsonb
WHERE delivery IS NULL;

UPDATE public.marketing_settings
SET promo = '{"code":"BANAADIR10","pct":10}'::jsonb
WHERE promo IS NULL;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT id, delivery, promo FROM public.marketing_settings;
