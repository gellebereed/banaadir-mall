-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — COMPLETE SUPABASE MIGRATION
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--  It is idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  WHY THIS IS NEEDED
--  The app's product/store model is richer than the tables that were
--  created. Missing columns caused two visible bugs:
--    1. Product edits appeared to save but reverted — stock was squeezed
--       into an `in_stock` boolean and read back as a hard-coded 50, while
--       icon / colours / sizes / default variant had nowhere to be stored.
--    2. The "Official Brand Stores" section vanished from the home page —
--       there was no `official` column, so every store read back as false.
-- ═════════════════════════════════════════════════════════════════════════

-- ── PRODUCTS ────────────────────────────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_variant_id TEXT;
-- Feature bullets are plain strings. They used to be forced through the
-- `specs` {name,value} shape, which mangled them on every save.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;

-- Give existing rows a real stock number instead of the boolean guess.
UPDATE public.products SET stock = 50 WHERE stock IS NULL OR (stock = 0 AND in_stock = true);
UPDATE public.products SET stock = 0  WHERE in_stock = false;

-- Carry any old specs across into features so nothing is lost.
UPDATE public.products
SET features = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN COALESCE(s->>'value','') = '' THEN s->>'name'
         ELSE (s->>'name') || ': ' || (s->>'value') END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(specs) AS s
)
WHERE features = '[]'::jsonb
  AND specs IS NOT NULL
  AND jsonb_typeof(specs) = 'array'
  AND jsonb_array_length(specs) > 0;

-- ── STORES ──────────────────────────────────────────────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🛍️';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS followers INT DEFAULT 100;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS joined_year INT DEFAULT 2026;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT TRUE;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS official BOOLEAN DEFAULT FALSE;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb;

-- Franchised international brands — this is what the home page's
-- "Official Brand Stores" row is built from.
UPDATE public.stores SET official = TRUE, verified = TRUE
WHERE slug IN (
  'karaca-home', 'us-polo-assn', 'altinyildiz-classics', 'ozdilek-home'
);

-- Sensible per-store branding so cards aren't all identical.
UPDATE public.stores SET icon = '🍳', category = 'home-living',
  art = '{"from":"#7f1d1d","to":"#ef4444"}'::jsonb WHERE slug = 'karaca-home';
UPDATE public.stores SET icon = '🐎', category = 'mens-fashion',
  art = '{"from":"#172554","to":"#b91c1c"}'::jsonb WHERE slug = 'us-polo-assn';
UPDATE public.stores SET icon = '🎩', category = 'mens-fashion',
  art = '{"from":"#0f172a","to":"#64748b"}'::jsonb WHERE slug = 'altinyildiz-classics';
UPDATE public.stores SET icon = '🛁', category = 'home-living',
  art = '{"from":"#0c4a6e","to":"#38bdf8"}'::jsonb WHERE slug = 'ozdilek-home';
UPDATE public.stores SET icon = '🔌', category = 'electronics',
  art = '{"from":"#1e3a8a","to":"#0ea5e9"}'::jsonb WHERE slug = 'somali-electronics';
UPDATE public.stores SET icon = '🧴', category = 'beauty',
  art = '{"from":"#581c87","to":"#c084fc"}'::jsonb WHERE slug = 'banaadir-perfumes';

-- ── PROMOTIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotions (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  pct INT NOT NULL DEFAULT 10,
  active BOOLEAN DEFAULT TRUE,
  product_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS product_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- ── EMPLOYEES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  added_at TIMESTAMPTZ DEFAULT now()
);

-- ── FLASH DEALS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flash_deals (
  id INT PRIMARY KEY DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  name TEXT DEFAULT 'Flash Deals',
  ends_at TEXT DEFAULT '',
  product_ids JSONB DEFAULT '[]'::jsonb
);
INSERT INTO public.flash_deals (id, active, name, ends_at, product_ids)
VALUES (1, TRUE, 'Flash Deals', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.flash_requests (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  product_id TEXT NOT NULL,
  pct INT NOT NULL DEFAULT 10,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── MARKETING SETTINGS ──────────────────────────────────────────────────
-- One row holds the whole home-page layout the admin edits.
INSERT INTO public.marketing_settings (id, announcement, hero_badge, hero_title_top,
  hero_title_highlight, hero_subtitle, sections, banners, promo_tiles, campaign)
VALUES (
  1,
  'Free delivery in Mogadishu on orders over $25 · Pay with EVC Plus, Zaad & eDahab',
  '🇸🇴 Proudly Somali · Trusted local stores',
  'The whole market,',
  'in your pocket.',
  'Shop electronics, fashion, beauty and more from Somalia''s best stores. Pay with EVC Plus, Zaad, eDahab or cash on delivery.',
  '[{"key":"banners","visible":true},{"key":"promoTiles","visible":true},{"key":"categories","visible":true},{"key":"brands","visible":true},{"key":"flash","visible":true},{"key":"value","visible":true},{"key":"trending","visible":true},{"key":"stores","visible":true},{"key":"new","visible":true}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '{"active":false,"name":"Eid Mega Sale","pct":10}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- The dashboards write with the anon key, so writes must be permitted.
-- Tighten these once real Supabase Auth replaces the demo cookie login.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','stores','categories','orders','promotions',
                           'employees','flash_deals','flash_requests','marketing_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "banaadir_all_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "banaadir_all_access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT slug, name, official, verified, icon, category FROM public.stores ORDER BY official DESC, slug;
SELECT id, name, stock, icon, jsonb_array_length(COALESCE(features,'[]'::jsonb)) AS feature_count
FROM public.products ORDER BY id;
