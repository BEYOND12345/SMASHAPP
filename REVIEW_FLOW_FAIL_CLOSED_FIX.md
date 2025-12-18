# Review Flow FAIL-CLOSED Fix - Problem B Resolved

**Date:** 2025-12-17
**Issue:** Review screen renders with missing data, showing conflicting confidence values (0% vs 15%)
**Root Cause:** Fail-open behavior - page renders even when critical data loading fails
**Status:** ✅ FIXED - Now fail-closed

---

## The Real Problem (Problem B)

**Problem A was fixed earlier:** Confirm no longer re-runs extraction.

**Problem B (just fixed):** The Review page was **fail-open** instead of **fail-closed**:
- Page rendered even when `extraction_json` loading failed
- `overallConfidence` defaulted to 0 (showed "0%")
- `calculateEstimatedConfidence()` computed different value (showed "15%")
- Confirm button was enabled with missing/invalid data
- Two conflicting data sources displayed simultaneously

### Smoking Gun Evidence
```
Confidence Level: 0%        ← From state default value
Estimated Confidence: 15%   ← From calculation function
```

These cannot both be correct. This proved multiple data sources with no single source of truth.

---

## The Fail-Closed Fix

### Core Principle
**If ANY critical data is missing, the review screen MUST NOT render.**

Instead, show clear error and force user back to dashboard.

---

## Changes Made

### 1. State Initialization - No Default Values

**BEFORE (Wrong):**
```typescript
const [overallConfidence, setOverallConfidence] = useState(0);  // ← Defaults to 0!
```

**AFTER (Correct):**
```typescript
const [overallConfidence, setOverallConfidence] = useState<number | null>(null);  // ← No default
const [criticalDataMissing, setCriticalDataMissing] = useState(false);
```

**Why this matters:**
- `null` signals "not loaded yet" vs 0 which is a valid confidence score
- TypeScript enforces null checks
- UI can distinguish between "loading failed" and "actual 0% confidence"

---

### 2. Critical Field Validation - Fail Closed

**Enhanced `loadIntakeData()` with comprehensive validation:**

```typescript
// Validate intake_id
if (!intakeId || intakeId.trim() === '') {
  setCriticalDataMissing(true);
  throw new Error('Invalid intake ID. Cannot load review data.');
}

// Validate extraction_json exists
if (!data.extraction_json) {
  setCriticalDataMissing(true);
  throw new Error('CRITICAL: extraction_json is missing. Quote data cannot be loaded.');
}

// Validate quality metadata exists
if (!data.extraction_json.quality) {
  setCriticalDataMissing(true);
  throw new Error('CRITICAL: quality metadata is missing. Cannot determine confidence.');
}

// Validate confidence value exists
const overallConf = data.extraction_json.quality.overall_confidence;
if (overallConf === undefined || overallConf === null) {
  setCriticalDataMissing(true);
  throw new Error('CRITICAL: overall_confidence is missing. Cannot evaluate quote quality.');
}
```

**Result:**
- Every critical field checked explicitly
- Specific error messages for each failure
- `criticalDataMissing` flag set on ANY validation failure
- No silent fallbacks, no defaults, no optimistic rendering

---

### 3. Fail-Closed UI Rendering

**Added guard BEFORE rendering main UI:**

```typescript
// FAIL CLOSED: If critical data is missing, do NOT render review form
if (criticalDataMissing || !extractionData || overallConfidence === null) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Cannot Load Review Data</h2>
          <p className="text-gray-600 mb-2">
            {error || 'Critical data is missing and the review cannot be displayed.'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Please refresh the page or return to dashboard.
          </p>
          <Button onClick={onBack} variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

**What this prevents:**
- Review form rendering with missing data
- User seeing broken/misleading UI
- Confirm button executing with invalid state
- Silent failures that users don't notice

---

### 4. Single Source of Truth - Removed Calculated Confidence

**BEFORE (Wrong - Two Sources):**
```typescript
// Function that calculated confidence
function calculateEstimatedConfidence(): number {
  const unconfirmedAssumptions = assumptions.filter(
    a => !(corrections.confirmed_assumptions || []).includes(a.field)
  );

  if (unconfirmedAssumptions.length === 0) {
    return Math.min(1.0, overallConfidence + 0.15);  // ← Adds 15%!
  }

  return overallConfidence;
}

// UI showing TWO different values:
<p>Confidence Level: {(overallConfidence * 100).toFixed(0)}%</p>          // ← 0%
<p>Estimated Confidence: {(calculateEstimatedConfidence() * 100)}%</p>   // ← 15%
```

**AFTER (Correct - Single Source):**
```typescript
// REMOVED: calculateEstimatedConfidence() - Single source of truth enforced
// Confidence value is ONLY read from extraction_json.quality.overall_confidence
// No calculation, no estimation, no fallback to 0

// UI showing ONE value from ONE source:
<p>Confidence Level: {overallConfidence !== null ? `${(overallConfidence * 100).toFixed(0)}%` : 'N/A'}</p>
```

**Benefits:**
- Only ONE confidence value displayed
- Always from `extraction_json.quality.overall_confidence`
- Shows 'N/A' if truly missing (not 0%)
- No confusing calculations or estimations

---

### 5. Confirm Button Protection

**Enhanced validation in `handleConfirm()`:**

```typescript
// CRITICAL VALIDATION: Cannot proceed if data is missing
if (criticalDataMissing) {
  console.error('[REVIEW_FLOW] BLOCKED: Critical data missing', { intake_id: intakeId });
  setError('Cannot confirm - critical data is missing. Please refresh the page.');
  setSaving(false);
  return;
}

if (!intakeId || !extractionData || overallConfidence === null) {
  console.error('[REVIEW_FLOW] BLOCKED: Missing required state', {
    intake_id: intakeId,
    has_extraction: !!extractionData,
    confidence: overallConfidence
  });
  setCriticalDataMissing(true);
  setError('Cannot confirm - required data is missing. Please refresh the page.');
  setSaving(false);
  return;
}
```

**Button disabled if ANY of these are true:**
```typescript
<Button
  onClick={handleConfirm}
  disabled={saving || requiredMissingCount > 0 || criticalDataMissing || overallConfidence === null}
>
```

**Result:**
- Impossible to click Confirm with missing data
- Clear error message if button somehow clicked
- Multiple layers of protection

---

### 6. Removed Deprecated Column

**Cleaned up SELECT query:**

**BEFORE:**
```typescript
.select('extraction_json, assumptions, missing_fields, user_corrections_json, extraction_confidence, repaired_transcript, status')
```

**AFTER:**
```typescript
.select('extraction_json, assumptions, missing_fields, user_corrections_json, repaired_transcript, status')
```

Removed `extraction_confidence` - deprecated column that was never the source of truth.

---

## State Flow Comparison

### BEFORE (Fail-Open - Broken)

```
1. loadIntakeData() starts
   └─> Fetch from Supabase

2. Fetch fails OR extraction_json missing
   └─> Error logged
   └─> overallConfidence stays at default: 0
   └─> extractionData might be null or partial

3. Page renders anyway (FAIL OPEN)
   └─> Shows "Confidence: 0%"
   └─> calculateEstimatedConfidence() returns 15%
   └─> Shows "Estimated Confidence: 15%"
   └─> TWO conflicting values displayed

4. User clicks Confirm
   └─> handleConfirm() runs with invalid data
   └─> Tries to update database with nulls
   └─> Backend rejects or returns error
   └─> User sees "Failed to confirm" or loops back
```

### AFTER (Fail-Closed - Fixed)

```
1. loadIntakeData() starts
   └─> Validate intake_id first

2. Fetch from Supabase
   └─> Check fetchError
   └─> Check data exists
   └─> Check extraction_json exists
   └─> Check quality exists
   └─> Check overall_confidence exists

3a. ALL validations pass:
    └─> Set overallConfidence = 0.85
    └─> Set extractionData = {...}
    └─> criticalDataMissing = false
    └─> Render review form ✓

3b. ANY validation fails:
    └─> Set criticalDataMissing = true
    └─> Set specific error message
    └─> Render error screen (FAIL CLOSED)
    └─> Disable all actions
    └─> Force user to dashboard

4. If rendered successfully:
   └─> Shows ONE confidence value: 85%
   └─> Confirm button enabled only if:
       - criticalDataMissing = false
       - overallConfidence !== null
       - All required fields filled
```

---

## Testing the Fix

### Test 1: Normal Happy Path

**Scenario:** Valid intake with proper extraction_json

**Expected Console Logs:**
```
[REVIEW_FLOW] Loading intake data { intake_id: '...' }
[REVIEW_FLOW] Supabase query result { has_data: true, has_error: false }
[REVIEW_FLOW] All critical fields validated {
  intake_id: '...',
  confidence: 0.85,
  assumptions_count: 2,
  missing_fields_count: 3
}
```

**Expected UI:**
- Review form renders
- ONE confidence value shown: 85%
- Confirm button enabled (if no required fields missing)
- No error banner

---

### Test 2: Missing extraction_json

**Scenario:** Intake exists but extraction_json is null

**Expected Console Logs:**
```
[REVIEW_FLOW] Loading intake data { intake_id: '...' }
[REVIEW_FLOW] Supabase query result { has_data: true }
[REVIEW_FLOW] CRITICAL: Missing extraction_json { intake_id: '...', data: {...} }
[REVIEW_FLOW] CRITICAL ERROR - Review cannot be shown
```

**Expected UI:**
- Error screen shown (NOT review form)
- Message: "CRITICAL: extraction_json is missing. Quote data cannot be loaded."
- "Return to Dashboard" button
- Review form NEVER renders

---

### Test 3: RLS Blocks Access

**Scenario:** User doesn't have permission to view intake

**Expected Console Logs:**
```
[REVIEW_FLOW] Loading intake data { intake_id: '...' }
[REVIEW_FLOW] Supabase query result { has_data: false, has_error: false }
[REVIEW_FLOW] CRITICAL: No data returned for intake { intake_id: '...' }
```

**Expected UI:**
- Error screen shown
- Message: "Intake not found. It may have been deleted or you may not have permission to access it."
- "Return to Dashboard" button

---

### Test 4: Attempt to Click Confirm with Bad Data

**Scenario:** Somehow Confirm is clicked with missing data (should be impossible)

**Expected Console Logs:**
```
[REVIEW_FLOW] User clicked Confirm
[REVIEW_FLOW] BLOCKED: Critical data missing { intake_id: '...' }
```

**Expected UI:**
- Error banner: "Cannot confirm - critical data is missing. Please refresh the page."
- No database update attempted
- User stays on page

---

### Test 5: Already Confirmed (Re-entry Guard)

**Scenario:** Navigate to review for intake that's already user-confirmed

**Expected Console Logs:**
```
[REVIEW_FLOW] Loading intake data { intake_id: '...' }
[REVIEW_FLOW] All critical fields validated {...}
[REVIEW_FLOW] GUARD: Intake already confirmed by user, skipping review {
  intake_id: '...',
  confirmed_at: '2025-12-17T...'
}
```

**Expected UI:**
- Brief message: "This intake has already been confirmed. Proceeding to quote creation..."
- Auto-redirect after 1 second
- Review form NEVER shown

---

## SQL Verification Queries

### Check intake has valid extraction_json

```sql
SELECT
  id,
  status,
  extraction_json IS NOT NULL as has_extraction,
  extraction_json->'quality' as quality,
  extraction_json->'quality'->>'overall_confidence' as confidence
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

**Expected:**
- `has_extraction: true`
- `quality: {...}` (object with keys)
- `confidence: "0.85"` (string number)

**If ANY are null:**
- Explains why review screen shows error
- Indicates backend didn't persist extraction_json
- Check `extract-quote-data` function logs

---

### Verify no impossible states exist

```sql
SELECT COUNT(*) as problem_count
FROM voice_intakes
WHERE (
  -- Has review status but missing extraction
  (status = 'needs_user_review' AND extraction_json IS NULL)
  OR
  -- Has review status but already has quote
  (status = 'needs_user_review' AND created_quote_id IS NOT NULL)
  OR
  -- Missing quality metadata
  (status = 'needs_user_review' AND extraction_json->'quality' IS NULL)
);
```

**Expected:** `problem_count = 0`

**If > 0:** Data integrity issue - fix backend persistence

---

## What This Prevents

### Before (Fail-Open Problems)

1. **Silent failures:** Page rendered with missing data, user unaware
2. **Conflicting values:** 0% vs 15% confidence shown simultaneously
3. **Invalid operations:** Confirm executed with null/undefined values
4. **Poor UX:** Generic "Failed to load data" with no specifics
5. **Loop potential:** Backend rejected bad data, sent user back to review
6. **Multiple sources:** No single source of truth for confidence

### After (Fail-Closed Benefits)

1. **Loud failures:** Error screen with specific message
2. **Single value:** Only ONE confidence from ONE source
3. **Protected operations:** Impossible to confirm with missing data
4. **Clear UX:** Specific error messages per field
5. **No loops:** Can't proceed without valid data
6. **Enforced truth:** `extraction_json.quality.overall_confidence` is THE source

---

## Key Invariants Now Enforced

### UI Rendering Invariant
```
IF (criticalDataMissing === true) THEN:
  - Review form MUST NOT render
  - Error screen MUST show
  - All actions MUST be disabled
```

### Confidence Display Invariant
```
CONFIDENCE is ALWAYS from:
  extraction_json.quality.overall_confidence

NEVER from:
  - State default (removed)
  - Calculation (removed)
  - Deprecated column (removed)
  - Multiple sources (prevented)
```

### Confirm Execution Invariant
```
BEFORE handleConfirm() proceeds:
  1. criticalDataMissing MUST be false
  2. intakeId MUST be valid string
  3. extractionData MUST be object
  4. overallConfidence MUST be number (not null)
  5. Required fields MUST be filled

IF ANY fail:
  - Show specific error
  - Prevent execution
  - Do NOT call backend
```

---

## Files Changed

### src/screens/reviewquote.tsx

**Lines 102:** Added `criticalDataMissing` state
**Lines 107:** Changed `overallConfidence` from `useState(0)` to `useState<number | null>(null)`
**Lines 126-240:** Enhanced `loadIntakeData()` with comprehensive validation
**Lines 377-379:** Removed `calculateEstimatedConfidence()` function
**Lines 423-441:** Added validation in `handleConfirm()` before proceeding
**Lines 551-573:** Added fail-closed UI check before rendering
**Lines 1018-1044:** Updated footer to show single confidence source
**Lines 1048:** Disabled Confirm button if `criticalDataMissing` or `overallConfidence === null`

---

## Build Status

✅ **Build successful:** 404.50 kB, no errors

---

## Success Criteria

### ✅ Fail-Closed Behavior
- Review form NEVER renders with missing data
- Error screen shown with specific message
- User forced to dashboard or refresh

### ✅ Single Source of Truth
- Only ONE confidence value displayed
- Always from `extraction_json.quality.overall_confidence`
- Shows 'N/A' if missing (not 0%)

### ✅ Protected Operations
- Confirm button disabled if data missing
- handleConfirm validates before proceeding
- Impossible to execute with invalid state

### ✅ Clear Error Messages
- "CRITICAL: extraction_json is missing"
- "CRITICAL: quality metadata is missing"
- "CRITICAL: overall_confidence is missing"
- No generic "Failed to load data"

### ✅ No Silent Failures
- Every validation logs specific error
- criticalDataMissing flag set on failure
- User always knows WHY it failed

---

## What to Monitor

### Daily Health Check

```sql
-- Run this daily
SELECT
  COUNT(*) FILTER (WHERE status = 'needs_user_review' AND extraction_json IS NULL) as missing_extraction,
  COUNT(*) FILTER (WHERE status = 'needs_user_review' AND extraction_json->'quality' IS NULL) as missing_quality,
  COUNT(*) FILTER (WHERE status = 'needs_user_review' AND created_quote_id IS NOT NULL) as impossible_state
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Expected:**
- `missing_extraction = 0`
- `missing_quality = 0`
- `impossible_state = 0`

**If any > 0:** Backend persistence issue

---

## Summary

**Problem B (Now Fixed):** Review page was fail-open, rendering with missing data and showing conflicting values.

**Solution:** Fail-closed behavior with:
1. No default values (null signals missing)
2. Comprehensive field validation (every critical field checked)
3. Fail-closed UI (error screen if any validation fails)
4. Single source of truth (only extraction_json.quality.overall_confidence)
5. Protected operations (Confirm disabled/blocked if data missing)

**Result:** Review screen is now reliable, truthful, and impossible to use with invalid data.

---

**The system now enforces data integrity at the UI layer, not just the backend.**
