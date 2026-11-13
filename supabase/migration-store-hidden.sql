-- Hide a store from shoppers while it is being set up (Store.hidden in
-- lib/types.ts). The admin switches it in /admin/stores; the store's owner
-- keeps using the dashboard, shoppers see nothing of the store.
--
-- Safe to run more than once. Existing stores stay visible (default false).
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
