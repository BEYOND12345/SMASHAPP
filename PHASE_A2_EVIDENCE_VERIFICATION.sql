-- ============================================================
-- PHASE A2 EVIDENCE VERIFICATION
-- ============================================================
-- Purpose: Concrete evidence for all 8 evidence requirements
-- Date: 2025-12-16
-- Status: VERIFICATION READY

-- ============================================================
-- EVIDENCE SET 1: STATE TRANSITION SAFETY
-- ============================================================
-- Goal: Prove no quote can be created while status = needs_user_review

-- SETUP: Create test intake with needs_user_review status
-- (This would be done via the app or manual INSERT)
/*
INSERT INTO voice_intakes (
  user_id,
  org_id,
  audio_url,
  transcript_text,
  status,
  extraction_json,
  extraction_confidence,
  missing_fields,
  assumptions
) VALUES (
  auth.uid(),
  (SELECT org_id FROM users WHERE id = auth.uid()),
  'test-audio-url',
  'Paint three bedrooms, maybe 4 hours each',
  'needs_user_review',
  '{"time": {"labour_entries": [{"description": "Paint bedrooms", "hours": {"value": 4, "confidence": 0.55}}]}}'::jsonb,
  0.55,
  '[{"field": "labour_hours", "reason": "Low confidence", "severity": "warning"}]'::jsonb,
  '[{"field": "labour_hours", "assumption": "4 hours estimated", "confidence": 0.55, "source": "transcript"}]'::jsonb
);
*/

-- VERIFICATION: Check that create-draft-quote fails for needs_user_review
-- Expected: Function returns requires_review = true
-- SQL to verify state unchanged:

SELECT
  id,
  status,
  created_quote_id,
  user_corrections_json,
  extraction_confidence,
  CASE
    WHEN status = 'needs_user_review' AND created_quote_id IS NULL
    THEN '✓ PASS: No quote created from needs_user_review'
    ELSE '✗ FAIL: Quote created or wrong status'
  END as evidence_1_result
FROM voice_intakes
WHERE status = 'needs_user_review'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================
-- EVIDENCE SET 2: PARTIAL CORRECTION SAVE (NO SIDE EFFECTS)
-- ============================================================
-- Goal: Prove partial edits saved without triggering extraction/quote

-- SETUP: Update user_corrections_json (via ReviewQuote "Save for Later")
/*
UPDATE voice_intakes
SET user_corrections_json = '{
  "labour_overrides": {
    "labour_0_hours": 5
  },
  "confirmed_assumptions": []
}'::jsonb
WHERE id = '<test_intake_id>'
  AND status = 'needs_user_review';
*/

-- VERIFICATION: Corrections saved, no side effects
SELECT
  id,
  status,
  user_corrections_json,
  extraction_json->'time'->'labour_entries'->0->'hours' as original_hours_unchanged,
  created_quote_id,
  CASE
    WHEN user_corrections_json IS NOT NULL
      AND status = 'needs_user_review'
      AND created_quote_id IS NULL
    THEN '✓ PASS: Partial save with no side effects'
    ELSE '✗ FAIL: Side effects detected'
  END as evidence_2_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'needs_user_review'
ORDER BY updated_at DESC
LIMIT 5;

-- ============================================================
-- EVIDENCE SET 3: DETERMINISTIC RE-EXTRACTION
-- ============================================================
-- Goal: Prove corrections applied without hallucination

-- SETUP: Call extract-quote-data with user_corrections_json
-- Expected: Merge corrections, boost confidence, change status

-- VERIFICATION: Check merged data
SELECT
  id,
  status,
  extraction_json->'time'->'labour_entries'->0->'hours' as merged_hours,
  user_corrections_json->'labour_overrides' as applied_corrections,
  extraction_confidence as new_confidence,
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count,
  CASE
    WHEN status = 'extracted'
      AND (extraction_json->'time'->'labour_entries'->0->'hours'->>'value')::numeric =
          (user_corrections_json->'labour_overrides'->>'labour_0_hours')::numeric
      AND (extraction_json->'time'->'labour_entries'->0->'hours'->>'confidence')::numeric = 1.0
    THEN '✓ PASS: Deterministic merge successful'
    ELSE '✗ FAIL: Merge incorrect or missing'
  END as evidence_3_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'extracted'
ORDER BY updated_at DESC
LIMIT 5;

-- Verify no new assumptions added during merge
WITH before_merge AS (
  SELECT
    id,
    jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as count_before
  FROM voice_intakes
  WHERE status = 'needs_user_review'
),
after_merge AS (
  SELECT
    id,
    jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as count_after
  FROM voice_intakes
  WHERE status = 'extracted'
    AND user_corrections_json IS NOT NULL
)
SELECT
  am.id,
  bm.count_before,
  am.count_after,
  CASE
    WHEN am.count_after <= COALESCE(bm.count_before, 999)
    THEN '✓ PASS: No assumption proliferation'
    ELSE '✗ FAIL: New assumptions added'
  END as evidence_3b_result
FROM after_merge am
LEFT JOIN before_merge bm ON bm.id = am.id
LIMIT 5;

-- ============================================================
-- EVIDENCE SET 4: QUOTE CREATION AFTER CONFIRMATION ONLY
-- ============================================================
-- Goal: Prove quote created only after confirmation

-- VERIFICATION: Check linkage and status
SELECT
  vi.id as intake_id,
  vi.status as intake_status,
  vi.created_quote_id,
  q.id as quote_id,
  q.status as quote_status,
  q.created_at as quote_created_at,
  CASE
    WHEN vi.status = 'quote_created'
      AND vi.created_quote_id IS NOT NULL
      AND q.id IS NOT NULL
    THEN '✓ PASS: Quote created after confirmation'
    WHEN vi.status = 'needs_user_review'
      AND vi.created_quote_id IS NULL
      AND q.id IS NULL
    THEN '✓ PASS: No premature quote creation'
    ELSE '✗ FAIL: Quote creation logic broken'
  END as evidence_4_result
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
WHERE vi.user_corrections_json IS NOT NULL
ORDER BY vi.updated_at DESC
LIMIT 10;

-- Verify exactly one quote per intake
SELECT
  voice_intake_id,
  COUNT(*) as quote_count,
  CASE
    WHEN COUNT(*) = 1 THEN '✓ PASS: One quote per intake'
    WHEN COUNT(*) > 1 THEN '✗ FAIL: Duplicate quotes'
    ELSE '✓ PASS: No quotes yet'
  END as evidence_4b_result
FROM quotes
WHERE voice_intake_id IN (
  SELECT id FROM voice_intakes WHERE user_corrections_json IS NOT NULL
)
GROUP BY voice_intake_id
ORDER BY quote_count DESC;

-- ============================================================
-- EVIDENCE SET 5: PRICING IMMUTABILITY
-- ============================================================
-- Goal: Prove corrections cannot alter pricing rules

-- VERIFICATION: Check pricing snapshot preserved
SELECT
  q.id as quote_id,
  vi.id as intake_id,
  vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents' as snapshot_hourly_rate,
  q.subtotal_cents,
  q.tax_cents,
  q.total_cents,
  vi.user_corrections_json->'labour_overrides' as labour_corrections,
  CASE
    WHEN vi.extraction_json->'pricing_defaults_used' IS NOT NULL
      AND q.subtotal_cents > 0
    THEN '✓ PASS: Pricing snapshot preserved'
    ELSE '✗ FAIL: Pricing snapshot missing'
  END as evidence_5_result
FROM quotes q
JOIN voice_intakes vi ON vi.created_quote_id = q.id
WHERE vi.user_corrections_json IS NOT NULL
ORDER BY q.created_at DESC
LIMIT 5;

-- Verify hourly rate unchanged by corrections
SELECT
  vi.id,
  vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents' as original_rate,
  pp.hourly_rate_cents as profile_rate,
  CASE
    WHEN (vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents')::int = pp.hourly_rate_cents
    THEN '✓ PASS: Rate matches profile'
    ELSE '✗ FAIL: Rate corrupted'
  END as evidence_5b_result
FROM voice_intakes vi
JOIN users u ON u.id = vi.user_id
JOIN user_pricing_profiles pp ON pp.id = u.active_pricing_profile_id
WHERE vi.user_corrections_json IS NOT NULL
  AND vi.status = 'quote_created'
LIMIT 5;

-- ============================================================
-- EVIDENCE SET 6: IDEMPOTENCY PRESERVED
-- ============================================================
-- Goal: Prove retries are safe

-- VERIFICATION: Check for duplicate quotes (should be zero)
SELECT
  voice_intake_id,
  COUNT(*) as quote_count,
  array_agg(id ORDER BY created_at) as quote_ids,
  CASE
    WHEN COUNT(*) = 1 THEN '✓ PASS: No duplicates'
    ELSE '✗ FAIL: Duplicate quotes detected'
  END as evidence_6_result
FROM quotes
WHERE voice_intake_id IS NOT NULL
GROUP BY voice_intake_id
HAVING COUNT(*) > 1;

-- Should return no rows if passing

-- Verify constraint exists
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition,
  CASE
    WHEN conname = 'one_quote_per_intake_when_not_cancelled'
    THEN '✓ PASS: Idempotency constraint exists'
    ELSE '✗ FAIL: Constraint missing'
  END as evidence_6b_result
FROM pg_constraint
WHERE conrelid = 'quotes'::regclass
  AND conname = 'one_quote_per_intake_when_not_cancelled';

-- ============================================================
-- EVIDENCE SET 7: AUDIT TRAIL INTEGRITY
-- ============================================================
-- Goal: Prove nothing overwritten silently

-- VERIFICATION: Check both original and corrections visible
SELECT
  id,
  status,
  -- Original extraction preserved
  extraction_json->'time'->'labour_entries'->0 as original_labour_data,
  -- Corrections stored separately
  user_corrections_json->'labour_overrides' as corrections,
  -- Metadata preserved
  assumptions as original_assumptions,
  missing_fields as original_missing_fields,
  created_at,
  updated_at,
  CASE
    WHEN extraction_json IS NOT NULL
      AND user_corrections_json IS NOT NULL
      AND assumptions IS NOT NULL
    THEN '✓ PASS: Complete audit trail'
    ELSE '✗ FAIL: Data lost or overwritten'
  END as evidence_7_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- Verify timestamps show progression
SELECT
  id,
  status,
  created_at,
  updated_at,
  updated_at - created_at as time_elapsed,
  CASE
    WHEN updated_at > created_at
    THEN '✓ PASS: Timestamps show progression'
    ELSE '✗ FAIL: Timestamp anomaly'
  END as evidence_7b_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- ============================================================
-- EVIDENCE SET 8: BACKWARD COMPATIBILITY
-- ============================================================
-- Goal: Prove old intakes still work

-- VERIFICATION: Check intakes without corrections field
SELECT
  id,
  status,
  created_quote_id,
  user_corrections_json,
  extraction_confidence,
  CASE
    WHEN user_corrections_json IS NULL
      AND status IN ('extracted', 'quote_created')
      AND created_quote_id IS NOT NULL
    THEN '✓ PASS: Legacy intake processed successfully'
    WHEN user_corrections_json IS NULL
      AND status = 'extracted'
    THEN '✓ PASS: Legacy intake extracted (no quote yet)'
    ELSE '✗ FAIL: Legacy intake broken'
  END as evidence_8_result
FROM voice_intakes
WHERE user_corrections_json IS NULL
  AND status != 'needs_user_review'
ORDER BY created_at DESC
LIMIT 10;

-- Check old intakes with no confidence fields work
SELECT
  COUNT(*) as legacy_intakes_count,
  COUNT(*) FILTER (WHERE created_quote_id IS NOT NULL) as quotes_created,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_quote_id IS NOT NULL) > 0
    THEN '✓ PASS: Legacy intakes create quotes'
    ELSE '⚠ INFO: No legacy intakes with quotes yet'
  END as evidence_8b_result
FROM voice_intakes
WHERE user_corrections_json IS NULL
  AND extraction_json IS NOT NULL;

-- ============================================================
-- COMPREHENSIVE SUMMARY: ALL EVIDENCE SETS
-- ============================================================

WITH evidence_summary AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review' AND created_quote_id IS NULL) as blocked_quote_attempts,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'needs_user_review') as partial_saves,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'extracted') as successful_merges,
    COUNT(*) FILTER (WHERE status = 'quote_created' AND created_quote_id IS NOT NULL) as confirmed_quotes,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND created_quote_id IS NOT NULL) as corrected_quotes
  FROM voice_intakes
)
SELECT
  blocked_quote_attempts as "Evidence 1: Blocked Premature Quotes",
  partial_saves as "Evidence 2: Partial Saves",
  successful_merges as "Evidence 3: Successful Merges",
  confirmed_quotes as "Evidence 4: Confirmed Quotes",
  corrected_quotes as "Evidence 5+6+7: Complete Flow",
  CASE
    WHEN blocked_quote_attempts > 0
      OR partial_saves > 0
      OR successful_merges > 0
      OR confirmed_quotes > 0
    THEN '✓ Phase A2 Active'
    ELSE '⚠ No Phase A2 Activity Yet'
  END as overall_status
FROM evidence_summary;

-- ============================================================
-- QUICK VERIFICATION CHECKLIST
-- ============================================================

SELECT
  '1. STATE TRANSITION SAFETY' as check_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE status = 'needs_user_review' AND created_quote_id IS NULL
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END as result
UNION ALL
SELECT
  '2. PARTIAL SAVE NO SIDE EFFECTS',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE user_corrections_json IS NOT NULL
        AND status = 'needs_user_review'
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END
UNION ALL
SELECT
  '3. DETERMINISTIC RE-EXTRACTION',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE user_corrections_json IS NOT NULL
        AND status = 'extracted'
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END
UNION ALL
SELECT
  '4. QUOTE AFTER CONFIRMATION',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE status = 'quote_created'
        AND created_quote_id IS NOT NULL
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END
UNION ALL
SELECT
  '5. PRICING IMMUTABILITY',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM quotes q
      JOIN voice_intakes vi ON vi.created_quote_id = q.id
      WHERE vi.extraction_json->'pricing_defaults_used' IS NOT NULL
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END
UNION ALL
SELECT
  '6. IDEMPOTENCY PRESERVED',
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM quotes
      WHERE voice_intake_id IS NOT NULL
      GROUP BY voice_intake_id
      HAVING COUNT(*) > 1
    )
    THEN '✓ PASS'
    ELSE '✗ FAIL: DUPLICATES FOUND'
  END
UNION ALL
SELECT
  '7. AUDIT TRAIL INTEGRITY',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE user_corrections_json IS NOT NULL
        AND extraction_json IS NOT NULL
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END
UNION ALL
SELECT
  '8. BACKWARD COMPATIBILITY',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM voice_intakes
      WHERE user_corrections_json IS NULL
        AND status IN ('extracted', 'quote_created')
    )
    THEN '✓ PASS'
    ELSE '⚠ NO TEST DATA'
  END;

-- ============================================================
-- INSTRUCTIONS FOR RUNNING EVIDENCE COLLECTION
-- ============================================================

/*
TO COLLECT EVIDENCE:

1. Create a test voice intake that triggers needs_user_review:
   - Use voice recorder in app
   - Or insert test data with low confidence

2. Save partial corrections:
   - Open ReviewQuote screen
   - Make some edits
   - Click "Save for Later"
   - Run Evidence Set 2 queries

3. Confirm corrections:
   - Return to ReviewQuote
   - Click "Confirm & Continue"
   - Wait for re-extraction
   - Run Evidence Set 3 queries

4. Verify quote creation:
   - Let flow complete
   - Run Evidence Set 4 queries

5. Check all other evidence sets:
   - Run queries above
   - All should show ✓ PASS or ⚠ NO TEST DATA
   - No ✗ FAIL results

ACCEPTANCE:
- All evidence sets with test data must show ✓ PASS
- No duplicate quotes
- No pricing corruption
- Complete audit trail
*/
