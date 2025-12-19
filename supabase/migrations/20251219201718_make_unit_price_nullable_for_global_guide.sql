/*
  # Make unit_price_cents Nullable for Global Guide Items

  1. Changes
    - Remove NOT NULL constraint from material_catalog_items.unit_price_cents
    - This allows global guide items to store price ranges instead of single prices
    - User catalog items will still have unit_price_cents populated

  2. Logic
    - Global guide items: use typical_low_price_cents and typical_high_price_cents
    - User catalog items: use unit_price_cents
    - Quote line items: always use unit_price_cents (single chosen price)

  IMPORTANT: This is required for the dual-mode catalog to work.
*/

BEGIN;

ALTER TABLE public.material_catalog_items
  ALTER COLUMN unit_price_cents DROP NOT NULL;

COMMIT;