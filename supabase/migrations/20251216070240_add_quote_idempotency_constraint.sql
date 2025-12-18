/*
  # Add Idempotency Constraint to Voice Intakes

  1. Changes
    - Add UNIQUE constraint on `voice_intakes.created_quote_id`
    - Ensures one intake can create at most one quote
    - Prevents duplicate quotes from retries, race conditions, or double-taps

  2. Security
    - No RLS changes (constraint is at data integrity level)
    - Constraint is deferrable to allow flexibility during transactions

  3. Migration Safety
    - Uses IF NOT EXISTS pattern for constraint addition
    - Safe to run multiple times
    - Does not affect existing data (NULLs are allowed in UNIQUE constraints)
*/

-- Add unique constraint to enforce one quote per intake
-- DEFERRABLE INITIALLY IMMEDIATE allows flexibility while maintaining safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'voice_intakes_one_quote_per_intake'
  ) THEN
    ALTER TABLE voice_intakes
    ADD CONSTRAINT voice_intakes_one_quote_per_intake
    UNIQUE (created_quote_id)
    DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;