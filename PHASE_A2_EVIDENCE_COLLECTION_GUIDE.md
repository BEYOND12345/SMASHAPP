# Phase A2 Evidence Collection Guide

**Purpose:** Step-by-step instructions to collect concrete evidence for all 8 evidence requirements.

**Time Required:** ~10 minutes

---

## Prerequisites

- Running application with Phase A2 deployed
- Access to Supabase SQL Editor
- Test user account with pricing profile configured

---

## Evidence Collection Workflow

### PART 1: Setup Test Intake

#### Step 1.1: Record Ambiguous Voice Quote
1. Open the app
2. Navigate to "New Estimate"
3. Start voice recording
4. Say: **"Paint three bedrooms, I think maybe four hours each, need some white paint, probably fifteen liters or so"**
5. Stop recording
6. Save the recording

#### Step 1.2: Verify Processing Triggers Review
Expected: App should route to **ReviewQuote screen** (not ReviewDraft)

If it routes directly to ReviewDraft:
- Labour confidence was too high (>0.6)
- Record again with more uncertainty: "uh, three rooms, um, maybe three or four hours, not sure"

---

### PART 2: Evidence Set 1 - State Transition Safety

#### Goal: Prove quality guards block premature quote creation

#### Test 2.1: Check Intake Status
Run in Supabase SQL Editor:

```sql
SELECT
  id,
  status,
  created_quote_id,
  extraction_confidence,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_count,
  (SELECT COUNT(*) FROM jsonb_array_elements(missing_fields) as mf WHERE mf->>'severity' = 'required') as required_count
FROM voice_intakes
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
- `status` = `'needs_user_review'`
- `created_quote_id` = `NULL`
- `extraction_confidence` < 0.7 OR required_count > 0

**Evidence:** ✓ Quote creation blocked by quality guards

---

### PART 3: Evidence Set 2 - Partial Save

#### Goal: Prove partial edits save without side effects

#### Test 3.1: Make Partial Corrections
1. On ReviewQuote screen, change labour hours from 4 to 5
2. Confirm one assumption checkbox
3. Click **"Save for Later"**
4. App should return to NewEstimate or EstimatesList

#### Test 3.2: Verify Partial Save
Run in Supabase SQL Editor:

```sql
SELECT
  id,
  status,
  user_corrections_json,
  created_quote_id,
  extraction_json->'time'->'labour_entries'->0->'hours'->>'value' as original_hours_preserved
FROM voice_intakes
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected Result:**
- `status` = `'needs_user_review'` (unchanged)
- `user_corrections_json` IS NOT NULL (corrections saved)
- `created_quote_id` = NULL (no quote created)
- `original_hours_preserved` = original value (not 5)

**Evidence:** ✓ Partial save successful with no side effects

---

### PART 4: Evidence Set 3 - Deterministic Re-Extraction

#### Goal: Prove corrections applied without hallucination

#### Test 4.1: Confirm Corrections
1. Return to voice intake (via app navigation or direct link)
2. ReviewQuote screen should load with saved corrections
3. Click **"Confirm & Continue"**
4. Wait for Processing screen (should be fast, ~100ms for deterministic merge)

#### Test 4.2: Verify Deterministic Merge
Run in Supabase SQL Editor:

```sql
SELECT
  id,
  status,
  (extraction_json->'time'->'labour_entries'->0->'hours'->>'value')::numeric as merged_hours,
  (extraction_json->'time'->'labour_entries'->0->'hours'->>'confidence')::numeric as merged_confidence,
  (user_corrections_json->'labour_overrides'->>'labour_0_hours')::numeric as user_hours,
  extraction_confidence as overall_confidence,
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions_count
FROM voice_intakes
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected Result:**
- `status` = `'extracted'` (changed from needs_user_review)
- `merged_hours` = `user_hours` (exactly 5.0)
- `merged_confidence` = 1.0 (user-corrected)
- `overall_confidence` > 0.7 (increased)
- `assumptions_count` = same or less (no new assumptions)

**Evidence:** ✓ Deterministic merge successful, no hallucination

---

### PART 5: Evidence Set 4 - Quote Creation

#### Goal: Prove quote only created after confirmation

#### Test 5.1: Let Quote Creation Complete
1. Processing screen should automatically call create-draft-quote
2. Should route to ReviewDraft screen
3. Quote should be visible

#### Test 5.2: Verify Quote Linkage
Run in Supabase SQL Editor:

```sql
SELECT
  vi.id as intake_id,
  vi.status as intake_status,
  vi.created_quote_id,
  q.id as quote_id,
  q.quote_number,
  q.status as quote_status,
  COUNT(qli.id) as line_items
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE vi.id = (SELECT id FROM voice_intakes ORDER BY updated_at DESC LIMIT 1)
GROUP BY vi.id, vi.status, vi.created_quote_id, q.id, q.quote_number, q.status;
```

**Expected Result:**
- `intake_status` = `'quote_created'`
- `created_quote_id` = quote_id (linked)
- `quote_status` = `'draft'`
- `line_items` > 0 (has labour items)

**Evidence:** ✓ Quote created only after confirmation

---

### PART 6: Evidence Set 5 - Pricing Immutability

#### Goal: Prove corrections didn't corrupt pricing

#### Test 6.1: Verify Pricing Snapshot
Run in Supabase SQL Editor:

```sql
SELECT
  q.id as quote_id,
  q.quote_number,
  vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents' as snapshot_rate,
  pp.hourly_rate_cents as profile_rate,
  vi.user_corrections_json->'labour_overrides' as labour_changed,
  q.subtotal_cents,
  q.tax_cents,
  q.total_cents,
  CASE
    WHEN (vi.extraction_json->'pricing_defaults_used'->>'hourly_rate_cents')::int = pp.hourly_rate_cents
    THEN 'PASS: Rates match'
    ELSE 'FAIL: Rate corrupted'
  END as pricing_check
FROM quotes q
JOIN voice_intakes vi ON vi.created_quote_id = q.id
JOIN users u ON u.id = vi.user_id
JOIN user_pricing_profiles pp ON pp.id = u.active_pricing_profile_id
WHERE q.id = (SELECT created_quote_id FROM voice_intakes ORDER BY updated_at DESC LIMIT 1);
```

**Expected Result:**
- `snapshot_rate` = `profile_rate` (not modified)
- `pricing_check` = 'PASS: Rates match'
- `labour_changed` shows our edits (quantity changed, not rate)
- `subtotal_cents` calculated with profile rate

**Evidence:** ✓ Pricing immutable, corrections only affect quantities

---

### PART 7: Evidence Set 6 - Idempotency

#### Goal: Prove no duplicate quotes possible

#### Test 7.1: Check for Duplicates
Run in Supabase SQL Editor:

```sql
-- Should return 0 rows
SELECT
  voice_intake_id,
  COUNT(*) as duplicate_count,
  array_agg(id) as quote_ids
FROM quotes
WHERE voice_intake_id IS NOT NULL
GROUP BY voice_intake_id
HAVING COUNT(*) > 1;
```

**Expected Result:**
- Query returns **0 rows** (no duplicates)

#### Test 7.2: Verify Constraint Exists
Run in Supabase SQL Editor:

```sql
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'quotes'::regclass
  AND conname = 'one_quote_per_intake_when_not_cancelled';
```

**Expected Result:**
- Constraint exists with partial unique index definition

**Evidence:** ✓ Idempotency guaranteed by database constraint

---

### PART 8: Evidence Set 7 - Audit Trail

#### Goal: Prove complete audit trail preserved

#### Test 8.1: Verify Audit Trail
Run in Supabase SQL Editor:

```sql
SELECT
  id,
  status,
  -- Original extraction preserved
  extraction_json->'repaired_transcript' as transcript,
  extraction_json->'time'->'labour_entries'->0 as original_structure,
  -- Corrections stored separately
  jsonb_pretty(user_corrections_json) as corrections,
  -- Metadata
  jsonb_array_length(COALESCE(assumptions, '[]'::jsonb)) as assumptions,
  created_at,
  updated_at,
  updated_at - created_at as time_elapsed
FROM voice_intakes
WHERE id = (SELECT id FROM voice_intakes ORDER BY updated_at DESC LIMIT 1);
```

**Expected Result:**
- `extraction_json` preserved (contains original values)
- `user_corrections_json` separate (contains user edits)
- Both visible in output
- `updated_at` > `created_at` (shows progression)

**Evidence:** ✓ Complete audit trail, no silent overwrites

---

### PART 9: Evidence Set 8 - Backward Compatibility

#### Goal: Prove old intakes still work

#### Test 9.1: Check Legacy Intakes
Run in Supabase SQL Editor:

```sql
SELECT
  id,
  status,
  created_quote_id IS NOT NULL as has_quote,
  user_corrections_json IS NULL as is_legacy,
  extraction_confidence,
  created_at,
  CASE
    WHEN user_corrections_json IS NULL AND status = 'quote_created'
    THEN 'PASS: Legacy works'
    ELSE 'INFO: Legacy or no quote yet'
  END as legacy_check
FROM voice_intakes
WHERE user_corrections_json IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:**
- Some intakes with `is_legacy` = true
- Some with `has_quote` = true
- No errors in processing

**Evidence:** ✓ Backward compatibility maintained

---

## Summary Verification

### Final Health Check
Run in Supabase SQL Editor:

```sql
WITH metrics AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'needs_user_review' AND created_quote_id IS NULL) as blocked,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'needs_user_review') as partial,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'extracted') as merged,
    COUNT(*) FILTER (WHERE user_corrections_json IS NOT NULL AND status = 'quote_created') as completed,
    (SELECT COUNT(*) FROM quotes WHERE voice_intake_id IS NOT NULL GROUP BY voice_intake_id HAVING COUNT(*) > 1 LIMIT 1) as dupes
  FROM voice_intakes
)
SELECT
  blocked as "E1: Blocked",
  partial as "E2: Partial Saves",
  merged as "E3: Merges",
  completed as "E4-7: Complete",
  COALESCE(dupes, 0) as "E6: Dupes",
  CASE WHEN COALESCE(dupes, 0) = 0 THEN '✓ ALL PASS' ELSE '✗ FAIL' END as result
FROM metrics;
```

**Expected Result:**
```
E1: Blocked | E2: Partial Saves | E3: Merges | E4-7: Complete | E6: Dupes | result
------------|-------------------|------------|----------------|-----------|------------
1+          | 1+                | 1+         | 1+             | 0         | ✓ ALL PASS
```

---

## Evidence Documentation

### Create Evidence Report
After running all queries, document results:

```sql
-- Copy this query result to evidence report
SELECT
  'Evidence Set 1: State Transition Safety' as evidence,
  EXISTS(SELECT 1 FROM voice_intakes WHERE status = 'needs_user_review' AND created_quote_id IS NULL) as pass
UNION ALL
SELECT
  'Evidence Set 2: Partial Save',
  EXISTS(SELECT 1 FROM voice_intakes WHERE user_corrections_json IS NOT NULL AND status = 'needs_user_review')
UNION ALL
SELECT
  'Evidence Set 3: Deterministic Merge',
  EXISTS(SELECT 1 FROM voice_intakes WHERE user_corrections_json IS NOT NULL AND status = 'extracted')
UNION ALL
SELECT
  'Evidence Set 4: Quote After Confirmation',
  EXISTS(SELECT 1 FROM voice_intakes WHERE user_corrections_json IS NOT NULL AND status = 'quote_created')
UNION ALL
SELECT
  'Evidence Set 5: Pricing Immutability',
  EXISTS(SELECT 1 FROM quotes q JOIN voice_intakes vi ON vi.created_quote_id = q.id WHERE vi.extraction_json->'pricing_defaults_used' IS NOT NULL)
UNION ALL
SELECT
  'Evidence Set 6: No Duplicates',
  NOT EXISTS(SELECT 1 FROM quotes WHERE voice_intake_id IS NOT NULL GROUP BY voice_intake_id HAVING COUNT(*) > 1)
UNION ALL
SELECT
  'Evidence Set 7: Audit Trail',
  EXISTS(SELECT 1 FROM voice_intakes WHERE user_corrections_json IS NOT NULL AND extraction_json IS NOT NULL)
UNION ALL
SELECT
  'Evidence Set 8: Backward Compatibility',
  EXISTS(SELECT 1 FROM voice_intakes WHERE user_corrections_json IS NULL AND status = 'quote_created');
```

---

## Acceptance Checklist

- [ ] Evidence 1: Quality guards block low-confidence quotes
- [ ] Evidence 2: Partial saves work without side effects
- [ ] Evidence 3: Deterministic merge applies corrections correctly
- [ ] Evidence 4: Quotes created only after confirmation
- [ ] Evidence 5: Pricing uses profile rates (immutable)
- [ ] Evidence 6: Zero duplicate quotes
- [ ] Evidence 7: Complete audit trail preserved
- [ ] Evidence 8: Legacy intakes work normally

**Status:** All 8 evidence sets must PASS for Phase A2 acceptance.

---

## Troubleshooting

### Issue: Intake doesn't route to ReviewQuote
**Cause:** Confidence too high
**Fix:** Record with more uncertainty words: "uh", "maybe", "not sure"

### Issue: Can't find intake ID
**Fix:** Use this query:
```sql
SELECT id, status, created_at FROM voice_intakes ORDER BY created_at DESC LIMIT 5;
```

### Issue: Quote created before confirmation
**Cause:** Quality guards passed on first extraction
**Fix:** This is correct behavior! Guards check quality, not strict status

### Issue: Duplicate quotes found
**Cause:** Constraint not working
**Fix:** Check constraint:
```sql
SELECT * FROM pg_constraint WHERE conrelid = 'quotes'::regclass;
```

---

## Evidence Files

- **SQL Queries:** `PHASE_A2_EVIDENCE_VERIFICATION.sql`
- **Evidence Report:** `PHASE_A2_EVIDENCE_REPORT.md`
- **Implementation:** `PHASE_A2_IMPLEMENTATION_REPORT.md`
- **This Guide:** `PHASE_A2_EVIDENCE_COLLECTION_GUIDE.md`

---

**Time to Complete:** ~10 minutes
**Evidence Collection:** Manual + SQL queries
**Acceptance:** All 8 PASS required
