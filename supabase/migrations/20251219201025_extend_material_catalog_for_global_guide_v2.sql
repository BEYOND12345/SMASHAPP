/*
  # Extend Material Catalog for Global Pricing Guide

  1. New Columns
    - `region_code` (text) - 'AU', 'US', 'UK', 'NZ' for global guide items
    - `trade_group` (text) - 'Handyman', 'Painting', 'Carpentry', etc.
    - `category_group` (text) - 'Paint', 'Timber', 'Hardware', etc.
    - `typical_low_price_cents` (bigint) - Suggested range low
    - `typical_high_price_cents` (bigint) - Suggested range high
    - `search_aliases` (text) - Comma-separated keywords for AI matching
    - `is_core` (boolean) - True for commonly used items
    - `gst_mode` (text) - 'ex_gst' or 'inc_gst' for Australian pricing

  2. Dual Mode Operation
    - User items: org_id IS NOT NULL, region_code IS NULL
    - Global guide: org_id IS NULL, region_code IS NOT NULL
    - Enforced by check constraint

  3. Indexes
    - org_id for user catalog lookups
    - region_code for filtering guide by country
    - (region_code, trade_group) for trade-specific catalog
    - (region_code, is_core) for showing core items first

  4. Constraints
    - region_code must be 2-letter uppercase
    - gst_mode must be 'ex_gst' or 'inc_gst'
    - typical_low_price_cents <= typical_high_price_cents
    - Dual mode: EITHER org_id OR region_code, never both, never neither

  IMPORTANT: Existing material_catalog_items rows (user-created) remain unchanged.
  New global guide rows will be seeded with org_id=NULL, region_code='AU'.
*/

BEGIN;

-- Add columns
ALTER TABLE public.material_catalog_items
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS trade_group text,
  ADD COLUMN IF NOT EXISTS category_group text,
  ADD COLUMN IF NOT EXISTS typical_low_price_cents bigint,
  ADD COLUMN IF NOT EXISTS typical_high_price_cents bigint,
  ADD COLUMN IF NOT EXISTS search_aliases text,
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_mode text NOT NULL DEFAULT 'ex_gst';

-- Add constraints using DO blocks for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_catalog_items_region_code_chk'
  ) THEN
    ALTER TABLE public.material_catalog_items
      ADD CONSTRAINT material_catalog_items_region_code_chk
      CHECK (region_code IS NULL OR region_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_catalog_items_gst_mode_chk'
  ) THEN
    ALTER TABLE public.material_catalog_items
      ADD CONSTRAINT material_catalog_items_gst_mode_chk
      CHECK (gst_mode IN ('ex_gst','inc_gst'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_catalog_items_price_range_chk'
  ) THEN
    ALTER TABLE public.material_catalog_items
      ADD CONSTRAINT material_catalog_items_price_range_chk
      CHECK (
        typical_low_price_cents IS NULL OR typical_high_price_cents IS NULL
        OR typical_low_price_cents <= typical_high_price_cents
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_catalog_items_dual_mode_chk'
  ) THEN
    ALTER TABLE public.material_catalog_items
      ADD CONSTRAINT material_catalog_items_dual_mode_chk
      CHECK (
        (org_id IS NOT NULL AND region_code IS NULL)
        OR
        (org_id IS NULL AND region_code IS NOT NULL)
      );
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_material_catalog_items_org_id
  ON public.material_catalog_items (org_id);

CREATE INDEX IF NOT EXISTS idx_material_catalog_items_region_code
  ON public.material_catalog_items (region_code);

CREATE INDEX IF NOT EXISTS idx_material_catalog_items_region_trade
  ON public.material_catalog_items (region_code, trade_group);

CREATE INDEX IF NOT EXISTS idx_material_catalog_items_region_is_core
  ON public.material_catalog_items (region_code, is_core);

COMMIT;