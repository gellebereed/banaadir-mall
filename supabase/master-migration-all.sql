-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — MASTER DATABASE & STORAGE MIGRATION
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--  It is 100% idempotent: completely safe to run anytime without overwriting data.
-- ═════════════════════════════════════════════════════════════════════════

-- 1. BRANDS TABLE
CREATE TABLE IF NOT EXISTS public.brands (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏷️',
  tagline TEXT,
  official BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🏷️';
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS official BOOLEAN DEFAULT TRUE;

-- 2. CATEGORIES TABLE COLUMNS
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS art JSONB DEFAULT '{"from":"#e0f2fe","to":"#bae6fd"}'::jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_slug TEXT;

-- 3. PRODUCTS TABLE COLUMNS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price NUMERIC;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 4.8;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reviews_count INT DEFAULT 12;

-- 4. STORES TABLE COLUMNS
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS badge TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Mogadishu';

-- 5. PROMOTIONS TABLE COLUMNS
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS badge_text TEXT;

-- 6. MARKETING SETTINGS TABLE COLUMNS
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS announcement_bg_color TEXT DEFAULT '#0c2b34';
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS announcement_text_color TEXT DEFAULT '#ffffff';
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS announcement_scroll BOOLEAN DEFAULT TRUE;
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS announcement_speed INT DEFAULT 25;

-- 7. ENABLE ROW LEVEL SECURITY (RLS) FOR ALL TABLES
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','stores','categories','brands','orders','promotions',
                           'employees','flash_deals','flash_requests','marketing_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "banaadir_all_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "banaadir_all_access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 8. STORAGE BUCKET setup for product & banner uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  TRUE,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif'];

-- Storage bucket RLS policies
DROP POLICY IF EXISTS "banaadir_uploads_read"   ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_delete" ON storage.objects;

CREATE POLICY "banaadir_uploads_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'uploads');

CREATE POLICY "banaadir_uploads_insert"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "banaadir_uploads_update"
  ON storage.objects FOR UPDATE USING (bucket_id = 'uploads') WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "banaadir_uploads_delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'uploads');

-- ═════════════════════════════════════════════════════════════════════════
--  NEXT: run supabase/migration-odoo-catalog.sql
--  It adds the Odoo product identity fields (internal_reference, barcode,
--  uom), turns categories into a tree via parent_slug, and installs the
--  uniqueness rules + the product_variant_index / category_tree views.
--  Kept separate because it creates triggers and views that are easier to
--  review — and to re-run on their own — than another 200 lines here.
-- ═════════════════════════════════════════════════════════════════════════

-- VERIFICATION
SELECT 'Migration completed successfully!' AS result;
