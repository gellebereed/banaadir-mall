-- ═══════════════════════════════════════════════════════════════════════
--  CATEGORY MAPPINGS — supplier groupings onto the marketplace's tree.
-- ═══════════════════════════════════════════════════════════════════════
--  Run in the Supabase SQL editor. Safe to run more than once.
--
--  Imports no longer create categories. Each supplier grouping is mapped
--  onto an existing category (by the seller in the import wizard, or by
--  the admin from /admin/categories), and the decision is remembered here
--  so the next import from that supplier files itself.
--  See lib/category-mappings.ts.
--
--  Like every table since migration-lockdown.sql: RLS on, NO policies.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.category_mappings (
  store        TEXT NOT NULL,
  source_key   TEXT NOT NULL,      -- normalised supplier grouping
  source_name  TEXT,               -- as the supplier wrote it
  category     TEXT NOT NULL,      -- categories.slug
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store, source_key)
);

ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;

-- The hidden "Needs a category" shelf is created by the app the first time
-- an import needs it.

SELECT count(*) AS mappings FROM public.category_mappings;
