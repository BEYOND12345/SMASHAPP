/*
  # Add Payment Details to User Profiles

  1. Changes
    - Add payment-related columns to `organizations` table:
      - `payment_terms` (text) - Payment terms like "Net 30", "Due on receipt"
      - `bank_name` (text) - Name of the bank
      - `account_name` (text) - Account holder name
      - `bsb_routing` (text) - BSB/Sort code/Routing number
      - `account_number` (text) - Bank account number
      - `payment_instructions` (text) - Additional payment notes/instructions
  
  2. Notes
    - All fields are optional (no default values required)
    - No security changes needed (existing RLS policies cover these fields)
*/

DO $$
BEGIN
  -- This migration was originally written for an older schema.
  -- In the current schema, payment details live on `public.organizations`.
  -- When bootstrapping a fresh local DB, `organizations` may not exist yet
  -- (because it is created by a later migration). In that case, no-op.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'default_payment_terms'
  ) THEN
    ALTER TABLE organizations ADD COLUMN default_payment_terms text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE organizations ADD COLUMN bank_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'account_name'
  ) THEN
    ALTER TABLE organizations ADD COLUMN account_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'bsb_routing'
  ) THEN
    ALTER TABLE organizations ADD COLUMN bsb_routing text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE organizations ADD COLUMN account_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'payment_instructions'
  ) THEN
    ALTER TABLE organizations ADD COLUMN payment_instructions text;
  END IF;
END $$;