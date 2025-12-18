# Phase A3 End-to-End Test Plan

**Date:** 2025-12-16
**Phase:** A3 Voice Confidence UX
**Status:** OPTIONAL TEST SCENARIO

This is an optional manual test plan to verify the Phase A3 confidence visualization features in a real user flow.

---

## Prerequisites

1. User account logged in
2. Active pricing profile configured (e.g., $80/hour, 20% materials markup)
3. Materials catalog has at least one item (e.g., "Interior Paint - White" at $45.00/gallon)
4. Microphone access granted in browser

---

## Test Scenario: Paint Three Bedrooms

### Test ID: A3-E2E-001

### Objective
Verify complete flow from voice input through confidence review to quote creation, specifically testing:
- Overall confidence bar visualization
- Per-field confidence indicators
- Low confidence field highlighting
- Auto-focus behavior
- Save for Later functionality
- Confirm flow with deterministic merge
- Quote creation with corrected values

---

## Test Steps

### Step 1: Record Voice Input

**Action:**
1. Navigate to Voice Recorder screen
2. Tap microphone button
3. Say: "Paint three bedrooms white. Should take about four hours per room. Need two gallons of paint."
4. Stop recording

**Expected:**
- Waveform animation shows during recording
- "Processing..." screen appears after stopping
- Status changes: `pending` → `transcribed` → `needs_user_review`

**Database Check (optional):**
```sql
SELECT status, transcript_text, extraction_confidence
FROM voice_intakes
WHERE id = '[intake_id]';

-- Expected:
-- status: 'needs_user_review'
-- extraction_confidence: between 0.70 and 0.80 (moderate)
```

---

### Step 2: Verify Review Screen Loads

**Expected Screen Elements:**

1. Overall confidence bar
   - Should show color: AMBER (for ~72% confidence)
   - Should show percentage text
   - Should show description: "Moderate confidence - please review"

2. Assumptions section
   - Should show 2 assumptions detected
   - Each assumption should have:
     - Checkbox (unchecked initially)
     - Confidence dot (color indicates confidence)
     - Assumption text (read-only)
     - Source text
   - Should have "Confirm All" button

3. Labour section
   - Should show field "Hours" with RED border and RED dot (low confidence)
   - Should show field "Days" with AMBER dot (moderate confidence)
   - Should show field "People" with GREEN dot (high confidence)
   - Hours field should be auto-focused (cursor blinking)

4. Materials section
   - Should show "Quantity" field with GREEN dot (high confidence)

5. Sticky status bar (bottom)
   - Should show "Remaining Issues: 3"
   - Should show "3 items remaining"

**Interaction Test - Hover Tooltips:**
- Hover over Hours RED dot
- Should show tooltip with:
  - Confidence percentage (e.g., "65%")
  - Source (e.g., "Implied from context")
  - Status message (e.g., "Below threshold (< 70%)")

---

### Step 3: Edit Hours Field

**Action:**
1. Hours field should already be focused
2. Clear existing value (12.0)
3. Type new value: 10.0
4. Tab to next field or click outside

**Expected:**
- Sticky status bar updates in real-time
- "Remaining Issues" decreases: 3 → 2
- "Estimated Confidence" increases: ~72% → ~78%
- Message still shows "items remaining" (not ready yet)
- Hours field still has RED border (not saved yet)

**Note:** This is CLIENT-SIDE PREVIEW ONLY. Server-side calculation happens on confirm.

---

### Step 4: Confirm Assumptions

**Action:**
1. Click "Confirm All" button

**Expected:**
- Both assumption cards fade to GREEN background
- Checkmarks appear next to both assumptions
- Sticky bar updates:
  - "Remaining Issues: 0"
  - "Estimated Confidence: ~87%"
  - Message: "Ready to proceed ✓" (green text)

**Interaction Test - Individual Unconfirm:**
1. Click checkbox on first assumption (to uncheck it)
2. Card should fade back to default (gray) background
3. Sticky bar should update:
   - "Remaining Issues: 1"
   - Message: "items remaining"
4. Click checkbox again to re-confirm
5. Card should return to green
6. Sticky bar should show "Ready to proceed ✓"

---

### Step 5: Expand Audit Trail

**Action:**
1. Scroll down to "Audit Trail" section
2. Click section header or chevron icon

**Expected:**
- Section expands with smooth animation
- Shows two read-only text areas:
  1. "Original Transcript" - shows raw voice transcript
  2. "Original Extraction Data" - shows JSON from extraction
- Info message: "This data is preserved for audit purposes and cannot be modified."
- User can SELECT and COPY text
- User CANNOT edit text (no input controls)

**Interaction Test:**
1. Try to select text from transcript box → should work
2. Try to type in JSON box → should not work (read-only)
3. Click collapse arrow → section should hide again

---

### Step 6: Save for Later

**Action:**
1. Click "Save for Later" button at bottom

**Expected:**
- Button shows loading state: "Saving..."
- Success message appears
- Returns to estimates list
- Draft appears in "Needs Review" section with "Draft Saved" badge

**Database Check:**
```sql
SELECT
  status,
  user_corrections_json,
  extraction_json->'time'->'labour_entries'->0->'hours'->>'value' as original_hours
FROM voice_intakes
WHERE id = '[intake_id]';

-- Expected Result:
-- status: 'needs_user_review' (UNCHANGED - still in review)
-- user_corrections_json: {"labour_overrides": {"labour_0_hours": 10}, "confirmed_assumptions": [...]}
-- original_hours: '12' (UNCHANGED - extraction_json immutable)
```

**Critical Verification:**
- Status has NOT changed to 'extracted'
- user_corrections_json is saved
- extraction_json is NOT modified (original hours still 12)
- No quote created yet

---

### Step 7: Return and Confirm

**Action:**
1. From estimates list, click the saved draft
2. Review screen loads with saved corrections
3. Click "Confirm & Continue" button

**Expected:**
- Loading state: "Processing..."
- Backend performs deterministic merge (not AI extraction)
- Status transitions: `needs_user_review` → `extracted` → `quote_created`
- Quote preview screen loads

**Database Check:**
```sql
SELECT
  status,
  extraction_json->'time'->'labour_entries'->0->'hours'->>'value' as hours_value,
  extraction_json->'time'->'labour_entries'->0->'hours'->>'confidence' as hours_confidence,
  extraction_json->'quality'->>'overall_confidence' as overall_confidence
FROM voice_intakes
WHERE id = '[intake_id]';

-- Expected Result:
-- status: 'extracted'
-- hours_value: '10' (corrected value, was 12)
-- hours_confidence: '1' (boosted from 0.65)
-- overall_confidence: between '0.85' and '0.90' (recalculated server-side)
```

**Critical Verification:**
- Hours changed from 12 → 10 (correction applied)
- Hours confidence boosted to 1.0 (was 0.65)
- Confirmed assumptions confidence boosted to 1.0
- Overall confidence recalculated by server (not client preview)

---

### Step 8: Verify Quote Created

**Expected Screen:**
Quote preview shows:

1. Quote number (e.g., "Quote #1001")
2. Job description: "Paint three bedrooms white"
3. Line items:
   - Labour: 10 hours @ $80.00/hr = $800.00 (NOT 12 hours)
   - Materials: 2 gallons @ $45.00 + 20% markup = $108.00
   - Subtotal: $908.00
   - GST (10%): $90.80
   - Total: $998.80
4. Action buttons: "Send to Customer", "Edit", "Download PDF"

**Database Check - Quote Exists:**
```sql
SELECT
  q.id,
  q.intake_id,
  q.total_cents,
  q.pricing_snapshot->>'hourly_rate_cents' as rate,
  vi.status
FROM quotes q
JOIN voice_intakes vi ON vi.id = q.intake_id
WHERE q.intake_id = '[intake_id]';

-- Expected Result:
-- id: [quote_id]
-- intake_id: [intake_id]
-- total_cents: 99880 ($998.80)
-- rate: '8000' ($80.00)
-- status: 'quote_created'
```

**Database Check - Idempotency:**
```sql
SELECT COUNT(*) as quote_count
FROM quotes
WHERE intake_id = '[intake_id]';

-- Expected Result:
-- quote_count: 1 (only one quote, no duplicates)
```

**Database Check - Line Items:**
```sql
SELECT
  description,
  type,
  hours,
  rate_cents,
  amount_cents
FROM quote_line_items
WHERE quote_id = '[quote_id]'
ORDER BY type, id;

-- Expected Results:
-- Labour row:
--   hours: 10.0 (corrected value, NOT 12.0)
--   rate_cents: 8000
--   amount_cents: 80000 ($800.00)
-- Materials row:
--   amount_cents: 10800 ($108.00 including markup)
```

---

## Success Criteria

Test passes if:

1. ✅ Overall confidence bar shows correct color for confidence level
2. ✅ Low confidence fields have colored borders and dots
3. ✅ First low confidence field is auto-focused on load
4. ✅ Tooltips show confidence details on hover
5. ✅ Sticky status bar updates in real-time (preview mode)
6. ✅ Confirm All button works and provides visual feedback
7. ✅ Individual assumption confirm/unconfirm works
8. ✅ Audit trail is expandable and read-only
9. ✅ Save for Later preserves corrections without changing status
10. ✅ Saved draft can be resumed from estimates list
11. ✅ Confirm & Continue uses deterministic merge (not AI)
12. ✅ Server-side confidence recalculation (not just client preview)
13. ✅ Quote created with corrected values (10 hours, not 12)
14. ✅ Idempotency enforced (one quote per intake)
15. ✅ No backend functions modified (verify checksums)
16. ✅ No migrations added (count remains 33)

---

## Failure Investigation

If any step fails:

1. Check browser console for errors
2. Check network tab for failed API calls
3. Run the 8 SQL verification queries from PHASE_A3_ACCEPTANCE_EVIDENCE.md
4. Verify checksums match expected values
5. Review confidence calculation logic in extract-quote-data function

---

## Phase A2 Behavior Verification

During this test, verify Phase A2 guarantees remain intact:

1. **Deterministic Merge:**
   - Backend console should log "deterministic merge" (not "AI extraction")
   - No OpenAI API call after user confirms
   - Merge completes in < 500ms

2. **Separate Storage:**
   - `extraction_json` never modified (original hours stay 12)
   - `user_corrections_json` contains only corrections
   - Both columns present in database

3. **Server-Side Confidence Boost:**
   - Corrected fields confidence → 1.0
   - Confirmed assumptions confidence → 1.0
   - Overall confidence recalculated server-side

4. **Idempotency:**
   - Only one quote created per intake
   - Constraint prevents duplicates
   - Re-running confirm does not create new quote

5. **Pricing from Profile:**
   - Quote uses active pricing profile
   - Pricing snapshot captured in quote
   - No hardcoded rates

6. **Audit Trail:**
   - Original transcript preserved
   - Original extraction preserved
   - User can view but not modify

---

## End of Test Plan

This test plan is optional but recommended to verify all Phase A3 UX features work correctly in a real user scenario.
