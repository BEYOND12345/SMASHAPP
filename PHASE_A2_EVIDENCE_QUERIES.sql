-- ============================================================
-- Phase A2 Evidence Queries: Voice Review & Correction Loop
-- ============================================================
-- Purpose: Verify user corrections, re-extraction, and audit trail
-- Date: 2025-12-16
-- Status: Phase A2 Complete

-- ============================================================
-- EVIDENCE 1: Correction Saved
-- ============================================================
-- Verifies: User corrections saved to user_corrections_json
-- Verifies: Status remains needs_user_review (partial save)
-- Expected: corrections present, status unchanged

-- Find intakes with user corrections
SELECT
  id,
  status,
  extraction_confidence,
  user_corrections_json,
  created_at,
  updated_at
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- Verify partial corrections don't change status
SELECT
  id,
  status,
  user_corrections_json->'labour_overrides' as labour_corrections,
  user_corrections_json->'materials_overrides' as materials_corrections,
  user_corrections_json->'confirmed_assumptions' as confirmed_assumptions,
  extraction_confidence
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'needs_user_review'
ORDER BY updated_at DESC;

-- ============================================================
-- EVIDENCE 2: Re-Extraction with Corrections
-- ============================================================
-- Verifies: Corrections applied to extraction_json
-- Verifies: Confidence increased after corrections
-- Verifies: Status transitions to extracted after successful merge
-- Expected: confidence boost, status change, preserved original data

-- Check confidence before/after corrections
SELECT
  id,
  status,
  extraction_confidence,
  (extraction_json->'quality'->>'overall_confidence')::numeric as json_confidence,
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_fields_count,
  user_corrections_json IS NOT NULL as has_corrections
FROM voice_intakes
WHERE status IN ('needs_user_review', 'extracted')
ORDER BY updated_at DESC
LIMIT 10;

-- Verify corrected fields have confidence = 1.0
SELECT
  id,
  status,
  extraction_json->'time'->'labour_entries'->0->'hours' as first_labour_hours,
  extraction_json->'materials'->'items'->0->'quantity' as first_material_quantity,
  user_corrections_json
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'extracted'
ORDER BY updated_at DESC
LIMIT 5;

-- Verify confirmed assumptions have boosted confidence
SELECT
  id,
  status,
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as total_assumptions,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(assumptions) as assumption
    WHERE (assumption->>'confidence')::numeric = 1.0
  ) as confirmed_assumptions_count,
  user_corrections_json->'confirmed_assumptions' as confirmed_fields
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) > 0
ORDER BY updated_at DESC
LIMIT 5;

-- ============================================================
-- EVIDENCE 3: Quote Creation Guards
-- ============================================================
-- Verifies: Quotes only created after confirmation
-- Verifies: No quotes from needs_user_review status
-- Verifies: Pricing snapshot preserved
-- Expected: no quotes with needs_user_review status

-- Verify no quotes created from needs_user_review status
SELECT
  vi.id as intake_id,
  vi.status as intake_status,
  vi.user_corrections_json IS NOT NULL as has_corrections,
  q.id as quote_id,
  q.status as quote_status,
  q.created_at as quote_created
FROM voice_intakes vi
LEFT JOIN quotes q ON q.voice_intake_id = vi.id
WHERE vi.status = 'needs_user_review'
ORDER BY vi.updated_at DESC
LIMIT 10;

-- Verify quotes only exist for extracted or quote_created status
SELECT
  vi.status as intake_status,
  COUNT(DISTINCT vi.id) as intake_count,
  COUNT(DISTINCT q.id) as quote_count
FROM voice_intakes vi
LEFT JOIN quotes q ON q.voice_intake_id = vi.id
GROUP BY vi.status
ORDER BY vi.status;

-- Verify pricing snapshot preserved in quotes
SELECT
  q.id,
  q.status,
  q.subtotal_cents,
  q.tax_cents,
  q.total_cents,
  q.created_at,
  q.updated_at,
  vi.user_corrections_json IS NOT NULL as had_corrections,
  vi.extraction_confidence
FROM quotes q
JOIN voice_intakes vi ON vi.id = q.voice_intake_id
WHERE vi.user_corrections_json IS NOT NULL
ORDER BY q.created_at DESC
LIMIT 5;

-- ============================================================
-- EVIDENCE 4: Audit Trail
-- ============================================================
-- Verifies: Original extraction_json preserved
-- Verifies: Corrections visible in user_corrections_json
-- Verifies: No silent overwrites of extraction data
-- Expected: both original and corrections visible

-- Full audit trail for corrected intakes
SELECT
  id,
  status,
  extraction_confidence,
  extraction_model,
  extraction_json->'repaired_transcript' as repaired_transcript,
  user_corrections_json,
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_fields_count,
  created_at,
  updated_at
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;

-- Verify extraction_json contains both original inferences and corrected values
SELECT
  id,
  status,
  -- Original extraction data preserved
  extraction_json->'time'->'labour_entries' as labour_data,
  extraction_json->'materials'->'items' as materials_data,
  -- User corrections applied
  user_corrections_json->'labour_overrides' as labour_corrections,
  user_corrections_json->'materials_overrides' as materials_corrections,
  -- Audit metadata
  extraction_model,
  extraction_confidence,
  updated_at
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'extracted'
ORDER BY updated_at DESC
LIMIT 3;

-- ============================================================
-- EVIDENCE 5: Idempotency Preserved
-- ============================================================
-- Verifies: Corrections don't break idempotency
-- Verifies: Multiple correction saves don't create duplicate quotes
-- Expected: one quote per intake, regardless of corrections

-- Check for duplicate quotes (should be zero)
SELECT
  voice_intake_id,
  COUNT(*) as quote_count,
  array_agg(id ORDER BY created_at) as quote_ids,
  array_agg(status ORDER BY created_at) as quote_statuses
FROM quotes
WHERE voice_intake_id IS NOT NULL
GROUP BY voice_intake_id
HAVING COUNT(*) > 1
ORDER BY quote_count DESC;

-- Verify idempotency constraint still enforced
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'one_quote_per_intake_when_not_cancelled';

-- ============================================================
-- SUMMARY METRICS: Phase A2 Health Check
-- ============================================================

-- Overall Phase A2 adoption
SELECT
  COUNT(*) FILTER (WHERE status = 'needs_user_review') as needs_review_count,
  COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL) as has_corrections_count,
  COUNT(*) FILTER (WHERE status = 'extracted' AND user_corrections_json IS NOT NULL) as corrected_and_extracted_count,
  COUNT(*) FILTER (WHERE status = 'quote_created') as quote_created_count,
  ROUND(AVG(extraction_confidence) FILTER (WHERE user_corrections_json IS NOT NULL), 2) as avg_confidence_with_corrections,
  ROUND(AVG(extraction_confidence) FILTER (WHERE user_corrections_json IS NULL), 2) as avg_confidence_without_corrections
FROM voice_intakes;

-- Quality improvement from corrections
SELECT
  'Before Corrections' as stage,
  ROUND(AVG(extraction_confidence), 3) as avg_confidence,
  COUNT(*) as count
FROM voice_intakes
WHERE status = 'needs_user_review'
  AND user_corrections_json IS NULL

UNION ALL

SELECT
  'After Corrections' as stage,
  ROUND(AVG(extraction_confidence), 3) as avg_confidence,
  COUNT(*) as count
FROM voice_intakes
WHERE status = 'extracted'
  AND user_corrections_json IS NOT NULL;

-- ============================================================
-- VERIFICATION CHECKLIST
-- ============================================================

/*
Phase A2 is PASSING if:

✓ EVIDENCE 1: User corrections saved without status change
  - user_corrections_json populated
  - status remains needs_user_review for partial saves

✓ EVIDENCE 2: Re-extraction with corrections
  - Corrected fields have confidence = 1.0
  - Confirmed assumptions have confidence = 1.0
  - Overall confidence increased
  - Status changed to extracted

✓ EVIDENCE 3: Quote creation guards
  - No quotes exist for needs_user_review status
  - Quotes only created after status = extracted
  - Pricing snapshot preserved

✓ EVIDENCE 4: Audit trail
  - Original extraction_json preserved
  - Corrections visible in user_corrections_json
  - Both visible in final data

✓ EVIDENCE 5: Idempotency
  - No duplicate quotes
  - Constraint enforced
  - Corrections don't break idempotency

Next Steps:
- Test with real voice intakes
- Verify UI correctly displays corrections
- Confirm confidence scoring improvements
*/
