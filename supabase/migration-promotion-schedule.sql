-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — PROMOTION SCHEDULING
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  Lets a seller queue a promotion to start on a future date and expire on
--  its own, instead of having to remember to switch it off. A promotion is
--  live when it is active AND inside its window; both dates are optional,
--  so leaving them empty keeps the old always-on behaviour.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS ends_at   TIMESTAMPTZ;

-- Storefront pricing filters on these constantly.
CREATE INDEX IF NOT EXISTS promotions_store_active_idx
  ON public.promotions (store, active);

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT id, store, name, pct, active, starts_at, ends_at,
       COALESCE(jsonb_array_length(product_ids), 0) AS product_count
FROM public.promotions
ORDER BY store, name;
