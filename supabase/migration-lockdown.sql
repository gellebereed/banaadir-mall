-- ═══════════════════════════════════════════════════════════════════════
--  LOCKDOWN — the public (anon) key loses all access to app data.
-- ═══════════════════════════════════════════════════════════════════════
--
--  BEFORE RUNNING THIS:
--    1. Set SUPABASE_SERVICE_ROLE_KEY in Netlify (Site configuration →
--       Environment variables). Supabase → Project settings → API keys →
--       "service_role" secret.
--    2. Deploy the code that uses it, and check /api/health shows
--       "serviceRole": true.
--  Run this BEFORE step 1 and the site cannot read its own catalogue.
--
--  WHY
--    Every table had a policy `FOR ALL USING (true)`, and the anon key is
--    published in every page. Anyone could read all orders (names, phones,
--    addresses), every staff invite link, and could edit or delete any
--    store's products directly against the database, never touching the
--    app. The server now uses the service role key, which bypasses RLS, so
--    the public key needs no access at all.
--
--  WHAT IT DOES
--    · every table in `public`: RLS on, every existing policy dropped,
--      no new ones — so anon/authenticated get nothing
--    · storage bucket `uploads`: stays PUBLIC (photo URLs keep working),
--      but nobody except the server can upload, replace or delete files
--
--  Safe to run more than once. To undo (not recommended), re-run
--  migration.sql, which recreates the old open policies.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t   RECORD;
  pol RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.tablename
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t.tablename);
    END LOOP;
  END LOOP;
END $$;

-- Storage: public reads are served from the bucket's public URL and need
-- no policy. Writes from the public key are what this removes.
DROP POLICY IF EXISTS "banaadir_uploads_read"   ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "banaadir_uploads_delete" ON storage.objects;

-- Check: this should return no rows.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
   OR (schemaname = 'storage' AND policyname LIKE 'banaadir_%');
