-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — STORAGE SETUP (photo uploads)
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  WHY: the app uploads product/store photos to a Storage bucket named
--  "uploads". That bucket did not exist, so every upload failed silently —
--  the product saved with no images and the dashboard showed
--  "⚠ No photos yet". Creating a bucket needs elevated rights, so it can't
--  be done from the app with the anon key; it has to happen here.
-- ═════════════════════════════════════════════════════════════════════════

-- Public bucket so <img> / next/image can read the files directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  TRUE,
  5242880, -- 5 MB, matching MAX_BYTES in lib/uploads.ts
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/avif','image/gif'];

-- Policies: anyone may read; the dashboards (anon key) may write.
-- Tighten these once real Supabase Auth replaces the demo cookie login.
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

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'uploads';
