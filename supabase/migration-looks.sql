-- ═══════════════════════════════════════════════════════════════════════
--  SHOP THE LOOK — whole outfits on one photo, every piece tappable
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  A look is one outfit photo with a dot on each piece, each dot linked to
--  a product. Shops make their own at /vendor/looks; the admin makes
--  marketplace looks that mix shops at /admin/looks. See lib/look-utils.ts.
--
--  The "whole look" discount is NOT stored here as a price: it is an
--  ordinary bundle offer in public.offers (offer_id points at it), so the
--  basket and the checkout price it like every other offer.
--
--  Like every table since migration-lockdown.sql: RLS on, NO policies.
--  Only the server (service role key) reads or writes it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.looks (
  id            TEXT PRIMARY KEY,
  store         TEXT,                                   -- NULL = marketplace look
  title         TEXT NOT NULL,
  description   TEXT,
  image         TEXT NOT NULL,
  occasions     JSONB NOT NULL DEFAULT '[]'::jsonb,     -- ["eid","wedding",…]
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{productId,x,y}], x/y in % of the photo
  discount_pct  NUMERIC,
  offer_id      TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS looks_store_idx ON public.looks (store);
CREATE INDEX IF NOT EXISTS looks_feed_idx ON public.looks (active, position, created_at DESC);

ALTER TABLE public.looks ENABLE ROW LEVEL SECURITY;

SELECT count(*) AS looks FROM public.looks;
