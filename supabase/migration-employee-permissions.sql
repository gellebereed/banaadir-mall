-- ═══════════════════════════════════════════════════════════════════════
--  EMPLOYEE INVITATIONS & FINE-GRAINED PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════
-- Adds, to the existing `employees` table:
--
--   permissions   explicit grants, overriding the role's defaults. NULL
--                 means "whatever the role implies", which is what every
--                 employee added before this migration keeps.
--   status        'pending' until the invite is opened, then 'active'.
--   invite_token  the secret in the invite link. Rotating it kills the
--                 old link, which is the only way to withdraw an invite
--                 that has already been sent to somebody.
--   invited_at    when the invite was created.
--   accepted_at   when they first signed in.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS invited_at TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS accepted_at TEXT;

-- One person, one account. Two rows with the same email would make the
-- sign-in lookup below pick whichever the database returned first, and the
-- invite link resolve to a different one — silently handing somebody the
-- wrong store's dashboard.
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_key
  ON public.employees (lower(email));

-- The invite link is looked up by token on every visit to /invite/<token>.
CREATE UNIQUE INDEX IF NOT EXISTS employees_invite_token_key
  ON public.employees (invite_token)
  WHERE invite_token IS NOT NULL;

-- Existing rows are deliberately left 'pending'. They were added by a Team
-- page that could not actually let anybody in, so "pending" is the truth:
-- the sign-in that flips a row to 'active' has never happened for any of
-- them. The owner sees them as awaiting their first sign-in and can send
-- them a link, which is exactly the state they are in.
