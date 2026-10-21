-- ═══════════════════════════════════════════════════════════════════════
--  RECOMMENDATION EVENTS — automatic cleanup
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor AFTER migration-reco-metrics.sql.
--  Safe to run more than once.
--
--  reco_events gets a row for most product page views and nothing reads
--  further back than 60 days, so rows older than 90 days are deleted. The
--  site calls this function itself a few times a day while saving events
--  (lib/reco/metrics.ts) — no scheduled job needed.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reco_events_prune(keep_days INT DEFAULT 90)
RETURNS BIGINT
LANGUAGE sql VOLATILE AS $$
  WITH gone AS (
    DELETE FROM public.reco_events
    WHERE day < current_date - greatest(keep_days, 30)
    RETURNING 1
  )
  SELECT count(*) FROM gone;
$$;

REVOKE ALL ON FUNCTION public.reco_events_prune(INT) FROM PUBLIC, anon, authenticated;

-- Clean up once now, then show what is left (separate statements, so the
-- summary sees the table after the delete).
SELECT public.reco_events_prune(90) AS deleted_now;

SELECT count(*) AS events_kept,
       min(day) AS oldest_day,
       pg_size_pretty(pg_total_relation_size('public.reco_events')) AS table_size
FROM public.reco_events;
