-- ═══════════════════════════════════════════════════════════════════════
--  ONE PERSON, SEVERAL TEAMS
-- ═══════════════════════════════════════════════════════════════════════
-- migration-employee-permissions.sql made an email unique across the whole
-- employees table: one person, one team. The Team pages have since learned
-- that the same person can work for two shops (Session.stores and the
-- store switcher), but this index still refused the second row — so
-- inviting someone already on another team failed in the database.
--
-- What has to be unique is the PAIR: one row per email per store (the
-- platform team counts as a store, "platform").
--
-- Run in Supabase → SQL Editor. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.employees_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS employees_email_store_key
  ON public.employees (lower(email), store);
