-- ═════════════════════════════════════════════════════════════════════════
--  BANAADIR MALL — CUSTOMERS PAY EACH SHOP DIRECTLY
--  Run in: Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent: safe to run again at any time.
-- ═════════════════════════════════════════════════════════════════════════
--
--  Until the marketplace takes mobile money itself, a customer pays every
--  shop in their basket on that shop's own numbers (lib/shop-payments.ts):
--
--    stores.payment_methods   what the shop accepts, with its numbers
--    orders.payment           which of them this parcel is paid with
--                             (the column already exists for till sales)
--    orders.payment_status    awaiting → paid, or on_delivery for cash
--    orders.paid_at           when the shop marked it paid
--
--  Before this runs, checkout still works: every shop is treated as cash
--  on delivery, and orders are saved without the payment status.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.stores.payment_methods IS
  '[{kind, number, accountName}] — kind is evc | zaad | edahab | sahal | '
  'premier | bank | cod. Shown to customers as the ONLY numbers to pay this '
  'shop on. Empty means cash on delivery only.';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.payment_status IS
  'awaiting | paid | on_delivery. NULL on orders placed before customers '
  'paid shops directly.';

-- What a seller's "unpaid" list and the admin's chase list look up.
CREATE INDEX IF NOT EXISTS orders_awaiting_payment_idx
  ON public.orders (store, created_at)
  WHERE payment_status = 'awaiting';
