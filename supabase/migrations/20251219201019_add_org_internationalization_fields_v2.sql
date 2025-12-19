/*
  # Organizations Internationalization Fields

  1. Changes
    - Add country/region settings to organizations
      - `country_code` (text, default 'AU')
      - `currency_code` (text, copied from default_currency)
      - `measurement_system` (text, default 'metric')
    - Add structured business address fields
      - `business_address_line_1`, `business_address_line_2`
      - `business_city`, `business_state_region`, `business_postcode`
      - `business_country_code`
    - Add generic tax identification fields (works for any country)
      - `tax_id_label` (e.g., "ABN", "EIN", "VAT")
      - `tax_id_value` (the actual tax ID number)
      - `tax_registered` (boolean)
      - `tax_name` (e.g., "GST", "VAT", "Sales Tax")
  
  2. Data Migration
    - Backfill Australian organizations with defaults:
      - currency_code from existing default_currency
      - business_country_code = 'AU'
      - tax_id_label = 'ABN', tax_id_value from existing abn field
      - tax_name = 'GST'
      - tax_registered = true if abn exists

  3. Constraints
    - country_code must be 2-letter uppercase (ISO 3166-1 alpha-2)
    - measurement_system must be 'metric' or 'imperial'
    - currency_code must be 3-letter uppercase (ISO 4217)

  IMPORTANT: This is additive only. Existing fields (abn, business_address, default_currency)
  remain intact for backward compatibility.
*/

BEGIN;

-- Add columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS measurement_system text NOT NULL DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS business_address_line_1 text,
  ADD COLUMN IF NOT EXISTS business_address_line_2 text,
  ADD COLUMN IF NOT EXISTS business_city text,
  ADD COLUMN IF NOT EXISTS business_state_region text,
  ADD COLUMN IF NOT EXISTS business_postcode text,
  ADD COLUMN IF NOT EXISTS business_country_code text,
  ADD COLUMN IF NOT EXISTS tax_id_label text,
  ADD COLUMN IF NOT EXISTS tax_id_value text,
  ADD COLUMN IF NOT EXISTS tax_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_name text;

-- Add constraints using DO blocks for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_country_code_chk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_country_code_chk
      CHECK (country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_measurement_system_chk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_measurement_system_chk
      CHECK (measurement_system IN ('metric','imperial'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_currency_code_chk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_currency_code_chk
      CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- Backfill existing organizations
UPDATE public.organizations
SET
  currency_code = COALESCE(currency_code, default_currency),
  business_country_code = COALESCE(business_country_code, country_code),
  tax_id_label = COALESCE(tax_id_label, CASE WHEN country_code = 'AU' THEN 'ABN' ELSE NULL END),
  tax_id_value = COALESCE(tax_id_value, CASE WHEN country_code = 'AU' THEN abn ELSE NULL END),
  tax_name = COALESCE(tax_name, CASE WHEN country_code = 'AU' THEN 'GST' ELSE NULL END),
  tax_registered = COALESCE(tax_registered, CASE WHEN country_code = 'AU' THEN (abn IS NOT NULL AND btrim(abn) <> '') ELSE false END)
WHERE true;

COMMIT;