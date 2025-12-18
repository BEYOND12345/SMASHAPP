/*
  # Rename Idempotency Constraint for Clarity

  1. Changes
    - Rename constraint from `voice_intakes_one_quote_per_intake`
      to `voice_intakes_created_quote_unique`
    - No logic change - purely for clarity

  2. Why This Matters
    - Old name: "one_quote_per_intake" suggests preventing multiple quotes from one intake
    - New name: "created_quote_unique" clearly states that a quote ID can only appear once
    - Intent: One quote can only belong to one intake (prevents reassignment)
    - Future developers will understand the constraint's purpose immediately

  3. Migration Safety
    - Uses IF EXISTS pattern
    - Safe to run multiple times
    - No data changes, only metadata
*/

-- Drop old constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'voice_intakes_one_quote_per_intake'
  ) THEN
    ALTER TABLE voice_intakes
    DROP CONSTRAINT voice_intakes_one_quote_per_intake;
  END IF;
END $$;

-- Add new constraint with clearer name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'voice_intakes_created_quote_unique'
  ) THEN
    ALTER TABLE voice_intakes
    ADD CONSTRAINT voice_intakes_created_quote_unique
    UNIQUE (created_quote_id)
    DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;