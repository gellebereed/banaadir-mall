-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — FLASH DEALS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  The flash-deal campaign (one row) and the sellers' applications to it.
--  Until this runs, the app keeps both in data/db.json — which on Netlify
--  is per-server memory, so campaign edits and applications vanish.
--
--  Two older scripts created flash_requests with different columns
--  (schema.sql: original_price / deal_price; migration.sql: pct / note /
--  date). This brings either version to the one the app uses.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.flash_deals (
  id          INT PRIMARY KEY DEFAULT 1,
  active      BOOLEAN DEFAULT TRUE,
  name        TEXT DEFAULT 'Flash Deals',
  ends_at     TEXT DEFAULT '',
  product_ids JSONB DEFAULT '[]'::jsonb
);
INSERT INTO public.flash_deals (id, active, name, ends_at, product_ids)
VALUES (1, TRUE, 'Flash Deals', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.flash_requests (
  id         TEXT PRIMARY KEY,
  store      TEXT NOT NULL,
  product_id TEXT NOT NULL,
  pct        INT NOT NULL DEFAULT 10,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  date       TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.flash_requests ADD COLUMN IF NOT EXISTS pct  INT NOT NULL DEFAULT 10;
ALTER TABLE public.flash_requests ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.flash_requests ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD');
-- A shop's own end for its discount (optional, never after the campaign's).
ALTER TABLE public.flash_requests ADD COLUMN IF NOT EXISTS ends_at TEXT;

-- The schema.sql version required prices the app never sends.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'flash_requests' AND column_name = 'original_price') THEN
    ALTER TABLE public.flash_requests ALTER COLUMN original_price DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'flash_requests' AND column_name = 'deal_price') THEN
    ALTER TABLE public.flash_requests ALTER COLUMN deal_price DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS flash_requests_store_idx ON public.flash_requests (store);

-- ── Row level security ──────────────────────────────────────────────────
-- The app authorises in its server actions and uses the service role key.
-- No policies, so the public key gets no access.
ALTER TABLE public.flash_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_requests ENABLE ROW LEVEL SECURITY;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT id, active, name, ends_at, jsonb_array_length(product_ids) AS products FROM public.flash_deals;
SELECT status, count(*) FROM public.flash_requests GROUP BY status;
