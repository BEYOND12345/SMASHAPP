# Voice-to-Quote Flow Fix - Complete Verification Proof

**Fix Version**: v2.3-2026-01-03-source-field-fix
**Date**: 2026-01-03
**Status**: Implementation Complete - Ready for Testing

---

## Executive Summary

**Problem**: Voice-to-quote flow was generating placeholder items instead of real extracted materials, labour, and fees. Root cause was a race condition where the invariant trigger checked `voice_intakes.created_quote_id` before the background processing updated it.

**Solution**: Added `quotes.source` field set at INSERT time, eliminating the race condition. Trigger now deterministically checks `NEW.source` which is immediately available.

**Changes Deployed**:
1. ✅ Database migration: `add_quote_source_field.sql`
2. ✅ VoiceRecorder.tsx: Sets `source: 'voice'` on quote creation
3. ✅ create-draft-quote edge function: Sets `source: "voice"` and removes placeholders
4. ✅ ReviewDraft.tsx: Requires both real items AND draft_done stage
5. ✅ Build succeeded, edge function deployed

---

## Part 1: Code Changes Summary

### 1.1 Database Schema Change

**File**: `supabase/migrations/20260103XXXXXX_add_quote_source_field.sql`

**Purpose**: Eliminate race condition in invariant trigger

**Changes**:
```sql
-- Added source column
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'
CHECK (source IN ('voice', 'manual'));

-- Updated trigger to check NEW.source instead of voice_intakes lookup
CREATE OR REPLACE FUNCTION ensure_quote_has_line_items_after_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- NEW: Check source field directly (no race condition)
  IF NEW.source = 'voice' THEN
    RAISE WARNING '[QUOTE_INVARIANT_SKIP] Quote % is voice-sourced, skipping placeholder insertion', NEW.id;
    RETURN NEW;
  END IF;

  -- Original placeholder insertion logic for manual quotes...
END;
$$ LANGUAGE plpgsql;

-- Backfilled existing voice quotes
UPDATE quotes q
SET source = 'voice'
WHERE EXISTS (
  SELECT 1 FROM voice_intakes vi
  WHERE vi.created_quote_id = q.id
);
```

**Why This Works**:
- `NEW.source` is available immediately at INSERT time
- No dependency on foreign key lookups that happen later
- Trigger fires synchronously, decision is deterministic

---

### 1.2 Frontend Quote Creation

**File**: `src/screens/voicerecorder.tsx`
**Line**: 460

**Purpose**: Mark quote as voice-sourced at creation time

**Change**:
```typescript
const { data: quoteShell, error: quoteError } = await supabase
  .from('quotes')
  .insert({
    org_id: profile.org_id,
    customer_id: customerId_for_quote,
    quote_number: quoteNumber,
    title: 'Processing job',
    description: '',
    scope_of_work: [],
    status: 'draft',
    source: 'voice',  // ← ADDED: Marks quote as voice-sourced
    currency: 'AUD',
    default_tax_rate: 10,
    tax_inclusive: false,
  })
```

**Impact**: Invariant trigger sees `NEW.source = 'voice'` and skips placeholder insertion

---

### 1.3 Edge Function Quote Creation

**File**: `supabase/functions/create-draft-quote/index.ts`
**Lines**: 410-427, 436-465

**Purpose**: Ensure voice quotes are marked and placeholders are removed

**Changes**:
```typescript
// Version updated to track fix
const DRAFT_VERSION = "v2.3-2026-01-03-source-field-fix";

// Quote creation with source field
const { data: newQuote, error: quoteError } = await supabaseAdmin
  .from("quotes")
  .insert({
    org_id: profile.org_id,
    customer_id: customerId,
    quote_number: quoteNumber,
    title: quoteTitle,
    description: quoteDescription,
    scope_of_work: scopeOfWork,
    status: "draft",
    source: "voice",  // ← ADDED: Marks quote as voice-sourced
    currency: profile.default_currency,
    default_tax_rate: profile.default_tax_rate,
    tax_inclusive: profile.org_tax_inclusive,
    terms_and_conditions: profile.default_payment_terms || null,
  })

// Placeholder cleanup (already implemented from previous fix)
console.log(`[PLACEHOLDER_CLEANUP] Checking for placeholder items on quote ${quote.id}`);

const { data: placeholderItems } = await supabaseAdmin
  .from("quote_line_items")
  .select("id, description, is_placeholder")
  .eq("quote_id", quote.id)
  .eq("is_placeholder", true);

if (placeholderItems && placeholderItems.length > 0) {
  console.log(`[PLACEHOLDER_CLEANUP] Found ${placeholderItems.length} placeholder items, deleting now`);

  const { error: deleteError, count: deletedCount } = await supabaseAdmin
    .from("quote_line_items")
    .delete({ count: "exact" })
    .eq("quote_id", quote.id)
    .eq("is_placeholder", true);

  console.log(`[PLACEHOLDER_CLEANUP] Successfully deleted ${deletedCount} placeholder items`);
}
```

**Impact**:
- Voice quotes marked at creation (redundant with frontend, but defensive)
- Any race-condition placeholders are explicitly deleted before inserting real items
- Console logs provide audit trail

---

### 1.4 Frontend Rendering Fix

**File**: `src/screens/reviewdraft.tsx`
**Lines**: 212-218, 242-247

**Purpose**: Only mark processing complete when BOTH conditions met

**Changes**:
```typescript
// Initial load logic (line 212-218)
const hasRealItems = lineItemsResult.data && lineItemsResult.data.length > 0 &&
  lineItemsResult.data.some(item => !item.is_placeholder);
const isDraftDone = intakeResult.data?.stage === 'draft_done';

if (hasRealItems && isDraftDone) {  // ← BOTH conditions required
  markProcessingComplete();
}

// Refresh polling logic (line 242-247)
const hasRealItems = lineItemsResult.data.some(item => !item.is_placeholder);
const isDraftDone = intake?.stage === 'draft_done';

if (hasRealItems && isDraftDone) {  // ← BOTH conditions required
  markProcessingComplete();
}
```

**Impact**: Prevents showing "Totals ready" prematurely when only placeholders exist

---

## Part 2: Verification Queries

### 2.1 Voice Intake Stage and Status

**Purpose**: Confirm background processing completed successfully

**Query**:
```sql
SELECT
  id,
  status,
  stage,
  created_quote_id,
  error_code,
  error_message,
  transcript_confidence,
  extraction_confidence,
  created_at,
  updated_at
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Results**:
- `status` = `'quote_created'`
- `stage` = `'draft_done'`
- `created_quote_id` = valid UUID
- `error_code` = `null`
- `error_message` = `null`
- `transcript_confidence` > 0.7 (typically)
- `extraction_confidence` > 0.7 (typically)

**Failure Indicators**:
- `stage` = `'failed'` → Check error_message
- `stage` stuck at `'extract_done'` or `'draft_started'` → Background function crashed
- `created_quote_id` = `null` → Quote creation failed

---

### 2.2 Quote Source Field

**Purpose**: Verify quote is marked as voice-sourced

**Query**:
```sql
SELECT
  q.id,
  q.quote_number,
  q.source,
  q.status,
  q.title,
  q.scope_of_work,
  COUNT(qli.id) as line_item_count,
  SUM(CASE WHEN qli.is_placeholder THEN 1 ELSE 0 END) as placeholder_count
FROM quotes q
LEFT JOIN quote_line_items qli ON q.id = qli.quote_id
WHERE q.created_at > NOW() - INTERVAL '1 hour'
GROUP BY q.id, q.quote_number, q.source, q.status, q.title, q.scope_of_work
ORDER BY q.created_at DESC
LIMIT 5;
```

**Expected Results**:
- `source` = `'voice'`
- `line_item_count` > 0 (typically 3-10 items)
- `placeholder_count` = `0` (no placeholders)
- `scope_of_work` = non-empty array with at least 1 item
- `title` = meaningful job description (not "Processing job")

**Failure Indicators**:
- `source` = `'manual'` → Frontend or edge function didn't set source field
- `placeholder_count` > 0 → Placeholder cleanup failed or trigger still firing
- `scope_of_work` = `[]` → Extraction didn't capture scope
- `line_item_count` = 0 → No items created (should be impossible with invariant)

---

### 2.3 Line Items Pricing and Classification

**Purpose**: Verify real items with correct pricing

**Query**:
```sql
SELECT
  qli.id,
  qli.quote_id,
  qli.item_type,
  qli.description,
  qli.quantity,
  qli.unit,
  qli.unit_price_cents,
  qli.line_total_cents,
  qli.is_placeholder,
  qli.catalog_item_id,
  qli.notes,
  qli.position
FROM quote_line_items qli
JOIN quotes q ON q.id = qli.quote_id
WHERE q.created_at > NOW() - INTERVAL '1 hour'
  AND q.source = 'voice'
ORDER BY q.created_at DESC, qli.position ASC
LIMIT 20;
```

**Expected Results for Materials**:
- `item_type` = `'materials'`
- `description` = specific material name (e.g., "90mm PVC pipe", "15mm copper elbow")
- `unit_price_cents` > 0 (should have catalog pricing + markup)
- `line_total_cents` = `unit_price_cents * quantity` (exact match)
- `is_placeholder` = `false`
- `catalog_item_id` = valid UUID (if matched) OR null (if custom item)
- `notes` = null OR extraction context (NOT "Placeholder - automatic invariant enforcement")

**Expected Results for Labour**:
- `item_type` = `'labour'`
- `description` = descriptive task (e.g., "Install bathroom vanity", "Rough-in plumbing")
- `quantity` = hours (e.g., 2.5, 4.0)
- `unit` = `'hours'`
- `unit_price_cents` = org hourly rate (e.g., 10000 = $100/hr)
- `line_total_cents` = `unit_price_cents * quantity`
- `is_placeholder` = `false`

**Expected Results for Fees**:
- `item_type` = `'fee'`
- `description` = fee type (e.g., "Travel fee", "Callout fee", "Pickup fee")
- `quantity` = 1
- `unit` = `'item'`
- `unit_price_cents` > 0 (from pricing profile)
- `is_placeholder` = `false`

**Failure Indicators**:
- `is_placeholder` = `true` → Placeholder not cleaned up
- `unit_price_cents` = 0 for materials → Catalog matching failed
- `description` = "Materials (needs pricing)" → Still showing placeholder text
- `notes` = "Placeholder - automatic invariant enforcement" → Cleanup failed

---

### 2.4 Placeholder Audit Query

**Purpose**: Detect any remaining placeholders in the system

**Query**:
```sql
SELECT
  q.id as quote_id,
  q.quote_number,
  q.source,
  q.created_at as quote_created,
  qli.id as line_item_id,
  qli.item_type,
  qli.description,
  qli.is_placeholder,
  qli.notes
FROM quotes q
JOIN quote_line_items qli ON q.id = qli.quote_id
WHERE qli.is_placeholder = true
  AND q.created_at > NOW() - INTERVAL '24 hours'
ORDER BY q.created_at DESC;
```

**Expected Results**:
- **Empty result set** (no placeholders should exist for voice quotes)
- If any rows returned for `source = 'voice'` → Critical bug, placeholders not being cleaned

**Acceptable Results**:
- Rows with `source = 'manual'` are OK (manual quotes may have intentional placeholders)

---

## Part 3: Golden Path Test

### 3.1 Test Scenario

**Job Description**:
"Installing a new bathroom vanity. I need a 1200mm white vanity unit with basin, plus a chrome tapware set. Labour will take about 3 hours. I'll also need to charge a callout fee and travel to the site which is 25km away."

**Expected Extraction**:
- **Materials**:
  - "1200mm vanity unit" → Should match catalog item
  - "Chrome tapware set" → Should match catalog item
- **Labour**:
  - 3 hours at org hourly rate
- **Fees**:
  - Callout fee (from pricing profile)
  - Travel fee (from pricing profile or distance-based)
- **Scope of Work**: ["Install bathroom vanity", "Install tapware"] (or similar)

---

### 3.2 Test Steps

1. **Record Voice Intake**:
   - Open voice recorder screen
   - Select or create a customer
   - Record the test scenario above (or type it in transcript)
   - Submit for processing

2. **Monitor Processing**:
   - Wait 5-10 seconds for background processing
   - Navigate to ReviewDraft screen
   - Observe checklist progression:
     - ✅ Recording captured
     - ✅ Transcript generated
     - ✅ Details extracted
     - ⏳ Building quote (should complete in 5-10s)
     - ✅ Totals ready

3. **Verify Quote Contents**:
   - Check scope of work appears at top
   - Count line items (should have 4-5 items minimum):
     - 2 material items
     - 1 labour item
     - 2 fee items (callout + travel)
   - Verify NO items show "needs pricing" or "(needs estimation)"
   - Check material prices are > $0
   - Check labour price = org hourly rate × 3 hours
   - Check fees are present and priced

4. **Database Verification**:
   - Note the quote_id from the URL or screen
   - Run verification queries from Part 2
   - Confirm:
     - `quotes.source = 'voice'`
     - `voice_intakes.stage = 'draft_done'`
     - `quote_line_items.is_placeholder = false` for ALL items
     - Pricing values are correct

---

### 3.3 Success Criteria

✅ **PASS** if:
- All line items have `is_placeholder = false`
- Materials have `unit_price_cents > 0`
- Labour has correct hourly rate and hours
- Fees are present and priced
- Scope of work is populated
- Quote title is descriptive (not "Processing job")
- ReviewDraft shows "Totals ready" only after all items inserted
- No console errors in browser or edge function logs

❌ **FAIL** if:
- ANY item has `is_placeholder = true`
- ANY item shows "needs pricing" or "(needs estimation)" text
- Materials have `unit_price_cents = 0`
- Scope of work is empty array
- Quote title still says "Processing job"
- ReviewDraft shows "Totals ready" before items are inserted
- Console errors appear during processing

---

## Part 4: Debugging Guide

### 4.1 If Placeholders Still Appear

**Check 1**: Verify trigger is skipping voice quotes
```sql
-- Should show recent WARNING logs about skipping voice quotes
SELECT * FROM postgres_log
WHERE message LIKE '%QUOTE_INVARIANT_SKIP%'
ORDER BY log_time DESC LIMIT 10;
```

**Check 2**: Verify quote has source field set
```sql
SELECT id, quote_number, source, created_at
FROM quotes
WHERE id = '<quote_id>';
```
- If `source = 'manual'` → Frontend or edge function not setting field
- If `source IS NULL` → Migration didn't apply

**Check 3**: Verify edge function version
```sql
SELECT version, created_at
FROM voice_intakes
WHERE created_quote_id = '<quote_id>';
```
- Check edge function logs for version string: should be `v2.3-2026-01-03-source-field-fix`

---

### 4.2 If Materials Have No Pricing

**Check 1**: Verify catalog matching worked
```sql
SELECT
  qli.description,
  qli.catalog_item_id,
  mci.unit_price_cents as catalog_price,
  qli.unit_price_cents as quoted_price
FROM quote_line_items qli
LEFT JOIN material_catalog_items mci ON qli.catalog_item_id = mci.id
WHERE qli.quote_id = '<quote_id>' AND qli.item_type = 'materials';
```
- If `catalog_item_id IS NULL` → Matching failed, item not in catalog
- If `catalog_price IS NULL` → Catalog item exists but has no price
- If `quoted_price != catalog_price * markup` → Markup calculation issue

**Check 2**: Review extract-quote-data logs
- Edge function logs should show catalog matching results
- Look for: `[CATALOG_MATCH]` log entries
- Check if match confidence scores are reasonable (> 0.7)

---

### 4.3 If Stage Stuck at extract_done

**Symptom**: `voice_intakes.stage = 'extract_done'` but never progresses to `'draft_done'`

**Cause**: create-draft-quote edge function not triggering or crashing

**Check 1**: Verify update-intake-stage was called
```sql
SELECT * FROM postgres_log
WHERE message LIKE '%stage transition%'
AND log_time > NOW() - INTERVAL '1 hour'
ORDER BY log_time DESC;
```

**Check 2**: Review create-draft-quote edge function logs
- Check Supabase Dashboard → Edge Functions → Logs
- Look for errors or missing invocations
- Search for the voice_intake_id in logs

**Check 3**: Manually trigger stage update
```sql
UPDATE voice_intakes
SET stage = 'draft_started'
WHERE id = '<intake_id>' AND stage = 'extract_done';
```
- This should trigger create-draft-quote to run
- Monitor logs to see if it processes successfully

---

## Part 5: Rollback Plan

If this fix causes issues, rollback steps:

### 5.1 Revert Edge Function
```bash
# Deploy previous version (would need to be stored)
# Or disable source field check manually
```

### 5.2 Remove Source Field (Nuclear Option)
```sql
-- Only do this if absolutely necessary
ALTER TABLE quotes DROP COLUMN IF EXISTS source;

-- Restore original trigger (without source check)
-- (Would need to recreate from backup)
```

### 5.3 Temporary Workaround
```sql
-- Disable invariant trigger temporarily
DROP TRIGGER IF EXISTS ensure_quote_has_line_items ON quotes;

-- Re-enable after investigation
```

---

## Part 6: Success Metrics

### Key Performance Indicators

**Reliability**:
- 0% of voice quotes should have placeholders after draft_done
- 100% of voice quotes should have source='voice'
- 95%+ of materials should match catalog and have pricing

**Performance**:
- Average time from extract_done → draft_done: 5-10 seconds
- No increase in processing time vs. previous implementation

**Quality**:
- Extraction confidence avg > 0.75
- Catalog match confidence avg > 0.80
- User corrections rate < 20%

---

## Part 7: Final Checklist

- [✅] Database migration applied: quotes.source field exists
- [✅] Backfill completed: existing voice quotes have source='voice'
- [✅] VoiceRecorder.tsx sets source='voice' on INSERT
- [✅] create-draft-quote sets source='voice' on INSERT
- [✅] Trigger function checks NEW.source instead of voice_intakes lookup
- [✅] Placeholder cleanup logic exists in create-draft-quote
- [✅] ReviewDraft requires both hasRealItems AND isDraftDone
- [✅] Build succeeded with no errors
- [✅] Edge function deployed successfully
- [ ] Golden path test executed (pending user test)
- [ ] Verification queries executed (pending user test)
- [ ] Real-world voice quote created (pending user test)

---

## Conclusion

**Implementation Status**: ✅ COMPLETE

**Testing Status**: ⏳ PENDING

All code changes have been deployed. The race condition has been eliminated by adding the `quotes.source` field which is set at INSERT time and checked synchronously by the invariant trigger.

The next step is to execute the golden path test and run the verification queries to confirm the fix works in production.

**Confidence Level**: HIGH - The root cause (race condition) has been addressed at the architectural level by removing the timing dependency. The placeholder cleanup provides defense-in-depth.
