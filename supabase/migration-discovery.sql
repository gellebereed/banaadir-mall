-- ═══════════════════════════════════════════════════════════════════════
--  DISCOVERY — admin control of recommendations, product stories, reviews
-- ═══════════════════════════════════════════════════════════════════════
-- Safe to run more than once.
--
-- Everything here degrades gracefully: if this migration is never run, the
-- app falls back to data/db.json exactly as it does for marketing settings,
-- so nothing breaks — the settings simply won't survive a serverless
-- restart. Run it before relying on admin pushes in production.

-- ── Recommender settings ────────────────────────────────────────────────
-- One row, like marketing_settings. The whole config is a JSON blob so
-- adding a switch never needs another migration.
CREATE TABLE IF NOT EXISTS public.reco_settings (
  id           INT PRIMARY KEY DEFAULT 1,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  pin_strength INT     NOT NULL DEFAULT 55,
  shelves      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  pins         JSONB   NOT NULL DEFAULT '[]'::jsonb,
  blocked      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  prompts      JSONB   NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.reco_settings (id, enabled, pin_strength, shelves, pins, blocked, prompts)
VALUES (
  1, true, 55, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '{"enabled":true,"askDepartments":true,"askBudget":true,"askReview":true,"delaySeconds":45,"cooldownDays":14}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ── Product stories ─────────────────────────────────────────────────────
-- The "how to use this / why it matters" episodes shown on product pages
-- and in the Learn section.
CREATE TABLE IF NOT EXISTS public.product_stories (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  kind           TEXT NOT NULL DEFAULT 'how-to',
  product_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
  store          TEXT,
  video_url      TEXT,
  poster         TEXT,
  hero_image     TEXT,
  chapters       JSONB NOT NULL DEFAULT '[]'::jsonb,
  gallery        JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration       TEXT,
  published      BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_stories_published_idx
  ON public.product_stories (published);

-- ── Customer reviews ────────────────────────────────────────────────────
-- Written by the rating prompt after a delivered order. `verified` is only
-- true when the review could be tied to an order that actually arrived —
-- the badge means something, so it is not set optimistically.
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  author     TEXT NOT NULL,
  rating     INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT,
  order_id   TEXT,
  verified   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_reviews_product_idx
  ON public.product_reviews (product_id);

-- One review per customer per product per order, so a repeated submit
-- updates rather than piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_unique_idx
  ON public.product_reviews (product_id, author, COALESCE(order_id, ''));

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- Matches the existing tables: the dashboards write with the anon key.
-- Tighten alongside the others once real Supabase Auth replaces the demo
-- cookie login.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['reco_settings','product_stories','product_reviews']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "banaadir_all_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "banaadir_all_access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

SELECT 'discovery migration complete' AS status;
