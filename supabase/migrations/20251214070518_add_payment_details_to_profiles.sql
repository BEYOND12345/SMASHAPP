/*
  # Add Payment Details to User Profiles

  1. Changes
    - Add payment-related columns to `user_profiles` table:
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN payment_terms text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bank_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'account_name'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN account_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bsb_routing'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bsb_routing text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN account_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'payment_instructions'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN payment_instructions text;
  END IF;
END $$;