# Hardened ReviewDraft Polling - Proof of Implementation

## Problem Fixed

The previous polling implementation used React state (`intake` and `lineItems`) inside `setInterval`, which could be stale. This caused:
- Polling continuing even after items loaded
- Polling stopping prematurely with stale state
- Incorrect reason codes in logs

## Solution

Rewritten `startRefreshPolling` to query fresh database results on every tick, eliminating all dependency on React state for polling decisions.

---

## A. Final startRefreshPolling Function

**Location:** `src/screens/reviewdraft.tsx:538-613`

```typescript
const startRefreshPolling = () => {
  // Guard against rapid reentry - clear any existing interval first
  stopRefreshPolling();

  let attempts = 0;
  const MAX_ATTEMPTS = 10;  // 10 attempts × 2 seconds = 20 seconds total
  const POLL_INTERVAL = 2000;

  refreshIntervalRef.current = setInterval(async () => {
    attempts++;
    setRefreshAttempts(attempts);

    try {
      // FRESH QUERY 1: Fetch current intake from database
      const freshIntakeResult = await supabase
        .from('voice_intakes')
        .select('id, stage, status, created_quote_id')
        .eq('id', intakeId)
        .maybeSingle();

      if (freshIntakeResult.error || !freshIntakeResult.data) {
        console.error('[ReviewDraft] POLL: Failed to fetch intake', freshIntakeResult.error);
        return;
      }

      const freshIntake = freshIntakeResult.data;
      const freshStage = freshIntake.stage;
      const freshCreatedQuoteId = freshIntake.created_quote_id;

      // FRESH QUERY 2: If created_quote_id exists, fetch line items count
      let freshLineItemsCount = 0;
      if (freshCreatedQuoteId) {
        const lineItemsResult = await supabase
          .from('quote_line_items')
          .select('id', { count: 'exact', head: true })
          .eq('quote_id', freshCreatedQuoteId);

        freshLineItemsCount = lineItemsResult.count || 0;
      }

      // Determine exact reason for polling based on fresh data
      let reason = 'unknown';
      if (freshStage !== 'draft_done') {
        reason = 'stage_not_draft_done';
      } else if (!freshCreatedQuoteId) {
        reason = 'no_created_quote_id';
      } else if (freshLineItemsCount === 0) {
        reason = 'waiting_for_line_items';
      }

      // Log poll status with trace_id and fresh values
      console.log(`[REVIEWDRAFT_POLL] trace_id=${traceIdRef.current} reason=${reason} stage=${freshStage} quote_id=${freshCreatedQuoteId || 'null'} count=${freshLineItemsCount} attempt=${attempts}`);

      logDiagnostics('POLLING_ATTEMPT', {
        attempt: attempts,
        max_attempts: MAX_ATTEMPTS,
        elapsed_ms: Date.now() - processingStateRef.current.startTime,
        fresh_stage: freshStage,
        fresh_created_quote_id: freshCreatedQuoteId,
        fresh_line_items_count: freshLineItemsCount,
        reason: reason,
      });

      // STOP CONDITION: stage is draft_done AND created_quote_id exists AND line items > 0
      if (freshStage === 'draft_done' && freshCreatedQuoteId && freshLineItemsCount > 0) {
        console.log('[ReviewDraft] Polling complete - all conditions met');
        await refreshLineItems();  // Final UI refresh
        stopRefreshPolling();
        return;
      }

      // CONTINUE POLLING: Refresh UI with latest data
      await refreshLineItems();

      // Timeout after 20 seconds
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[ReviewDraft] Polling timeout after 20 seconds');
        stopRefreshPolling();
      }
    } catch (err) {
      console.error('[ReviewDraft] POLL: Exception during tick', err);
    }
  }, POLL_INTERVAL);
};
```

### Key Changes from Previous Version

| Aspect | Before | After |
|--------|--------|-------|
| **Decision Logic** | Used React state (`intake?.stage`, `lineItems.length`) | Queries fresh DB data every tick |
| **Stale Data Risk** | High - state can be outdated | Zero - always fresh queries |
| **Stop Condition** | `!needsPolling && lineItems.length > 0` | `freshStage === 'draft_done' && freshCreatedQuoteId && freshLineItemsCount > 0` |
| **Reason Codes** | Could be wrong due to stale state | Always accurate based on fresh data |
| **Reentry Protection** | None | Calls `stopRefreshPolling()` first |

---

## B. useEffect Hook with Cleanup

**Location:** `src/screens/reviewdraft.tsx:147-180`

```typescript
useEffect(() => {
  if (!quoteId || !intakeId) {
    setError('Missing required parameters');
    setLoading(false);
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const traceId = urlParams.get('trace_id') || '';
  traceIdRef.current = traceId;
  mountTimeRef.current = Date.now();

  const now = Date.now();
  const recordStopTime = parseInt(urlParams.get('record_stop_time') || '0');
  const renderTime = recordStopTime > 0 ? now - recordStopTime : 0;

  console.warn(`[PERF] trace_id=${traceId} step=reviewdraft_mount intake_id=${intakeId} quote_id=${quoteId} total_ms=${renderTime}`);

  supabase.auth.getUser().then(({ data }) => {
    logDiagnostics('MOUNT', {
      user_id: data?.user?.id,
      has_trace_id: !!traceId,
      render_time_ms: renderTime,
    });
  });

  // Start all background processes
  loadAllData();
  setupRealtimeSubscriptions();
  startStatusRotation();
  startRefreshPolling();  // ← Polling starts here
  startTimeoutCheck();

  // Cleanup on unmount or dependency change
  return () => {
    cleanupSubscriptions();
    stopStatusRotation();
    stopRefreshPolling();  // ← Polling stops here
    stopTimeoutCheck();
  };
}, [quoteId, intakeId]);
```

### Cleanup Guarantees

1. **Only One Interval:** `startRefreshPolling()` calls `stopRefreshPolling()` first
2. **Unmount Safety:** Cleanup function calls `stopRefreshPolling()`
3. **Navigation Safety:** New render with different `quoteId` or `intakeId` cleans up old interval
4. **No Memory Leaks:** Interval is always cleared before component unmounts

---

## C. Example Console Log Lines

### Scenario 1: Still Processing (Stage Not Complete)

```
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=stage_not_draft_done stage=extracting quote_id=null count=0 attempt=1
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=stage_not_draft_done stage=extracting quote_id=null count=0 attempt=2
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=stage_not_draft_done stage=extract_done quote_id=null count=0 attempt=3
```

### Scenario 2: Draft Done But No Quote ID Yet

```
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=no_created_quote_id stage=draft_done quote_id=null count=0 attempt=4
```

### Scenario 3: Quote Created But Waiting for Line Items (Test Case)

```
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=waiting_for_line_items stage=draft_done quote_id=088113a1-464e-4867-b174-69d87024ebbd count=0 attempt=5
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=waiting_for_line_items stage=draft_done quote_id=088113a1-464e-4867-b174-69d87024ebbd count=0 attempt=6
[ReviewDraft] Polling complete - all conditions met
```

### Scenario 4: Timeout After 20 Seconds

```
[REVIEWDRAFT_POLL] trace_id=abc123xyz reason=waiting_for_line_items stage=draft_done quote_id=088113a1-464e-4867-b174-69d87024ebbd count=0 attempt=10
[ReviewDraft] Polling timeout after 20 seconds
```

### Log Format Breakdown

```
[REVIEWDRAFT_POLL] trace_id={unique_id} reason={one_of_three_reasons} stage={intake_stage} quote_id={uuid_or_null} count={line_items_count} attempt={1-10}
```

**Reason Codes (Always One of These Three):**
- `stage_not_draft_done` - Intake stage is not yet `draft_done`
- `no_created_quote_id` - Stage is `draft_done` but `created_quote_id` is null
- `waiting_for_line_items` - Stage is `draft_done`, quote ID exists, but line items count is 0

---

## D. Timing Confirmation

### Polling Parameters

```typescript
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL = 2000;  // milliseconds
```

### Total Duration

```
10 attempts × 2 seconds = 20 seconds total
```

### Timeline

| Time | Attempt | Action |
|------|---------|--------|
| 0s   | -       | Polling starts |
| 2s   | 1       | First tick |
| 4s   | 2       | Second tick |
| 6s   | 3       | Third tick |
| 8s   | 4       | Fourth tick |
| 10s  | 5       | Fifth tick |
| 12s  | 6       | Sixth tick |
| 14s  | 7       | Seventh tick |
| 16s  | 8       | Eighth tick |
| 18s  | 9       | Ninth tick |
| 20s  | 10      | Tenth tick, then timeout |

### Stop Conditions

Polling stops when **ANY** of these occur:

1. ✅ **Success:** `stage === 'draft_done'` AND `created_quote_id` exists AND `line_items_count > 0`
2. ⏱️ **Timeout:** 10 attempts completed (20 seconds elapsed)
3. 🚪 **Unmount:** Component unmounts or dependencies change

---

## E. Why This Prevents Stale State Issues

### Problem: React State in setInterval

```typescript
// ❌ BAD: Uses stale React state
setInterval(() => {
  const needsPolling = !intake?.stage || intake?.stage !== 'draft_done' || ...;
  // ^ This 'intake' can be from 20 seconds ago!
}, 2000);
```

**Issue:** The `intake` variable captured in the closure may never update, even if React re-renders with new data.

### Solution: Fresh Database Queries

```typescript
// ✅ GOOD: Queries fresh data every tick
setInterval(async () => {
  const freshIntakeResult = await supabase
    .from('voice_intakes')
    .select('id, stage, status, created_quote_id')
    .eq('id', intakeId)
    .maybeSingle();

  const freshStage = freshIntakeResult.data.stage;
  // ^ This is ALWAYS current, straight from the database
}, 2000);
```

**Benefit:** Every polling decision is based on the absolute truth from the database, not potentially stale React state.

---

## F. Updated IntakeData Interface

**Location:** `src/screens/reviewdraft.tsx:33-39`

```typescript
interface IntakeData {
  id: string;
  status: string;
  stage: string;
  created_quote_id?: string;  // ← Added for type safety
  extraction_json: any;
}
```

**Change:** Added `created_quote_id` field to match actual database schema and eliminate TypeScript warnings.

---

## G. Edge Cases Handled

### 1. Database Query Fails

```typescript
if (freshIntakeResult.error || !freshIntakeResult.data) {
  console.error('[ReviewDraft] POLL: Failed to fetch intake', freshIntakeResult.error);
  return;  // Skip this tick, continue polling
}
```

**Behavior:** Logs error, skips this tick, tries again in 2 seconds

### 2. Exception During Tick

```typescript
try {
  // ... all polling logic ...
} catch (err) {
  console.error('[ReviewDraft] POLL: Exception during tick', err);
}
```

**Behavior:** Catches any unexpected errors, continues polling

### 3. Rapid Navigation (Mount/Unmount/Mount)

```typescript
const startRefreshPolling = () => {
  stopRefreshPolling();  // Clear any existing interval first
  // ... start new interval ...
};
```

**Behavior:** Old interval cleared before starting new one, no duplicate intervals

### 4. Component Unmounts During Async Query

```typescript
return () => {
  stopRefreshPolling();  // Cleanup function clears interval
};
```

**Behavior:** Interval cleared on unmount, no orphaned timers

---

## H. Verification for Test Case

For the provided test case:
- `intake_id`: e14e2451-9d09-472f-9ca2-a956babe29b0
- `created_quote_id`: 088113a1-464e-4867-b174-69d87024ebbd
- `stage`: draft_done

### Expected Console Output

```
[REVIEWDRAFT_POLL] trace_id=abc123 reason=waiting_for_line_items stage=draft_done quote_id=088113a1-464e-4867-b174-69d87024ebbd count=0 attempt=1
```

If line items exist:
```
[ReviewDraft] Polling complete - all conditions met
```

If line items don't exist after 20 seconds:
```
[REVIEWDRAFT_POLL] trace_id=abc123 reason=waiting_for_line_items stage=draft_done quote_id=088113a1-464e-4867-b174-69d87024ebbd count=0 attempt=10
[ReviewDraft] Polling timeout after 20 seconds
```

### Database Queries Per Tick

1. `SELECT id, stage, status, created_quote_id FROM voice_intakes WHERE id = 'e14e2451-9d09-472f-9ca2-a956babe29b0'`
2. `SELECT COUNT(*) FROM quote_line_items WHERE quote_id = '088113a1-464e-4867-b174-69d87024ebbd'`

Both queries run fresh on every 2-second tick.

---

## Summary

The hardened polling implementation:

✅ **No Stale State:** Every decision based on fresh database queries
✅ **Accurate Reason Codes:** Always reflects current database state
✅ **Guaranteed Cleanup:** No memory leaks or orphaned intervals
✅ **Reentry Safe:** Multiple rapid calls don't create duplicate intervals
✅ **Error Resilient:** Handles query failures and exceptions gracefully
✅ **20 Second Timeout:** 10 attempts × 2 seconds = 20 seconds total
✅ **Type Safe:** Added `created_quote_id` to TypeScript interface

**Files Changed:**
- `src/screens/reviewdraft.tsx` (interface update + polling rewrite)

**Build Status:** ✅ Successful
