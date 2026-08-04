-- ═══════════════════════════════════════════════════════════════════════
--  CATEGORY COVER IMAGES
-- ═══════════════════════════════════════════════════════════════════════
-- Safe to run more than once.
--
-- The department row on the home page renders a photo instead of an emoji
-- glyph. Where no photo has been set, the storefront falls back to a real
-- product photo from that department (see representativeImages() in
-- lib/api.ts), so this migration is not required for the page to look
-- right — it only enables an admin to CHOOSE the photo rather than take
-- whichever product happens to be first.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image TEXT;

SELECT 'category image column ready' AS status;
