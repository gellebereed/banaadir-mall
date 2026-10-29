-- ═══════════════════════════════════════════════════════════════════════
--  VIEW LOCKDOWN — close the hole migration-lockdown.sql left in views.
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time. Applied 2026-10-28.
-- ═══════════════════════════════════════════════════════════════════════
--
--  WHY
--    migration-lockdown.sql locked every TABLE away from the public (anon)
--    key, but views were missed. Supabase's default privileges give anon
--    and authenticated ALL rights on anything new in `public`, and a view
--    runs as its owner (postgres, which bypasses RLS) unless it is created
--    with security_invoker. So with the key published in every page anyone
--    could, through these views:
--      · product_margin   read cost/margin, and UPDATE or DELETE products
--      · courier_workload read open orders, and UPDATE or DELETE orders
--    (both are simple views, so Postgres lets writes pass through them).
--
--  WHAT IT DOES
--    · product_margin, courier_workload: no access for anon/authenticated,
--      security_invoker on. The server reads with the service role key.
--    · product_variant_index, category_tree: stay readable (find_by_code
--      and scripts/check-supabase.mjs use them), every other right revoked.
--    · pins search_path on the app's functions (Supabase advisor 0011).
--    · indexes products.store (advisor 0001; store pages filter on it).
--
--  ANY NEW VIEW in `public` gets the same ALL grant: create it
--  WITH (security_invoker = true) and REVOKE what anon should not have.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.product_margin, public.courier_workload FROM anon, authenticated;
ALTER VIEW public.product_margin   SET (security_invoker = true);
ALTER VIEW public.courier_workload SET (security_invoker = true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.product_variant_index, public.category_tree FROM anon, authenticated;

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('banaadir_check_category_parent', 'find_by_code',
                        'banaadir_check_product_codes', 'banaadir_touch_updated_at',
                        'reco_events_prune', 'reco_strategy_stats',
                        'reco_shelf_stats', 'reco_coview_pairs')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS products_store_idx ON public.products (store);

-- Check: anon should have SELECT only, and only on the two catalog views.
SELECT table_name, string_agg(privilege_type, ', ') AS anon_rights
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
  AND table_name IN ('product_margin', 'courier_workload',
                     'product_variant_index', 'category_tree')
GROUP BY table_name;
