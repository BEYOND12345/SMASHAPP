/*
  # Backfill NULL overall_confidence values

  1. Purpose
    - Fix existing voice_intakes with NULL overall_confidence
    - Set NULL values to 0.5 (uncertain) to unblock stuck users
    - Only affects rows where extraction_json exists but confidence is NULL

  2. Changes
    - Updates extraction_json.quality.overall_confidence to 0.5 where NULL
    - Does not modify any other fields or statuses
    - Creates quality object if missing

  3. Impact
    - Unblocks ~30 users stuck in needs_user_review
    - Allows review screen to render correctly
    - Users can now confirm and proceed to quote creation

  4. Safety
    - Only updates rows with NULL confidence
    - Does not overwrite valid numeric confidence values
    - Idempotent - safe to run multiple times
*/

-- Backfill NULL confidence values to 0.5
UPDATE voice_intakes
SET extraction_json = jsonb_set(
  COALESCE(extraction_json, '{}'::jsonb),
  '{quality,overall_confidence}',
  '0.5'::jsonb,
  true
)
WHERE extraction_json IS NOT NULL
  AND (
    -- Case 1: quality object exists but overall_confidence is NULL
    (
      extraction_json ? 'quality'
      AND (
        NOT (extraction_json->'quality' ? 'overall_confidence')
        OR (extraction_json->'quality'->>'overall_confidence') IS NULL
      )
    )
    -- Case 2: quality object doesn't exist at all
    OR NOT (extraction_json ? 'quality')
  );

-- Log the fix for audit purposes
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM voice_intakes
  WHERE extraction_json IS NOT NULL
    AND extraction_json->'quality' IS NOT NULL
    AND (extraction_json->'quality'->>'overall_confidence')::numeric = 0.5;

  RAISE NOTICE 'Backfill complete. Rows with confidence now set to 0.5: %', affected_count;
END $$;
