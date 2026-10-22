-- Somali (and later other languages) for the storefront copy the admin
-- writes in /admin/marketing: the announcement bar and the home page hero.
-- Shape: { "so": { "announcement": "...", "heroTitleTop": "...", ... } }
-- See lib/marketing-copy.ts. Safe to run more than once.
alter table marketing_settings add column if not exists translations jsonb;
