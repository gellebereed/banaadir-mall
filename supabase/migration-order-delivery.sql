-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — PARCEL DELIVERY & COURIER CONTACTS
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  An order spanning three shops is already stored as three order rows —
--  one parcel each (see lib/order-utils.ts). What was missing is everything
--  that happens AFTER the shop packs it:
--
--    orders.delivery   who is carrying THIS parcel and how to reach them
--    orders.timeline   when each status was reached, oldest first
--    stores.couriers   drivers a shop uses regularly, saved once
--
--  Why per parcel and not per order: three shops means three drivers. A
--  single courier field on the order would be wrong for at least two of
--  them, and a customer given the wrong driver's number stops calling at all.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. PARCEL DELIVERY ──────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orders.delivery IS
  '{courier:{name,phone,company}, trackingCode, note, estimatedAt} — the '
  'driver carrying this parcel. One order row = one parcel = one driver.';

COMMENT ON COLUMN public.orders.timeline IS
  'Stamped status history, oldest first: [{status, at, note}]. The current '
  'status says WHAT; this says when, which is how "shipped four days ago '
  'and untouched since" becomes visible.';

-- Existing orders get a first timeline entry from the date they were placed,
-- so their tracking page shows a real starting point instead of an empty
-- journey that reads as "nothing has happened yet".
UPDATE public.orders
SET timeline = jsonb_build_array(
  jsonb_build_object(
    'status', 'pending',
    'at', COALESCE(created_at, NOW())::text
  )
)
WHERE timeline IS NULL OR jsonb_array_length(timeline) = 0;

-- ── 2. SAVED COURIERS PER SHOP ──────────────────────────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS couriers JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.stores.couriers IS
  'Drivers this shop uses regularly: [{name, phone, company}]. Saved once '
  'so dispatching a parcel is a pick from a list, not a re-typed number — '
  'the retyping is the step that gets skipped when the shop is busy.';

-- ── 3. LOOKUP ───────────────────────────────────────────────────────────
-- Customers chase a parcel by ringing the driver, and support looks the
-- parcel up by the number the customer read off their phone.
CREATE INDEX IF NOT EXISTS orders_courier_phone_idx
  ON public.orders ((delivery -> 'courier' ->> 'phone'))
  WHERE delivery IS NOT NULL;

-- Every parcel a driver is currently carrying — what a dispatcher needs
-- when a customer calls asking where their driver has got to.
CREATE OR REPLACE VIEW public.courier_workload AS
SELECT
  o.delivery -> 'courier' ->> 'phone'    AS courier_phone,
  o.delivery -> 'courier' ->> 'name'     AS courier_name,
  o.delivery -> 'courier' ->> 'company'  AS courier_company,
  o.store                                AS store,
  o.id                                   AS order_id,
  o.customer                             AS customer,
  o.city                                 AS city,
  o.status                               AS status,
  o.total                                AS total
FROM public.orders o
WHERE o.delivery -> 'courier' ->> 'phone' IS NOT NULL
  AND o.status IN ('shipped', 'processing');

COMMENT ON VIEW public.courier_workload IS
  'Parcels currently out with a driver, keyed by their phone number.';

GRANT SELECT ON public.courier_workload TO anon, authenticated;

-- ── 4. VERIFY ───────────────────────────────────────────────────────────
SELECT 'Parcel delivery migration completed.' AS result;

SELECT
  COUNT(*)                                                AS parcels,
  COUNT(*) FILTER (WHERE delivery IS NOT NULL)            AS with_courier,
  COUNT(*) FILTER (WHERE status = 'shipped'
                     AND delivery -> 'courier' IS NULL)   AS shipped_but_uncontactable
FROM public.orders;
