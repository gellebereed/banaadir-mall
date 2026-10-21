-- ═══════════════════════════════════════════════════════════════════════
--  REVIEW MODERATION — reports from shoppers, and the admin's decision
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--  Needs migration-discovery.sql (the product_reviews table) first.
--
--  reported_by   hashed ids of the shoppers who reported it (one each)
--  hidden        out of the shop — by the admin, or after 3 reports
--  hidden_reason 'reports' | 'admin'
--  approved      the admin kept it; further reports no longer hide it
--  See lib/review-moderation.ts and /admin/reviews.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS reported_by   JSONB   NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS hidden        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS approved      BOOLEAN NOT NULL DEFAULT false;

SELECT count(*) FILTER (WHERE hidden) AS hidden,
       count(*) FILTER (WHERE jsonb_array_length(reported_by) > 0) AS reported,
       count(*) AS reviews
FROM public.product_reviews;
