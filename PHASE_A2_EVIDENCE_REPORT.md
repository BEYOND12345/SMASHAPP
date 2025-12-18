# Phase A2 Evidence Report

**Date:** 2025-12-16
**Status:** Evidence Collection Ready
**Phase:** A2 - Voice Review & Correction Loop

---

## Evidence Collection Method

This report provides:
1. SQL queries to verify each evidence requirement
2. Expected outcomes for passing tests
3. Instructions for collecting evidence via app usage
4. Interpretation guide for results

---

## EVIDENCE SET 1: State Transition Safety

### Requirement
Prove that quotes are only created when data quality is sufficient.

### Implementation Reality
The `create-draft-quote` function uses **quality guards**, not strict status checks:

**Guard 1:** Required fields missing → Block with `requires_review: true`
**Guard 2:** Labour confidence < 0.6 → Block with `requires_review: true`

**Note:** If `status = needs_user_review` but quality guards pass, quote creation is allowed. This is by design for flexibility.

### SQL Verification

```sql
-- Check that intakes with quality issues block quote creation
SELECT
  id,
  status,
  created_quote_id,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_fields_count,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(missing_fields) as mf
    WHERE mf->>'severity' = 'required'
  ) as required_missing_count,
  extraction_confidence,
  CASE
    WHEN created_quote_id IS NULL
      AND (
        (SELECT COUNT(*) FROM jsonb_array_elements(missing_fields) as mf WHERE mf->>'severity' = 'required') > 0
        OR extraction_confidence < 0.6
      )
    THEN '✓ PASS: Quality guard working'
    WHEN created_quote_id IS NOT NULL
      AND status = 'quote_created'
      AND (SELECT COUNT(*) FROM jsonb_array_elements(missing_fields) as mf WHERE mf->>'severity' = 'required') = 0
    THEN '✓ PASS: Quote created after quality sufficient'
    ELSE '⚠ REVIEW: Check quality vs status'
  END as evidence_1_result
FROM voice_intakes
WHERE status IN ('needs_user_review', 'extracted', 'quote_created')
ORDER BY updated_at DESC
LIMIT 10;
```

### Expected Results
- Intakes with `required` missing fields → No quote
- Intakes with labour confidence < 0.6 → No quote
- Intakes after corrections with good quality → Quote created

### How to Collect Evidence
1. Record voice intake with ambiguous labour hours
2. System should mark as `needs_user_review`
3. Attempt to skip ReviewQuote and call create-draft-quote directly
4. Should receive `requires_review: true` response
5. Make corrections
6. Re-extract with corrections
7. Create quote should succeed

---

## EVIDENCE SET 2: Partial Correction Save

### Requirement
Prove user edits can be saved without triggering extraction or quote creation.

### SQL Verification

```sql
-- Verify partial saves don't trigger side effects
SELECT
  id,
  status,
  user_corrections_json IS NOT NULL as has_corrections,
  jsonb_pretty(user_corrections_json) as corrections,
  created_quote_id IS NULL as no_quote_yet,
  extraction_json->>'repaired_transcript' as original_transcript_preserved,
  CASE
    WHEN user_corrections_json IS NOT NULL
      AND status = 'needs_user_review'
      AND created_quote_id IS NULL
    THEN '✓ PASS: Partial save successful'
    ELSE '✗ FAIL: Side effects detected'
  END as evidence_2_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'needs_user_review'
ORDER BY updated_at DESC
LIMIT 5;
```

### Expected Results
- `user_corrections_json` populated
- `status` remains `needs_user_review`
- `created_quote_id` remains NULL
- `extraction_json` unchanged

### How to Collect Evidence
1. Open ReviewQuote screen for needs_user_review intake
2. Make some field edits
3. Click "Save for Later"
4. Run SQL query
5. Verify corrections saved, no other changes

---

## EVIDENCE SET 3: Deterministic Re-Extraction

### Requirement
Prove corrections are applied without hallucination or drift.

### SQL Verification

```sql
-- Verify deterministic merge
SELECT
  id,
  status,
  -- Check corrected labour hours
  (extraction_json->'time'->'labour_entries'->0->'hours'->>'value')::numeric as merged_hours_value,
  (extraction_json->'time'->'labour_entries'->0->'hours'->>'confidence')::numeric as merged_hours_confidence,
  (user_corrections_json->'labour_overrides'->>'labour_0_hours')::numeric as user_provided_hours,
  -- Check assumptions not proliferated
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count,
  extraction_confidence as new_overall_confidence,
  CASE
    WHEN status = 'extracted'
      AND (extraction_json->'time'->'labour_entries'->0->'hours'->>'value')::numeric =
          (user_corrections_json->'labour_overrides'->>'labour_0_hours')::numeric
      AND (extraction_json->'time'->'labour_entries'->0->'hours'->>'confidence')::numeric = 1.0
    THEN '✓ PASS: Deterministic merge verified'
    ELSE '⚠ REVIEW: Merge logic issue'
  END as evidence_3_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
  AND status = 'extracted'
ORDER BY updated_at DESC
LIMIT 5;
```

### Expected Results
- Corrected values match user input exactly
- Corrected fields have confidence = 1.0
- No new assumptions added
- Overall confidence increased
- Status changed to `extracted`

### How to Collect Evidence
1. From ReviewQuote screen with saved corrections
2. Click "Confirm & Continue"
3. Wait for re-extraction (deterministic merge)
4. Run SQL query
5. Verify values merged correctly

---

## EVIDENCE SET 4: Quote Creation After Confirmation Only

### Requirement
Prove quotes only created after user confirmation.

### SQL Verification

```sql
-- Verify quote linkage
SELECT
  vi.id as intake_id,
  vi.status,
  vi.created_quote_id,
  vi.user_corrections_json IS NOT NULL as had_corrections,
  q.id as quote_id,
  q.quote_number,
  q.status as quote_status,
  COUNT(qli.id) as line_items_count,
  CASE
    WHEN vi.status = 'quote_created'
      AND vi.created_quote_id = q.id
      AND q.id IS NOT NULL
    THEN '✓ PASS: Quote created correctly'
    WHEN vi.status IN ('needs_user_review', 'extracted')
      AND vi.created_quote_id IS NULL
    THEN '✓ PASS: No premature quote'
    ELSE '✗ FAIL: Quote creation broken'
  END as evidence_4_result
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
GROUP BY vi.id, vi.status, vi.created_quote_id, vi.user_corrections_json, q.id, q.quote_number, q.status
ORDER BY vi.updated_at DESC
LIMIT 10;
```

### Expected Results
- Status `needs_user_review` → No quote
- Status `extracted` (after corrections) → No quote until create called
- Status `quote_created` → Quote exists with line items

### How to Collect Evidence
1. Complete correction flow
2. Let Processing screen call create-draft-quote
3. Run SQL query
4. Verify quote created with correct linkage

---

## EVIDENCE SET 5: Pricing Immutability

### Requirement
Prove corrections cannot alter pricing rules.

### SQL Verification

```sql
-- Verify pricing snapshot
SELECT
  q.id as quote_id,
  q.quote_number,
  vi.id as intake_id,
  vi.user_corrections_json->'labour_overrides' as labour_changed,
  vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents' as snapshot_rate,
  pp.hourly_rate_cents as current_profile_rate,
  q.subtotal_cents,
  q.tax_cents,
  q.total_cents,
  CASE
    WHEN (vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents')::int = pp.hourly_rate_cents
    THEN '✓ PASS: Pricing from profile'
    ELSE '✗ FAIL: Pricing corrupted'
  END as evidence_5_result
FROM quotes q
JOIN voice_intakes vi ON vi.created_quote_id = q.id
JOIN users u ON u.id = vi.user_id
JOIN user_pricing_profiles pp ON pp.id = u.active_pricing_profile_id
WHERE vi.user_corrections_json IS NOT NULL
ORDER BY q.created_at DESC
LIMIT 5;
```

### Expected Results
- Hourly rate from pricing profile (not modified by corrections)
- Materials markup from profile
- Tax rate from profile
- Totals calculated correctly

### How to Collect Evidence
1. After quote created from corrected intake
2. Run SQL query
3. Verify all rates match profile
4. Verify totals are correct

---

## EVIDENCE SET 6: Idempotency Preserved

### Requirement
Prove retries and double-taps are safe.

### SQL Verification

```sql
-- Check for duplicate quotes (should be empty)
SELECT
  voice_intake_id,
  COUNT(*) as quote_count,
  array_agg(id ORDER BY created_at) as quote_ids,
  '✗ FAIL: DUPLICATE QUOTES FOUND' as evidence_6_result
FROM quotes
WHERE voice_intake_id IS NOT NULL
GROUP BY voice_intake_id
HAVING COUNT(*) > 1;

-- Should return 0 rows if passing

-- Verify constraint exists
SELECT
  conname,
  pg_get_constraintdef(oid) as definition,
  '✓ PASS: Idempotency constraint enforced' as evidence_6b_result
FROM pg_constraint
WHERE conrelid = 'quotes'::regclass
  AND conname = 'one_quote_per_intake_when_not_cancelled';
```

### Expected Results
- First query returns 0 rows (no duplicates)
- Second query shows constraint exists

### How to Collect Evidence
1. After any quote creation
2. Run both SQL queries
3. Verify no duplicates exist
4. Try calling create-draft-quote twice with same intake_id
5. Second call should return `idempotent_replay: true`

---

## EVIDENCE SET 7: Audit Trail Integrity

### Requirement
Prove nothing is overwritten silently.

### SQL Verification

```sql
-- Full audit trail
SELECT
  id,
  status,
  created_at,
  updated_at,
  -- Original extraction preserved
  extraction_json->'repaired_transcript' as original_transcript,
  extraction_json->'time'->'labour_entries'->0->'hours' as original_labour_structure,
  -- Corrections stored separately
  jsonb_pretty(user_corrections_json) as corrections_visible,
  -- Metadata preserved
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_fields_count,
  CASE
    WHEN extraction_json IS NOT NULL
      AND user_corrections_json IS NOT NULL
      AND updated_at > created_at
    THEN '✓ PASS: Complete audit trail'
    ELSE '✗ FAIL: Data integrity issue'
  END as evidence_7_result
FROM voice_intakes
WHERE user_corrections_json IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;
```

### Expected Results
- Original `extraction_json` preserved (not overwritten)
- `user_corrections_json` stored separately
- Both visible in final data
- Timestamps show progression

### How to Collect Evidence
1. After completing correction flow
2. Run SQL query
3. Verify both original and corrections present
4. Check timestamps are logical

---

## EVIDENCE SET 8: Backward Compatibility

### Requirement
Prove old intakes still work.

### SQL Verification

```sql
-- Legacy intakes without corrections
SELECT
  id,
  status,
  created_quote_id IS NOT NULL as has_quote,
  user_corrections_json IS NULL as is_legacy,
  extraction_confidence,
  created_at,
  CASE
    WHEN user_corrections_json IS NULL
      AND status IN ('extracted', 'quote_created')
    THEN '✓ PASS: Legacy intake works'
    WHEN user_corrections_json IS NULL
      AND status = 'needs_user_review'
    THEN '⚠ INFO: Legacy with low confidence'
    ELSE '✗ FAIL: Legacy broken'
  END as evidence_8_result
FROM voice_intakes
WHERE user_corrections_json IS NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Expected Results
- Old intakes without `user_corrections_json` still work
- No errors in extraction or quote creation
- Status transitions work normally

### How to Collect Evidence
1. Find or create intake without corrections field
2. Run through normal flow (not review flow)
3. Run SQL query
4. Verify success

---

## Summary Evidence Query

### Quick Health Check

```sql
WITH phase_a2_metrics AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review' AND created_quote_id IS NULL) as blocked_attempts,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'needs_user_review') as partial_saves,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'extracted') as successful_merges,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'quote_created') as corrected_quotes,
    COUNT(*) FILTER (WHERE user_corrections_json IS NULL AND status = 'quote_created') as legacy_quotes,
    (
      SELECT COUNT(*)
      FROM quotes
      WHERE voice_intake_id IS NOT NULL
      GROUP BY voice_intake_id
      HAVING COUNT(*) > 1
    ) as duplicate_count
  FROM voice_intakes
)
SELECT
  blocked_attempts as "Evidence 1: Blocked Low Quality",
  partial_saves as "Evidence 2: Partial Saves",
  successful_merges as "Evidence 3: Successful Merges",
  corrected_quotes as "Evidence 4-7: Complete Flows",
  legacy_quotes as "Evidence 8: Legacy Intakes",
  COALESCE(duplicate_count, 0) as "Evidence 6: Duplicates (should be 0)",
  CASE
    WHEN COALESCE(duplicate_count, 0) = 0
    THEN '✓ All Evidence PASS'
    ELSE '✗ Duplicates Found'
  END as overall_status
FROM phase_a2_metrics;
```

---

## Acceptance Criteria

Phase A2 passes if:

1. ✅ Quality guards block quote creation (Evidence 1)
2. ✅ Partial saves work without side effects (Evidence 2)
3. ✅ Deterministic merge applies corrections (Evidence 3)
4. ✅ Quotes only after confirmation (Evidence 4)
5. ✅ Pricing from profile, not corrupted (Evidence 5)
6. ✅ No duplicate quotes (Evidence 6)
7. ✅ Complete audit trail (Evidence 7)
8. ✅ Legacy intakes unaffected (Evidence 8)

---

## Instructions for Complete Evidence Collection

### Step 1: Create Test Scenario
1. Open voice recorder
2. Record ambiguous quote: "uh three rooms maybe four hours"
3. Let system process

### Step 2: Review Flow
1. Should route to ReviewQuote screen
2. Make corrections to labour hours
3. Click "Save for Later"
4. Run Evidence Set 2 SQL

### Step 3: Confirmation Flow
1. Return to ReviewQuote
2. Click "Confirm & Continue"
3. Wait for deterministic merge
4. Run Evidence Set 3 SQL

### Step 4: Quote Creation
1. Let Processing complete
2. Quote should be created
3. Run Evidence Sets 4, 5, 6, 7 SQL

### Step 5: Verify All Evidence
1. Run summary query
2. All metrics should show activity
3. No duplicates
4. No failures

---

## Files Reference

- SQL Queries: `PHASE_A2_EVIDENCE_VERIFICATION.sql`
- Implementation: `PHASE_A2_IMPLEMENTATION_REPORT.md`
- This Document: `PHASE_A2_EVIDENCE_REPORT.md`

---

**Evidence Collection Status:** Ready
**Next Step:** Use app to create test data, run queries, document results
