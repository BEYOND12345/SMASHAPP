/*
  IDEMPOTENCY EVIDENCE QUERIES

  These queries test the idempotent behavior of create-draft-quote.
  Run these in order to verify the implementation.
*/

-- ============================================================================
-- EVIDENCE 0: ROW-LEVEL LOCKING VERIFICATION
-- ============================================================================

-- Verify the locking function exists and uses FOR UPDATE
SELECT
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'lock_voice_intake_for_quote_creation'
AND n.nspname = 'public';

-- Expected result:
-- - function_name = 'lock_voice_intake_for_quote_creation'
-- - function_definition contains 'FOR UPDATE'
-- This proves the function uses row-level locking

-- Verify the renamed constraint exists
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'voice_intakes_created_quote_unique';

-- Expected result:
-- - constraint_name = 'voice_intakes_created_quote_unique'
-- - constraint_type = 'u' (unique)
-- - constraint_definition contains 'UNIQUE (created_quote_id)'

-- Test the locking function directly
-- This simulates what create-draft-quote does in Step A
DO $$
DECLARE
  v_test_intake_id uuid;
  v_locked_row record;
BEGIN
  -- Create a test intake
  INSERT INTO voice_intakes (
    org_id,
    user_id,
    source,
    audio_storage_path,
    status,
    extraction_json
  ) VALUES (
    (SELECT id FROM organizations WHERE user_id = auth.uid() LIMIT 1),
    auth.uid(),
    'web',
    'lock-test.webm',
    'extracted',
    '{}'::jsonb
  )
  RETURNING id INTO v_test_intake_id;

  -- Call the locking function (same as Edge Function Step A)
  SELECT * INTO v_locked_row
  FROM lock_voice_intake_for_quote_creation(v_test_intake_id, auth.uid());

  -- Verify we got the row back
  IF v_locked_row.id = v_test_intake_id THEN
    RAISE NOTICE 'PASS: Locking function returned the intake row';
  ELSE
    RAISE EXCEPTION 'FAIL: Locking function did not return the correct row';
  END IF;

  -- Cleanup
  DELETE FROM voice_intakes WHERE id = v_test_intake_id;

  RAISE NOTICE 'Row-level locking verification complete';
END $$;

-- Expected output:
-- NOTICE: PASS: Locking function returned the intake row
-- NOTICE: Row-level locking verification complete


-- ============================================================================
-- EVIDENCE 1: DUPLICATE PROTECTION TEST
-- ============================================================================

-- Setup: Create a test voice intake with extracted data
INSERT INTO voice_intakes (
  id,
  org_id,
  user_id,
  source,
  audio_storage_path,
  status,
  extraction_json
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE user_id = auth.uid() LIMIT 1),
  auth.uid(),
  'web',
  'test-audio.webm',
  'extracted',
  '{
    "job": {
      "title": "Test Idempotency Job",
      "summary": "Testing duplicate protection"
    },
    "time": {
      "labour_entries": [
        {
          "description": "Test labour",
          "hours": 2
        }
      ]
    }
  }'::jsonb
)
RETURNING id as intake_id;

-- Store the intake_id from above, then call create-draft-quote TWICE with same intake_id

-- FIRST CALL (creates quote):
-- POST /functions/v1/create-draft-quote
-- Body: { "intake_id": "<intake_id_from_above>" }
-- Expected: success: true, idempotent_replay: false, quote_id: <new_quote_id>

-- SECOND CALL (returns existing quote):
-- POST /functions/v1/create-draft-quote
-- Body: { "intake_id": "<same_intake_id>" }
-- Expected: success: true, idempotent_replay: true, quote_id: <same_quote_id>

-- Verify only one quote was created
SELECT
  vi.id as intake_id,
  vi.created_quote_id,
  vi.status,
  COUNT(q.id) as quote_count,
  COUNT(qli.id) as line_item_count
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE vi.id = '<intake_id_from_above>'
GROUP BY vi.id, vi.created_quote_id, vi.status;

-- Expected result:
-- - quote_count = 1
-- - line_item_count = 1 (one labour entry)
-- - created_quote_id is NOT NULL
-- - status = 'quote_created'


-- ============================================================================
-- EVIDENCE 2: RACE CONDITION TEST (Simulated)
-- ============================================================================

-- Setup: Create another test intake
INSERT INTO voice_intakes (
  id,
  org_id,
  user_id,
  source,
  audio_storage_path,
  status,
  extraction_json
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE user_id = auth.uid() LIMIT 1),
  auth.uid(),
  'web',
  'race-test-audio.webm',
  'extracted',
  '{
    "job": {
      "title": "Race Condition Test",
      "summary": "Testing concurrent calls"
    },
    "time": {
      "labour_entries": [
        {
          "description": "Concurrent test labour",
          "hours": 3
        }
      ]
    }
  }'::jsonb
)
RETURNING id as intake_id;

-- CONCURRENT TEST:
-- Open two terminals/sessions and call create-draft-quote simultaneously
-- Both should succeed, but only one quote should be created

-- Session 1: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }
-- Session 2: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }

-- Verify result
SELECT
  vi.id as intake_id,
  vi.created_quote_id,
  (SELECT COUNT(*) FROM quotes WHERE id = vi.created_quote_id) as quote_exists,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = vi.created_quote_id) as line_items,
  vi.status
FROM voice_intakes vi
WHERE vi.id = '<intake_id_from_above>';

-- Expected result:
-- - quote_exists = 1 (exactly one quote)
-- - line_items = 1 (exactly one set of line items)
-- - Both API responses should have success: true
-- - One response has idempotent_replay: false (winner)
-- - One response has idempotent_replay: true (replayed)


-- ============================================================================
-- EVIDENCE 3: STATUS GUARD TEST
-- ============================================================================

-- Setup: Create intake with INVALID status for quote creation
INSERT INTO voice_intakes (
  id,
  org_id,
  user_id,
  source,
  audio_storage_path,
  status,
  extraction_json
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE user_id = auth.uid() LIMIT 1),
  auth.uid(),
  'web',
  'captured-test-audio.webm',
  'captured',  -- INVALID STATUS (not extracted or needs_user_review)
  '{
    "job": {
      "title": "Should Fail",
      "summary": "Testing status guard"
    }
  }'::jsonb
)
RETURNING id as intake_id;

-- Try to create quote from 'captured' status
-- POST /functions/v1/create-draft-quote
-- Body: { "intake_id": "<intake_id_from_above>" }

-- Expected result:
-- - success: false
-- - error: "Cannot create quote from intake with status 'captured'. Valid statuses: extracted, needs_user_review"
-- - No quote created

-- Verify no quote was created
SELECT
  vi.id as intake_id,
  vi.status,
  vi.created_quote_id,
  CASE
    WHEN vi.created_quote_id IS NULL THEN 'PASS: No quote created'
    ELSE 'FAIL: Quote was created when it should not have been'
  END as test_result
FROM voice_intakes vi
WHERE vi.id = '<intake_id_from_above>';


-- ============================================================================
-- EVIDENCE 4: UNIQUE CONSTRAINT ENFORCEMENT
-- ============================================================================

-- Verify the constraint exists
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'voice_intakes_created_quote_unique';

-- Expected result:
-- - constraint_name = 'voice_intakes_created_quote_unique'
-- - constraint_type = 'u' (unique)
-- - constraint_definition contains 'UNIQUE (created_quote_id)'

-- Try to manually violate the constraint (should fail)
-- This tests database-level enforcement independent of application logic
DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_quote_id uuid;
  v_intake1_id uuid;
  v_intake2_id uuid;
BEGIN
  -- Get test data
  SELECT id INTO v_org_id FROM organizations WHERE user_id = auth.uid() LIMIT 1;
  v_user_id := auth.uid();

  -- Create a test quote
  INSERT INTO quotes (org_id, customer_id, quote_number, title, status)
  VALUES (
    v_org_id,
    (SELECT id FROM customers WHERE org_id = v_org_id LIMIT 1),
    'TEST-' || floor(random() * 10000)::text,
    'Constraint Test Quote',
    'draft'
  )
  RETURNING id INTO v_quote_id;

  -- Create first intake linked to quote
  INSERT INTO voice_intakes (
    org_id, user_id, source, audio_storage_path, status, created_quote_id
  )
  VALUES (
    v_org_id, v_user_id, 'web', 'test1.webm', 'quote_created', v_quote_id
  )
  RETURNING id INTO v_intake1_id;

  -- Try to create SECOND intake with SAME quote_id (should fail with constraint violation)
  BEGIN
    INSERT INTO voice_intakes (
      org_id, user_id, source, audio_storage_path, status, created_quote_id
    )
    VALUES (
      v_org_id, v_user_id, 'web', 'test2.webm', 'quote_created', v_quote_id
    );

    RAISE EXCEPTION 'FAIL: Constraint did not prevent duplicate created_quote_id';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS: Unique constraint correctly prevented duplicate';
  END;

  -- Cleanup
  DELETE FROM voice_intakes WHERE id = v_intake1_id;
  DELETE FROM quotes WHERE id = v_quote_id;
END $$;


-- ============================================================================
-- EVIDENCE 5: RETRY SAFETY VERIFICATION
-- ============================================================================

-- Create a test intake and call create-draft-quote multiple times rapidly
INSERT INTO voice_intakes (
  id,
  org_id,
  user_id,
  source,
  audio_storage_path,
  status,
  extraction_json
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM organizations WHERE user_id = auth.uid() LIMIT 1),
  auth.uid(),
  'web',
  'retry-test-audio.webm',
  'extracted',
  '{
    "job": {
      "title": "Retry Safety Test",
      "summary": "Testing multiple retries"
    },
    "time": {
      "labour_entries": [
        {
          "description": "Retry test labour",
          "hours": 1
        }
      ]
    },
    "materials": {
      "items": [
        {
          "description": "Test material",
          "quantity": 5,
          "unit": "units",
          "unit_price_cents": 1000
        }
      ]
    }
  }'::jsonb
)
RETURNING id as intake_id;

-- Call create-draft-quote 5 TIMES with the same intake_id
-- (simulate mobile app retrying due to slow network)

-- CALL 1: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }
-- CALL 2: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }
-- CALL 3: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }
-- CALL 4: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }
-- CALL 5: POST /functions/v1/create-draft-quote { "intake_id": "<intake_id>" }

-- Verify data integrity after all retries
SELECT
  vi.id as intake_id,
  vi.created_quote_id,
  vi.status,
  q.quote_number,
  (SELECT COUNT(*) FROM quotes WHERE id = vi.created_quote_id) as quote_count,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = vi.created_quote_id) as total_line_items,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = vi.created_quote_id AND item_type = 'labour') as labour_items,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = vi.created_quote_id AND item_type = 'materials') as material_items
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
WHERE vi.id = '<intake_id_from_above>';

-- Expected result:
-- - quote_count = 1 (exactly one quote)
-- - total_line_items = 2 (1 labour + 1 materials)
-- - labour_items = 1 (not duplicated)
-- - material_items = 1 (not duplicated)
-- - All 5 API calls returned success: true
-- - Call 1 had idempotent_replay: false
-- - Calls 2-5 had idempotent_replay: true


-- ============================================================================
-- SUMMARY CHECK: Overall System Health
-- ============================================================================

-- Check for any orphaned quotes (quotes not linked to any intake)
SELECT
  q.id,
  q.quote_number,
  q.title,
  q.created_at,
  'ORPHANED QUOTE - No voice_intake reference' as issue
FROM quotes q
WHERE NOT EXISTS (
  SELECT 1 FROM voice_intakes vi WHERE vi.created_quote_id = q.id
)
AND q.created_at > now() - interval '1 day'
ORDER BY q.created_at DESC;

-- Check for any intakes with status=quote_created but no created_quote_id
SELECT
  vi.id,
  vi.status,
  vi.created_quote_id,
  'INCONSISTENT STATE' as issue
FROM voice_intakes vi
WHERE vi.status = 'quote_created'
  AND vi.created_quote_id IS NULL;

-- Check for duplicate quote numbers (should be 0)
SELECT
  quote_number,
  COUNT(*) as duplicate_count,
  array_agg(id) as quote_ids
FROM quotes
GROUP BY quote_number
HAVING COUNT(*) > 1;

-- Expected results for all three queries above:
-- - No orphaned quotes from idempotency testing
-- - No inconsistent states
-- - No duplicate quote numbers
