-- ═══════════════════════════════════════════════════════════════════════
--  PAYOUTS + ACTIVITY LOG
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  payouts          money the marketplace has sent a store, per month
--  payout_accounts  where each store wants to be paid (private — kept out
--                   of `stores`, whose rows reach the shop pages)
--  activity_log     who changed what, per store and marketplace-wide
--
--  Like every table since migration-lockdown.sql: RLS on, NO policies.
--  Only the server (service role key) reads or writes them.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payouts (
  id         TEXT PRIMARY KEY,
  store      TEXT NOT NULL,
  period     TEXT NOT NULL,              -- "2026-10": the month the sales were delivered in
  amount     NUMERIC(12, 2) NOT NULL,
  method     TEXT,                       -- "EVC Plus", "Zaad", "eDahab", "Bank", "Cash"
  reference  TEXT,                       -- transaction id / receipt number
  note       TEXT,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by    TEXT
);
CREATE INDEX IF NOT EXISTS payouts_store_period_idx ON public.payouts (store, period);

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  store           TEXT PRIMARY KEY,
  method          TEXT NOT NULL,
  account_name    TEXT,
  account_number  TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  store        TEXT,                     -- NULL / 'platform' for marketplace-wide actions
  actor_email  TEXT,
  actor_name   TEXT,
  action       TEXT NOT NULL,            -- e.g. "product.update", "team.remove"
  summary      TEXT NOT NULL,            -- human sentence shown in the log
  target       TEXT                      -- id / slug / email it was about
);
CREATE INDEX IF NOT EXISTS activity_log_store_at_idx ON public.activity_log (store, at DESC);
CREATE INDEX IF NOT EXISTS activity_log_at_idx ON public.activity_log (at DESC);

ALTER TABLE public.payouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log    ENABLE ROW LEVEL SECURITY;

-- Check
SELECT 'payouts' AS table, count(*) FROM public.payouts
UNION ALL SELECT 'payout_accounts', count(*) FROM public.payout_accounts
UNION ALL SELECT 'activity_log', count(*) FROM public.activity_log;
