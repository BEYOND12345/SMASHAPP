# Review Flow Column Name Fix

**Date:** 2025-12-17
**Issue:** Database error - column `voice_intakes.repaired_transcript` does not exist
**Root Cause:** Code referencing deprecated column name
**Status:** ✅ FIXED

---

## The Problem

After implementing fail-closed behavior, the Review screen correctly caught a database error:

```
Database error: column voice_intakes.repaired_transcript does not exist
```

**Why it surfaced now:**
- Fail-closed validation forces all fields to load before rendering
- Previously, this error might have been silent or masked
- New strict validation exposed the bad column reference

---

## Schema Verification

**Actual voice_intakes columns:**
```
id, org_id, user_id, customer_id, source,
audio_storage_path, audio_duration_seconds,
transcript_text,           ← CORRECT COLUMN
transcript_model, transcript_language, transcript_confidence,
extraction_json, extraction_model, extraction_confidence,
missing_fields, assumptions, status, created_quote_id,
error_code, error_message, user_corrections_json,
created_at, updated_at
```

**Key finding:** The column is `transcript_text`, not `repaired_transcript`.

---

## The Fix

### File: src/screens/reviewquote.tsx

**Line 141 - SELECT Statement:**
```typescript
// BEFORE (Wrong):
.select('extraction_json, assumptions, missing_fields, user_corrections_json, repaired_transcript, status')

// AFTER (Correct):
.select('extraction_json, assumptions, missing_fields, user_corrections_json, transcript_text, status')
```

**Line 226 - State Assignment:**
```typescript
// BEFORE (Wrong):
setRawTranscript(data.repaired_transcript || '');

// AFTER (Correct):
setRawTranscript(data.transcript_text || '');
```

---

## What About Other Files?

**Other references to `repaired_transcript` found in:**
- Documentation files (.md)
- Evidence reports (.sql)
- Edge function prompt (extract-quote-data/index.ts)

**Why these are OK:**
1. **Documentation:** Historical records, no runtime impact
2. **Edge function prompt:** Asks OpenAI to include `repaired_transcript` in the extraction JSON (stored in `extraction_json` column, not as separate column)
3. **Edge function code:** Does NOT try to update a `repaired_transcript` column

The edge function's UPDATE statement only touches:
```typescript
.update({
  extraction_json: extractedData,      // ← includes repaired_transcript as JSON field
  extraction_model: "gpt-4o",
  extraction_confidence: overallConfidence
})
```

No attempt to write to a `repaired_transcript` column.

---

## Build Status

✅ **Build successful:** 404.49 kB, no errors

---

## Testing

### Before Fix
1. Navigate to Review screen
2. See error: "Cannot Load Review Data"
3. Message: "Database error: column voice_intakes.repaired_transcript does not exist"

### After Fix
1. Navigate to Review screen
2. Data loads successfully
3. Transcript displayed (if exists)
4. No database errors

---

## Why Fail-Closed Behavior is Good

**This is proof that fail-closed validation works:**
1. Exposed a real bug that was previously hidden
2. Prevented broken UI from rendering
3. Gave clear error message with exact problem
4. Forced fix before users saw broken functionality

**Before fail-closed:**
- SELECT might have failed silently
- Page might have rendered with partial data
- Transcript field would be empty with no explanation
- User wouldn't know why data was missing

**After fail-closed:**
- SELECT fails with explicit error
- Page shows clear error screen
- Error message identifies exact problem
- Developer can fix immediately

---

## Summary

**What happened:**
1. Implemented fail-closed validation (previous fix)
2. Validation exposed SELECT query referencing non-existent column
3. Error message clearly identified the problem
4. Fixed by changing `repaired_transcript` → `transcript_text`

**Why this is good:**
- System caught its own bug
- Clear error message enabled fast fix
- No silent data loss or corruption
- User sees professional error screen, not broken UI

**Lesson:** Fail-closed behavior helps catch bugs early and loudly.

---

## Related Files

- **src/screens/reviewquote.tsx** - Fixed SELECT and state assignment
- **REVIEW_FLOW_FAIL_CLOSED_FIX.md** - Previous fix that enabled this discovery

---

**The fail-closed implementation is working exactly as intended - catching real errors before they cause broken UI.**
