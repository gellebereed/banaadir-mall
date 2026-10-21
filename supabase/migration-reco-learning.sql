-- ═══════════════════════════════════════════════════════════════════════
--  RECOMMENDATIONS THAT LEARN — co-views, per-strategy results, synced
--  profiles
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor AFTER migration-reco-metrics.sql.
--  Safe to run more than once.
--
--  reco_events gains:
--    via       the strategy that put a product on a shelf (auto-tuning)
--    items     on an impression, cards per strategy: {"similar": 5, …}
--    other_id  on a 'coview', the second product viewed in the same visit
--  Still no shopper id, email, session or IP — see lib/reco/metrics.ts.
--
--  reco_profiles: the taste profile of signed-in shoppers who CHOSE to sync
--  it across devices (My account → recommendations). Keyed by a hash of the
--  account, deleted when they switch sync off. See lib/reco/sync.ts.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.reco_events ADD COLUMN IF NOT EXISTS via      TEXT;
ALTER TABLE public.reco_events ADD COLUMN IF NOT EXISTS items    JSONB;
ALTER TABLE public.reco_events ADD COLUMN IF NOT EXISTS other_id TEXT;
ALTER TABLE public.reco_events DROP CONSTRAINT IF EXISTS reco_events_kind_check;
ALTER TABLE public.reco_events ADD CONSTRAINT reco_events_kind_check
  CHECK (kind IN ('impression', 'click', 'cart', 'order', 'coview'));
CREATE INDEX IF NOT EXISTS reco_events_coview_idx ON public.reco_events (day) WHERE kind = 'coview';

-- Shelf totals, now ignoring co-view rows.
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
  WHERE day >= since AND kind <> 'coview'
  GROUP BY surface, shelf
  ORDER BY 7 DESC, 4 DESC;
$$;

-- Per strategy: cards shown (from impressions' items), and what they earned.
CREATE OR REPLACE FUNCTION public.reco_strategy_stats(since DATE)
RETURNS TABLE (via TEXT, impressions BIGINT, clicks BIGINT, carts BIGINT, orders BIGINT)
LANGUAGE sql STABLE AS $$
  WITH shown AS (
    SELECT key AS via, sum(value::int)::bigint AS n
    FROM public.reco_events, jsonb_each_text(items)
    WHERE kind = 'impression' AND day >= since AND items IS NOT NULL
    GROUP BY key
  ), acted AS (
    SELECT via,
           count(*) FILTER (WHERE kind = 'click')  AS clicks,
           count(*) FILTER (WHERE kind = 'cart')   AS carts,
           count(*) FILTER (WHERE kind = 'order')  AS orders
    FROM public.reco_events
    WHERE day >= since AND via IS NOT NULL
    GROUP BY via
  )
  SELECT coalesce(shown.via, acted.via), coalesce(shown.n, 0),
         coalesce(acted.clicks, 0), coalesce(acted.carts, 0), coalesce(acted.orders, 0)
  FROM shown FULL OUTER JOIN acted ON acted.via = shown.via;
$$;

-- Co-view pairs, order-independent, counted.
CREATE OR REPLACE FUNCTION public.reco_coview_pairs(since DATE)
RETURNS TABLE (a TEXT, b TEXT, n BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT least(product_id, other_id), greatest(product_id, other_id), count(*)
  FROM public.reco_events
  WHERE kind = 'coview' AND day >= since AND product_id IS NOT NULL AND other_id IS NOT NULL
  GROUP BY 1, 2
  HAVING count(*) >= 2;
$$;

REVOKE ALL ON FUNCTION public.reco_shelf_stats(DATE)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reco_strategy_stats(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reco_coview_pairs(DATE)   FROM PUBLIC, anon, authenticated;

-- Admin switch for auto-tuning strategy weights (Discovery → Results).
ALTER TABLE public.reco_settings ADD COLUMN IF NOT EXISTS auto_tune BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.reco_profiles (
  account     TEXT PRIMARY KEY,            -- hash of the account email, never the email
  profile     JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reco_profiles ENABLE ROW LEVEL SECURITY;

SELECT (SELECT count(*) FROM public.reco_events WHERE kind = 'coview') AS coviews,
       (SELECT count(*) FROM public.reco_profiles) AS synced_profiles;
