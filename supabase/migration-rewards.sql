-- ═══════════════════════════════════════════════════════════════════════
--  REWARDS & ALERTS — the two reasons a customer comes back
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  1. marketing_settings.rewards   the programme: on/off, the two rates,
--                                  and the shops that joined (lib/rewards.ts)
--  2. orders.reward                { "earn": 1.20, "spent": 3.00 } stamped
--                                  on each parcel when it is placed. A
--                                  customer's wallet is worked out from
--                                  these — there is no balance table.
--  3. product_alerts               "tell me on WhatsApp when…" sign-ups
--                                  (lib/alert-utils.ts)
--
--  Until this is run, switching rewards on reports that it is needed and
--  saves nothing, and the alert button tells shoppers to try again later.
--  Nothing else changes.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS rewards JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reward JSONB;

CREATE TABLE IF NOT EXISTS public.product_alerts (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL,
  store       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('arrival', 'stock', 'price')),
  phone       TEXT NOT NULL,                 -- international digits
  name        TEXT,
  email       TEXT,
  lang        TEXT,
  price_then  NUMERIC(10, 2),                -- a price alert fires below this
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,                   -- NULL = still waiting
  sent_via    TEXT                           -- 'manual' | 'auto'
);

-- Every read is "the open alerts of one shop".
CREATE INDEX IF NOT EXISTS product_alerts_open_idx
    ON public.product_alerts (store, created_at)
 WHERE sent_at IS NULL;

-- Customers' phone numbers: the server (service role) only. RLS on with no
-- policies means the browser's anon key can neither read nor write a row.
ALTER TABLE public.product_alerts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

SELECT (SELECT count(*) FROM public.product_alerts WHERE sent_at IS NULL) AS open_alerts,
       (SELECT rewards IS NOT NULL FROM public.marketing_settings WHERE id = 1) AS rewards_saved;
