-- ═══════════════════════════════════════════════════════════════════════
--  RECOMMENDATION METRICS — what each shelf earns
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  One row per event: a shelf seen, a product tapped from it, added to the
--  basket, bought. NO shopper id, email, session or IP — see
--  lib/reco/metrics.ts. /admin/discovery reads the totals through
--  reco_shelf_stats().
--
--  RLS on, no policies: only the server (service role key) writes or reads.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reco_events (
  id          BIGSERIAL PRIMARY KEY,
  day         DATE        NOT NULL DEFAULT current_date,
  kind        TEXT        NOT NULL CHECK (kind IN ('impression', 'click', 'cart', 'order')),
  surface     TEXT        NOT NULL,
  shelf       TEXT        NOT NULL,
  product_id  TEXT,
  value       NUMERIC(12, 2)
);
CREATE INDEX IF NOT EXISTS reco_events_day_idx ON public.reco_events (day, surface, shelf);
ALTER TABLE public.reco_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reco_shelf_stats(since DATE)
RETURNS TABLE (surface TEXT, shelf TEXT, impressions BIGINT, clicks BIGINT, carts BIGINT, orders BIGINT, revenue NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT surface, shelf,
         count(*) FILTER (WHERE kind = 'impression'),
         count(*) FILTER (WHERE kind = 'click'),
         count(*) FILTER (WHERE kind = 'cart'),
         count(*) FILTER (WHERE kind = 'order'),
         coalesce(sum(value) FILTER (WHERE kind = 'order'), 0)
  FROM public.reco_events
  WHERE day >= since
  GROUP BY surface, shelf
  ORDER BY 7 DESC, 4 DESC;
$$;
REVOKE ALL ON FUNCTION public.reco_shelf_stats(DATE) FROM PUBLIC, anon, authenticated;

SELECT count(*) AS reco_events FROM public.reco_events;
