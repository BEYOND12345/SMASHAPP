# Voice-to-Quote Flow: Comprehensive Technical Review

**Date:** 2026-01-02
**Status:** CRITICAL ISSUES IDENTIFIED
**Severity:** High - Core feature is broken

---

## Executive Summary

The voice-to-quote flow has multiple architectural issues causing quotes to appear stuck in "Processing..." state indefinitely. The root cause is a **mismatch between when the quote metadata is updated vs when line items are created**, combined with **quality guard logic that prevents line item creation but still updates quote metadata**.

**Current Behavior:**
- User records voice → Quote shell created immediately → Navigation to ReviewDraft
- Background: Upload → Transcribe → Extract (updates quote title/description) → Create Draft
- If extraction quality is low: Quote gets real title BUT zero line items
- ReviewDraft waits for line items forever → User sees "Processing..." indefinitely

---

## Architecture Analysis

### Current Flow (Broken)

```
1. VoiceRecorder:
   - Creates quote shell with title="Processing job"
   - Stores quote_id and intake_id
   - Navigates to ReviewDraft IMMEDIATELY (50ms delay)
   - Background processing starts (non-blocking)

2. Background Processing (voicerecorder.tsx lines 498-674):
   - Upload audio to storage
   - Create intake record in database
   - Call transcribe-voice-intake Edge Function
   - Call extract-quote-data Edge Function
     → Updates quote with real title/description ❌ PROBLEM
   - Call create-draft-quote Edge Function
     → Checks quality guards
     → If low quality: Returns early WITHOUT creating line items ❌ PROBLEM
     → Quote has title but 0 line items

3. ReviewDraft Screen:
   - Subscribes to realtime updates for quote
   - Waits for line_items.length > 0 to show "Ready" state
   - If line items never arrive → Stuck in "Processing..." forever
   - Shows timeout message after 30 seconds
```

### Database Evidence

**Voice Intake 83b07dea (BROKEN):**
```json
{
  "status": "needs_user_review",
  "created_quote_id": "edca7f31-cfe7-4a29-9715-7e49f34fc287",
  "has_extraction": true,
  "quote_title": "Fixing house windows",
  "line_item_count": 0  ← PROBLEM: Quote has title but no line items
}
```

**Voice Intake 30f6405f (WORKING):**
```json
{
  "status": "quote_created",
  "created_quote_id": "9067ade5-1ce8-481b-97b0-43fe355ec670",
  "has_extraction": true,
  "quote_title": "Replace windows",
  "line_item_count": 4  ← SUCCESS: Quote has both title and line items
}
```

---

## Root Cause Analysis

### Issue #1: Quote Metadata Updated Before Line Items Created

**Location:** `extract-quote-data/index.ts` lines 786-856

```typescript
// Extract function updates quote with title/description/scope
const { error: quoteUpdateError } = await supabase
  .from("quotes")
  .update({
    title: extractedData.job?.title || "Processing job",
    description: extractedData.job?.summary || "",
    scope_of_work: extractedData.job?.scope_of_work || [],
  })
  .eq("id", intake.created_quote_id);
```

**Problem:** The extract function changes the quote from "Processing job" to real title, but hasn't created line items yet. If create-draft-quote fails or returns early, the quote is left in an inconsistent state (has title, no line items).

### Issue #2: Quality Guards Prevent Line Item Creation

**Location:** `create-draft-quote/index.ts` lines 312-341

```typescript
if (extracted.quality?.requires_user_confirmation) {
  console.log("[QUOTE_CREATE] Blocked: user review required");

  await supabase
    .from("voice_intakes")
    .update({
      status: "needs_user_review",
      extraction_json: extracted,
    })
    .eq("id", intake_id);

  return new Response(
    JSON.stringify({
      success: true,
      requires_review: true,
      intake_id,
      message: "Extraction complete - user review required",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Problem:** This returns early WITHOUT creating line items. The quote shell already has a real title (from extract-quote-data), but now has zero line items. The UI expects line items to appear.

### Issue #3: UI Waits Only for Line Items

**Location:** `reviewdraft.tsx` lines 336-341

```typescript
const hasLineItems = quote?.line_items && quote.line_items.length > 0;
const isStillProcessing = isProcessing || quoteTitle === 'Processing job';
```

**Problem:** The UI checks if `quoteTitle === 'Processing job'` to determine if processing is complete, but extract-quote-data changes this to the real title BEFORE line items are created. So `isStillProcessing` becomes false, but `hasLineItems` is still false, leaving the UI in limbo.

### Issue #4: Processing Screen Logic Flaw

**Location:** `processing.tsx` lines 45-67

The processing screen I "fixed" earlier has the right order now (checks created_quote_id before status), but it doesn't solve the underlying problem: **it navigates to ReviewDraft with a quote that will never get line items**.

---

## Impact Assessment

### Affected Scenarios

1. **Low confidence extraction** (confidence < 0.7)
   - Quote gets title from extraction
   - create-draft-quote returns early
   - Zero line items created
   - User stuck forever

2. **Missing required fields**
   - Same as above
   - Quote has title, no line items
   - User stuck forever

3. **Labour confidence < 0.6**
   - Same pattern
   - Quote updated, no line items
   - User stuck forever

### Working Scenario

- **High confidence extraction** (confidence ≥ 0.7, all fields present)
  - Extract updates quote with title
  - create-draft-quote passes all guards
  - Line items created successfully
  - UI transitions properly

---

## Architectural Issues

### 1. **Premature Quote Shell Creation**

Creating the quote shell immediately in VoiceRecorder (before processing) was an optimization for perceived performance, but it creates architectural complexity:
- Quote exists before we know if it's valid
- Quote must be updated progressively
- Failure modes are complex (what if extract fails? what if create-draft fails?)

### 2. **Split Responsibility**

Quote data is updated in THREE places:
1. VoiceRecorder: Creates shell with "Processing job"
2. Extract-quote-data: Updates with real title/description/scope
3. Create-draft-quote: Creates line items and updates status

This violates single responsibility and creates race conditions.

### 3. **No Atomic Transaction**

The quote update in extract and line item creation in create-draft are separate operations. If create-draft fails, the quote is left in an inconsistent state.

### 4. **Quality Guards in Wrong Place**

Quality guards in create-draft-quote prevent line item creation, but quote metadata has already been updated. The guards should either:
- Run in extract-quote-data BEFORE updating quote, OR
- Not prevent line item creation (create default items with warnings instead)

### 5. **UI Assumes Linear Progress**

ReviewDraft assumes: quote shell → extraction → line items appear.
Reality: quote shell → extraction updates title → create-draft MAY create line items OR return early.

---

## Proposed Solutions

### Option 1: Atomic Quote Creation (Recommended)

**Change:** Don't create quote shell early. Create the entire quote (with line items) in one atomic operation.

**Flow:**
1. VoiceRecorder: Upload → Transcribe → Extract → Create Complete Quote
2. Only navigate to ReviewDraft AFTER quote is fully created with line items
3. ReviewDraft shows loading state until navigation occurs

**Pros:**
- Simpler architecture
- No inconsistent states
- Single source of truth
- Easier error handling

**Cons:**
- Slower perceived performance (user waits longer before seeing anything)
- More complex loading states

### Option 2: Progressive Enhancement with Proper State Machine

**Change:** Keep early quote shell creation, but fix the state machine.

**Flow:**
1. VoiceRecorder creates shell with status="processing_extract"
2. Extract-quote-data:
   - If quality good: Update quote + set status="processing_items"
   - If quality bad: Do NOT update quote title, set status="needs_review"
3. Create-draft-quote:
   - If status="processing_items": Create line items + update quote
   - If status="needs_review": Skip (user must review first)
4. ReviewDraft:
   - If status="processing_extract": Show "Analyzing..."
   - If status="processing_items": Show "Pricing materials..."
   - If status="needs_review": Show review form
   - If has line items: Show quote

**Pros:**
- Keeps fast perceived performance
- Proper state machine with clear transitions
- No inconsistent states

**Cons:**
- More complex state management
- Requires new quote status enum values

### Option 3: Always Create Line Items with Placeholders

**Change:** create-draft-quote always creates line items, even with low confidence.

**Flow:**
1. Keep current flow
2. Remove early returns in create-draft-quote
3. Create line items even with low confidence:
   - Labour with no hours: Create with 0 hours, note "Needs estimation"
   - Materials with no price: Create with $0, note "Needs pricing"
4. Set quote status based on completeness:
   - All line items priced: status="draft"
   - Some items need work: status="needs_review"

**Pros:**
- Simpler - one code path
- UI always gets line items
- User can see and edit incomplete items

**Cons:**
- May create incorrect/placeholder data
- User might not notice items need review

---

## Immediate Fix (Band-Aid)

For a quick fix without architectural changes:

**Change create-draft-quote to NOT return early when quality is low. Instead:**

```typescript
// Remove lines 312-341 that return early
// Always create line items, but mark quote as needs_review

// At end of function (line 760):
const finalStatus = extracted.quality?.requires_user_confirmation
  ? "needs_review"
  : "draft";

await supabase
  .from("quotes")
  .update({ status: finalStatus })
  .eq("id", quote.id);
```

This ensures line items are always created, allowing the UI to proceed.

---

## Recommended Solution

**Adopt Option 2: Progressive Enhancement with State Machine**

Rationale:
- Preserves fast perceived performance
- Fixes inconsistent states
- Clear state transitions
- Future-proof for adding more states (e.g., "generating_pdf", "sending_email")

Implementation:
1. Add new quote status values: `processing_extract`, `processing_items`, `needs_review`
2. Update extract-quote-data to set appropriate status without updating quote metadata
3. Update create-draft-quote to check status before proceeding
4. Update ReviewDraft to handle all states with appropriate UI
5. Add proper error states and recovery

---

## Testing Requirements

Before deploying any fix:

1. **Test low confidence extraction**
   - Record unclear audio
   - Verify quote gets created with line items OR proper error state
   - Verify no infinite loading

2. **Test missing required fields**
   - Record without mentioning labour/materials
   - Verify proper handling

3. **Test high confidence extraction**
   - Record clear, complete job description
   - Verify fast quote creation
   - Verify all line items appear

4. **Test review flow**
   - Trigger needs_user_review state
   - Verify user can review and confirm
   - Verify quote completes after review

5. **Test error recovery**
   - Simulate extract-quote-data failure
   - Simulate create-draft-quote failure
   - Verify user sees error, not infinite loading

---

## Conclusion

The voice-to-quote flow has fundamental architectural issues stemming from premature quote shell creation and split responsibility for quote updates. The immediate symptom (infinite loading) is caused by quote metadata being updated before line items are created, with quality guards preventing line item creation entirely.

**Critical Action Required:**
Implement proper state machine (Option 2) or atomic quote creation (Option 1) to fix the flow permanently. As a temporary measure, remove the early return in create-draft-quote to ensure line items are always created.

**Priority:** P0 - Core feature is broken
**Effort:** Medium (2-3 days for proper fix)
**Risk:** Low (fixes are well-scoped)
