/*
  # Add Business Details to Organizations

  1. Changes
    - Add business detail columns to `organizations` table:
      - `business_address` (text) - Physical business address
      - `abn` (text) - ABN / Business registration number
      - `website` (text) - Business website URL
  
  2. Notes
    - All fields are optional (nullable)
    - These fields are used for invoicing and professional correspondence
    - No security changes needed (existing RLS policies cover these fields)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'business_address'
  ) THEN
    ALTER TABLE organizations ADD COLUMN business_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'abn'
  ) THEN
    ALTER TABLE organizations ADD COLUMN abn text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'website'
  ) THEN
    ALTER TABLE organizations ADD COLUMN website text;
  END IF;
END $$;