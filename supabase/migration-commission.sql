-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — MARKETPLACE COMMISSION
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
--
--  What the marketplace keeps from each sale, edited at /admin/commissions.
--
--  ── Why it hangs off marketing_settings ─────────────────────────────────
--  That table is, despite its name, the single-row platform-settings
--  record: it already carries the delivery charge and the checkout promo
--  code. A second single-row table for one JSON object would buy nothing
--  and cost a second cache tag, a second read path and a second migration.
--
--  ── The default is OFF, deliberately ────────────────────────────────────
--  `enabled: false` and no rules. Applying this migration must not start
--  charging sellers a commission nobody decided on — the rate only comes
--  into force when an admin turns it on and saves it. Until then every
--  payout is the full sale value, exactly as it is today.
--
--  Shape (see CommissionSettings in lib/types.ts):
--    enabled           master switch
--    defaultPct        rate applied when no rule matches
--    orderFee          flat amount per order, for payment processing
--    chargeOnDelivery  whether the delivery the customer paid is charged on
--    showToSellers     show sellers the fee and their payout
--    rules[]           { id, store?, category?, pct, active, note? }
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.marketing_settings
  ADD COLUMN IF NOT EXISTS commission JSONB
  DEFAULT '{"enabled":false,"defaultPct":10,"orderFee":0,"chargeOnDelivery":false,"showToSellers":true,"rules":[]}'::jsonb;

UPDATE public.marketing_settings
SET commission = '{"enabled":false,"defaultPct":10,"orderFee":0,"chargeOnDelivery":false,"showToSellers":true,"rules":[]}'::jsonb
WHERE commission IS NULL;

-- ── VERIFY ──────────────────────────────────────────────────────────────
SELECT id, commission FROM public.marketing_settings;
