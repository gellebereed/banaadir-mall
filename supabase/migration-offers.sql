-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — SHOP OFFERS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  Cart offers a shop runs on its own items: "buy 1, get the next for $1",
--  "40% off the next", "buy 2 get 1 free", quantity tiers, spend & save.
--  Priced by lib/offers.ts. The offer itself lives in `data` (jsonb) — its
--  fields vary by kind, and a new kind should not need another migration.
--
--  Opting a shop in to the marketplace promo code or the site-wide
--  campaign needs nothing here: that list is kept inside the existing
--  marketing_settings.promo / .campaign JSON.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.offers (
  id         TEXT PRIMARY KEY,
  store      TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_store_idx ON public.offers (store);

-- ── Row level security ──────────────────────────────────────────────────
-- Same as the counter tables: the app authorises in its server actions
-- and reads/writes with the service role key. No policies, so the public
-- key gets no access.
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT store, count(*) AS offers FROM public.offers GROUP BY store ORDER BY store;
