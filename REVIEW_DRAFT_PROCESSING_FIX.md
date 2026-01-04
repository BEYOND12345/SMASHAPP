# Review Draft Processing Fix - Implementation Report

## Problem Statement

The ReviewDraft UI was getting stuck in "Processing" state even when the database showed:
- `voice_intakes.stage = 'draft_done'`
- `voice_intakes.created_quote_id` populated
- Quote exists in the database

**Root Cause:** The processing completion logic required `hasRealItems` to be true, meaning at least one non-placeholder line item had to exist. This created a race condition where the backend completed but line items weren't written yet, causing the UI to remain stuck.

## Solution Implemented

### A. Updated Code Sections

#### 1. isDraftComplete Calculation (Line 825)

**BEFORE:**
```typescript
const isDraftComplete = intake?.stage === 'draft_done' && hasRealItems;
```

**AFTER:**
```typescript
const isDraftComplete = intake?.stage === 'draft_done' && intake?.created_quote_id != null;
```

**Change:** Processing banner now clears when `stage === 'draft_done'` AND `created_quote_id` is not null. Does NOT require line items to exist.

#### 2. showProcessingState Calculation (Lines 838-843)

**BEFORE:**
```typescript
const showProcessingState = !isDraftComplete && (
  intake?.stage === 'draft_started' ||
  intake?.stage === 'extract_done' ||
  intake?.stage === 'extracting' ||
  (hasLineItems && hasOnlyPlaceholders) ||
  isProcessing
);
```

**AFTER:**
```typescript
const showProcessingState = !isDraftComplete && (
  intake?.stage === 'draft_started' ||
  intake?.stage === 'extract_done' ||
  intake?.stage === 'extracting' ||
  isProcessing
);
```

**Change:** Removed the placeholder-only condition since processing should clear as soon as draft is done.

#### 3. Initial Load Logic (Lines 299-328)

**BEFORE:**
```typescript
const isDraftDone = intakeResult.data?.stage === 'draft_done';
// ...
if (hasRealItems && isDraftDone) {
  markProcessingComplete();
}
```

**AFTER:**
```typescript
const isDraftDone = intakeResult.data?.stage === 'draft_done';
const hasCreatedQuoteId = !!intakeResult.data?.created_quote_id;

console.log('[ReviewDraft] INITIAL LOAD CHECK:', {
  // ... enhanced logging
  has_created_quote_id: hasCreatedQuoteId,
  should_complete: isDraftDone && hasCreatedQuoteId,
});

if (isDraftDone && hasCreatedQuoteId) {
  console.log('[ReviewDraft] PROCESSING COMPLETE ON MOUNT - Conditions met:', {
    quote_id: quoteId,
    intake_stage: intakeResult.data?.stage,
    intake_created_quote_id: intakeResult.data?.created_quote_id,
    real_items_count: realItemsCount,
    reason: 'draft_done stage + created_quote_id present',
  });
  markProcessingComplete();
}
```

#### 4. Refresh Logic (Lines 372-449)

**Key Changes:**
- Check for `isDraftDone && hasCreatedQuoteId` instead of requiring line items
- Handle RLS permission errors explicitly
- Add polling trace logs with reason codes
- Continue polling for line items even after processing banner clears

```typescript
if (isDraftDone && hasCreatedQuoteId) {
  console.log('[ReviewDraft] PROCESSING COMPLETE - Conditions met:', {
    quote_id: quoteId,
    intake_stage: currentIntake?.stage,
    intake_created_quote_id: currentIntake?.created_quote_id,
    real_items_count: realItemsCount,
    has_line_items: hasLineItems,
    reason: 'draft_done stage + created_quote_id present',
  });
  markProcessingComplete();

  if (!hasLineItems) {
    console.log('[REVIEWDRAFT_POLL] trace_id=' + traceIdRef.current + ' reason=waiting_for_line_items count=0');
  } else {
    setRefreshAttempts(0);
  }
  return true;
}

console.log('[REVIEWDRAFT_POLL] trace_id=' + traceIdRef.current + ' reason=' +
  (!isDraftDone ? 'stage_not_draft_done' : !hasCreatedQuoteId ? 'no_created_quote_id' : 'unknown') +
  ' stage=' + currentIntake?.stage + ' count=' + (lineItemsResult.data?.length || 0));
```

**RLS Error Handling:**
```typescript
if (lineItemsResult.error) {
  console.error('[ReviewDraft] REFRESH: Line items query failed:', {
    error: lineItemsResult.error,
    message: lineItemsResult.error.message,
    code: lineItemsResult.error.code,
  });

  if (lineItemsResult.error.code === '42501' || lineItemsResult.error.message?.includes('permission')) {
    setError('Access denied to line items. Please contact support.');
    stopRefreshPolling();
    stopStatusRotation();
    stopTimeoutCheck();
    return false;
  }
}
```

#### 5. Polling Function (Lines 537-572)

**BEFORE:**
```typescript
const MAX_ATTEMPTS = 40;
const POLL_INTERVAL = 1000;

refreshIntervalRef.current = setInterval(async () => {
  if (!processingStateRef.current.isActive) {
    stopRefreshPolling();
    return;
  }
  // ...
}, POLL_INTERVAL);
```

**AFTER:**
```typescript
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL = 2000;

refreshIntervalRef.current = setInterval(async () => {
  attempts++;
  setRefreshAttempts(attempts);

  const needsPolling = !intake?.stage || intake?.stage !== 'draft_done' ||
    !intake?.created_quote_id || lineItems.length === 0;

  logDiagnostics('POLLING_ATTEMPT', {
    attempt: attempts,
    max_attempts: MAX_ATTEMPTS,
    elapsed_ms: Date.now() - processingStateRef.current.startTime,
    intake_stage: intake?.stage,
    has_created_quote_id: !!intake?.created_quote_id,
    line_items_count: lineItems.length,
    needs_polling: needsPolling,
  });

  const success = await refreshLineItems();

  if (!needsPolling && lineItems.length > 0) {
    console.log('[ReviewDraft] Polling complete - line items loaded');
    stopRefreshPolling();
    return;
  }

  if (attempts >= MAX_ATTEMPTS) {
    console.warn('[ReviewDraft] Polling timeout after 20 seconds');
    stopRefreshPolling();
  }
}, POLL_INTERVAL);
```

**Changes:**
- Poll every 2 seconds (instead of 1 second)
- Maximum 10 attempts = 20 seconds total (instead of 40 seconds)
- Continue polling until line items arrive, not just until processing completes
- Stop polling when `draft_done` + `created_quote_id` + line items exist

#### 6. Empty State UI (Lines 1075-1083, 1151-1160)

**Labour Section:**
```typescript
{!hasLineItems && !extractionData?.time?.labour_entries && isStillProcessing ? (
  <div className="space-y-3">
    <SkeletonRow />
    <SkeletonRow />
  </div>
) : !hasLineItems && !isStillProcessing && isDraftComplete ? (
  <div className="py-4 text-center">
    <p className="text-sm text-tertiary italic">Waiting for items...</p>
  </div>
) : !hasLineItems && extractionData?.time?.labour_entries ? (
  // Show extraction data
) : hasLineItems ? (
  // Show actual line items
) : (
  <p className="text-sm text-tertiary">No labour items</p>
)}
```

**Materials Section:**
```typescript
{!hasLineItems && !extractionData?.materials?.items && isStillProcessing ? (
  <div className="space-y-3">
    <SkeletonRow />
    <SkeletonRow />
    <SkeletonRow />
  </div>
) : !hasLineItems && !isStillProcessing && isDraftComplete ? (
  <div className="py-4 text-center">
    <p className="text-sm text-tertiary italic">Waiting for items...</p>
  </div>
) : !hasLineItems && extractionData?.materials?.items ? (
  // Show extraction data
) : hasLineItems ? (
  // Show actual line items
) : (
  <p className="text-sm text-tertiary">No materials</p>
)}
```

**Changes:**
- Show skeleton rows only while still processing (`isStillProcessing`)
- Show "Waiting for items..." when draft is complete but line items haven't arrived
- Differentiate between processing, waiting, and no data states

## B. State Progression Flow

### Expected User Experience

1. **Initial State (0-2s):**
   - Processing banner shows: "Processing your quote"
   - Skeleton rows in Labour and Materials sections
   - Button disabled: "Preparing details..."

2. **Backend Completes (when stage becomes draft_done):**
   - Processing banner CLEARS immediately
   - Quote title loads
   - Labour/Materials show: "Waiting for items..."
   - Polling continues in background

3. **Line Items Arrive (within 20s):**
   - "Waiting for items..." replaced with actual line items
   - Labour and Materials sections populate
   - Button enabled: "Confirm Job and Build Quote"
   - Polling stops

4. **Edge Case - Line Items Delayed:**
   - If 20 seconds elapse without line items, polling stops
   - "Waiting for items..." remains visible
   - User can still proceed by clicking button

5. **Edge Case - RLS Denial:**
   - Error message: "Access denied to line items. Please contact support."
   - Processing stops
   - User cannot proceed

## C. Console Log Examples

### Normal Flow
```
[ReviewDraft] INITIAL LOAD CHECK: {
  intake_stage: "draft_done",
  intake_created_quote_id: "088113a1-464e-4867-b174-69d87024ebbd",
  has_created_quote_id: true,
  should_complete: true
}

[ReviewDraft] PROCESSING COMPLETE ON MOUNT - Conditions met: {
  quote_id: "088113a1-464e-4867-b174-69d87024ebbd",
  intake_stage: "draft_done",
  intake_created_quote_id: "088113a1-464e-4867-b174-69d87024ebbd",
  reason: "draft_done stage + created_quote_id present"
}

[REVIEWDRAFT_POLL] trace_id=abc123 reason=waiting_for_line_items count=0
```

### Still Processing Flow
```
[ReviewDraft] REFRESH CHECK: {
  intake_stage: "extracting",
  has_created_quote_id: false,
  should_complete: false
}

[REVIEWDRAFT_POLL] trace_id=abc123 reason=stage_not_draft_done stage=extracting count=0
```

### RLS Denial Flow
```
[ReviewDraft] REFRESH: Line items query failed: {
  error: { code: "42501", message: "permission denied" }
}
```

## D. Edge Cases Handled

### 1. Quote Created But Line Items Not Written Yet
**Scenario:** Backend sets `stage=draft_done` and `created_quote_id`, but line items table write is delayed.

**Handling:**
- Processing banner clears immediately (good UX)
- Shows "Waiting for items..." in Labour/Materials
- Polling continues for up to 20 seconds
- Automatically populates when items arrive
- User can proceed even if items don't arrive

### 2. RLS Blocks quote_line_items Query
**Scenario:** User has permission to see quote but not line items (org_id mismatch or policy issue).

**Handling:**
- Explicit error check for code `42501` or "permission" in message
- Clear error message: "Access denied to line items. Please contact support."
- Stops all polling and processing
- Prevents user from proceeding with invalid data

### 3. Backend Never Completes
**Scenario:** Voice intake gets stuck in intermediate stage.

**Handling:**
- Original 45-second timeout still applies
- Shows timeout warning
- User can retry or proceed manually

### 4. Line Items Partially Written
**Scenario:** Some items written, then process fails.

**Handling:**
- Shows whatever items exist
- Continues polling for additional items
- User can proceed with partial data
- Edit screen allows manual additions

## Test Case Validation

Using the provided test case:
- `intake_id`: e14e2451-9d09-472f-9ca2-a956babe29b0
- `created_quote_id`: 088113a1-464e-4867-b174-69d87024ebbd
- `stage`: draft_done
- `status`: quote_created

**Expected Behavior:**
1. Processing banner clears immediately on load
2. Quote title displays
3. If line items exist: display them
4. If line items missing: show "Waiting for items..." and poll
5. Console shows: `[REVIEWDRAFT_POLL] trace_id=... reason=waiting_for_line_items count=0`

## Summary

The fix decouples processing completion from line items existence, allowing the UI to reflect the true backend state. The processing banner now correctly clears when the backend is done (`draft_done` + `created_quote_id`), while line items load gracefully in the background with clear user feedback.

**Key Improvements:**
- ✅ No more false "stuck processing" state
- ✅ Clear visual feedback during each stage
- ✅ Handles race conditions gracefully
- ✅ Explicit RLS error handling
- ✅ Reduced polling duration (20s vs 40s)
- ✅ Trace logging for debugging
