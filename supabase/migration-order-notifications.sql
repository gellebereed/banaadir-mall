-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — VENDOR ORDER NOTIFICATIONS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  A seller had no way to learn an order arrived. The WhatsApp hand-off on
--  the confirmation screen only fires if the CUSTOMER taps it, so a seller
--  who wasn't already staring at the dashboard found out whenever they
--  next happened to look.
--
--  Two pieces:
--    orders.seen_at   NULL until the seller opens the parcel. Drives the
--                     unread badge, and survives a reload — unlike anything
--                     kept in the browser.
--    realtime         the orders table is published, so an open dashboard
--                     is told about an INSERT the moment it happens rather
--                     than polling every N seconds.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. UNSEEN MARKER ────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.seen_at IS
  'When the seller first opened this parcel. NULL = new, and it is what the '
  'unread badge counts. Set by markOrdersSeen, never by the customer.';

-- Existing orders predate the feature. Marking them seen avoids greeting a
-- seller with a badge of 40 for orders they dealt with weeks ago — the
-- fastest way to teach someone to ignore a badge forever.
UPDATE public.orders SET seen_at = COALESCE(created_at, NOW()) WHERE seen_at IS NULL;

-- The badge query is "unseen parcels for this store", on every dashboard
-- render, so it gets its own partial index.
CREATE INDEX IF NOT EXISTS orders_unseen_by_store_idx
  ON public.orders (store)
  WHERE seen_at IS NULL;

-- ── 2. REALTIME ─────────────────────────────────────────────────────────
-- Publishing the table is what lets an open dashboard hear about a new
-- order instantly. Without it the subscription connects and simply never
-- receives anything, which is worse than no realtime at all: it looks like
-- it works right up until an order actually arrives.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- No supabase_realtime publication (self-hosted Postgres). The
    -- dashboard falls back to polling, so this is a warning, not a failure.
    RAISE NOTICE 'supabase_realtime publication not found — live updates '
                 'will fall back to polling.';
END $$;

-- REPLICA IDENTITY FULL so the payload carries the whole row; the default
-- only sends the primary key, which is not enough to show what arrived.
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- ── 3. VERIFY ───────────────────────────────────────────────────────────
SELECT 'Order notification migration completed.' AS result;

SELECT
  COUNT(*)                                  AS parcels,
  COUNT(*) FILTER (WHERE seen_at IS NULL)   AS unseen
FROM public.orders;

SELECT tablename AS realtime_enabled_for
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders';
