-- ═══════════════════════════════════════════════════════════════════════
--  REVIEW PHOTOS — customers' photos of what actually arrived
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--  Needs migration-discovery.sql (the product_reviews table) first.
--
--  Up to four public image URLs per review, uploaded to the same storage
--  bucket as product photos. Shown on the product page with the review.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

SELECT count(*) FILTER (WHERE photos <> '[]'::jsonb) AS reviews_with_photos,
       count(*) AS reviews
FROM public.product_reviews;
