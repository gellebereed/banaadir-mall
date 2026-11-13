-- ─────────────────────────────────────────────────────────────────────────
--  VIEW LOCKDOWN, PART 2 (security audit, 2026-11-13)
-- ─────────────────────────────────────────────────────────────────────────
-- Two views still ran as their owner (SECURITY DEFINER) with SELECT for the
-- public `anon` key, so anyone holding the key that is in every page could
-- read straight past row-level security:
--
--   product_variant_index — every product INCLUDING hidden ones: names,
--                           prices, stock levels, SKUs and barcodes
--   category_tree         — the category tree (public anyway; low impact)
--
-- The app reads neither view (it uses the service-role client), so this
-- changes nothing for shoppers or sellers. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────

alter view public.product_variant_index set (security_invoker = true);
alter view public.category_tree         set (security_invoker = true);

revoke all on public.product_variant_index from anon, authenticated;
revoke all on public.category_tree         from anon, authenticated;
