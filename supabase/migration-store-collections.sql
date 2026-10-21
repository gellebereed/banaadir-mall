-- ═══════════════════════════════════════════════════════════════════════
--  STORE COLLECTIONS — a seller's own groupings of their products
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  "Ramadan picks", "Kitchen essentials", "New this week" — shown as tabs
--  on the store's page. Separate from the marketplace category tree on
--  purpose: a store can group however it likes without adding categories
--  every other store would see. See lib/collections.ts.
--
--  Like every table since migration-lockdown.sql: RLS on, NO policies.
--  Only the server (service role key) reads or writes it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.store_collections (
  id           TEXT PRIMARY KEY,
  store        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  product_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- in display order
  position     INTEGER NOT NULL DEFAULT 0,          -- tab order on the store page
  hidden       BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store, slug)
);
CREATE INDEX IF NOT EXISTS store_collections_store_idx ON public.store_collections (store, position);

ALTER TABLE public.store_collections ENABLE ROW LEVEL SECURITY;

SELECT count(*) AS collections FROM public.store_collections;
