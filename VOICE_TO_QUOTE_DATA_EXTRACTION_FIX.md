# Voice-to-Quote Data Extraction Fix

## Date: 2026-01-06

## Problem Statement

Voice recordings were not populating quote data. The transcript showed correct information (customer name, location, materials, labour, fees), but the generated quote showed:
- Title: "Processing job"
- Location: "[Tap to add]"
- Timeline: "[Tap to add]"
- Line items: None or $0.00

## Root Cause Analysis

### Issue 1: Incomplete Edge Function File

**File:** `supabase/functions/extract-quote-data/index.ts`

The file was incomplete, containing only:
- The OpenAI prompt definition (lines 1-99)
- A comment `//... rest of the file content`
- NO actual function logic
- NO `Deno.serve()` handler

This meant the function couldn't run at all.

### Issue 2: Wrong Function Architecture (Initial Fix Attempt)

My first fix attempt created a function that:
1. Extracted data from transcript via OpenAI
2. Created a customer record
3. **Created the quote directly** ❌
4. **Created line items directly** ❌

This was wrong because it duplicated work that `create-draft-quote` already does.

### Issue 3: Understanding the Correct Flow

The correct voice-to-quote flow is:

```
VoiceRecorder
    ↓ (uploads audio, creates voice_intake)
Processing Screen
    ↓ (step 1: analyze transcript)
extract-quote-data function
    ├─ Calls OpenAI to extract structured data
    ├─ Saves to voice_intake.extraction_json
    └─ Returns { success: true, extracted_data: {...} }
    ↓
Processing Screen
    ↓ (step 2: create quote)
create-draft-quote function
    ├─ Reads voice_intake.extraction_json
    ├─ Creates customer if needed
    ├─ Creates quote with title, location, timeline
    ├─ Creates line items (materials, labour, fees)
    └─ Returns { quote_id, line_items_count }
    ↓
ReviewDraft or QuoteEditor Screen
```

**Key Insight:** `extract-quote-data` should ONLY extract and save data, NOT create quotes.

## The Fix

### Final Corrected Function

**File:** `supabase/functions/extract-quote-data/index.ts` (202 lines)

**What it does:**
1. Receives `intake_id` from Processing screen
2. Fetches voice_intake record from database
3. Calls OpenAI with comprehensive extraction prompt
4. Parses JSON response
5. **Saves extracted data to `voice_intake.extraction_json`**
6. Updates status to "extracted"
7. Returns success

**What it does NOT do:**
- Does NOT create customer records
- Does NOT create quotes
- Does NOT create line items
- Does NOT calculate pricing

### Extraction Prompt Enhancements

Added explicit extraction rules for:

**Customer & Site (Rule 7):**
```
- Customer name: Look for 'for NAME', 'customer NAME', NAME's house
- Site address: Extract any location mention (suburb, street, address)
- Examples: 'job for John in Newtown' → name: John, site_address: Newtown
```

**Timeline (Rule 8) - NEW:**
```
- Extract natural language descriptions
- Examples: '2 to 3 days', 'about 40 hours', 'couple of days'
- Store in timeline_description field as spoken
```

**Fees (Rule 9):**
```
- travel_hours: Time to travel to site (look for 'drive there and back')
- materials_supply_hours: Time for hardware store trips
```

### Expected Extraction Output

For the transcript:
> "ok the customer lives in Byron Bay their name is David the scoper work is to replace the deck at the front of the house materials needed will be pine decking 200 linear meters and two packs of 50 mil screws Playbook will be 40 hours of work additional fees will be for the travel fee there and back each day"

Expected `extraction_json`:
```json
{
  "customer": {
    "name": "David",
    "email": null,
    "phone": null
  },
  "job": {
    "title": "Deck replacement",
    "summary": "Replace the deck at the front of the house",
    "site_address": "Byron Bay",
    "timeline_description": "40 hours",
    "estimated_days_min": null,
    "estimated_days_max": null,
    "job_date": null,
    "scope_of_work": [
      "Replace the deck at the front of the house"
    ]
  },
  "time": {
    "labour_entries": [
      {
        "description": "Deck work",
        "hours": 40,
        "days": null,
        "people": null,
        "note": null
      }
    ]
  },
  "materials": {
    "items": [
      {
        "description": "Pine decking",
        "quantity": 200,
        "unit": "m",
        "notes": null
      },
      {
        "description": "50mm screws",
        "quantity": 2,
        "unit": "packs",
        "notes": null
      }
    ]
  },
  "fees": {
    "travel_hours": null,
    "materials_supply_hours": null,
    "callout_fee_cents": null
  },
  "assumptions": []
}
```

### How create-draft-quote Uses This Data

**File:** `supabase/functions/create-draft-quote/index.ts`

**Line 274:** Reads extraction_json
```typescript
const extracted = intake.extraction_json as any;
```

**Lines 462-486:** Extracts customer and location
```typescript
const customerName = extracted.customer?.name;
const siteAddress = extracted.job?.site_address || extracted.job?.location;
```

**Lines 466-475:** Builds timeline description
```typescript
let timelineDescription = null;
if (extracted.job?.estimated_days_min && extracted.job?.estimated_days_max) {
  if (extracted.job.estimated_days_min === extracted.job.estimated_days_max) {
    timelineDescription = `${extracted.job.estimated_days_min} day(s)`;
  } else {
    timelineDescription = `${extracted.job.estimated_days_min}-${extracted.job.estimated_days_max} days`;
  }
}
```

**Lines 526-552:** Creates quote with extracted data
```typescript
const { data: newQuote, error: quoteError } = await supabaseAdmin
  .from("quotes")
  .insert({
    org_id: profile.org_id,
    customer_id: customerId,
    quote_number: quoteNumber,
    title: quoteTitle,  // from extracted.job.title
    description: quoteDescription,
    site_address: siteAddress,  // from extracted.job.site_address
    timeline_description: timelineDescription,  // from extracted
    scope_of_work: scopeOfWork,  // from extracted.job.scope_of_work
    status: "draft",
    source: "voice",
    ...
  })
```

**Lines 589-869:** Creates line items from extracted materials, labour, and fees

## Changes Made

### Files Modified

1. **`supabase/functions/extract-quote-data/index.ts`**
   - Status: Rewritten from incomplete stub to full implementation
   - Lines: 202 (was 99 incomplete lines)
   - Change: Complete function with proper separation of concerns

### Files Deployed

1. **Supabase Edge Function: `extract-quote-data`**
   - Deployed: Yes
   - Status: Active
   - Verification: Deployment successful

### Files Unchanged

1. **`supabase/functions/create-draft-quote/index.ts`** - No changes needed
2. **`src/screens/processing.tsx`** - No changes needed
3. **All database migrations** - No changes needed

## Testing Instructions

### Test 1: New Voice Recording

1. Open app in incognito/private browsing
2. Log in
3. Tap voice recorder
4. Say: "Customer is Sarah in Melbourne. Replace kitchen countertops. Need 5 meters of granite and 20 hours of labour. Travel fee for coming to site."
5. Stop recording
6. Wait for processing
7. Verify quote shows:
   - Title: "Kitchen countertop replacement" (or similar)
   - Customer: "Sarah"
   - Location: "Melbourne"
   - Timeline: "20 hours" or similar
   - Line items:
     - Granite material (5m)
     - Labour (20 hours)
     - Travel fee

### Test 2: Check Database

```sql
-- Find recent voice intake
SELECT
  id,
  transcript,
  extraction_json->>'customer' as customer_data,
  extraction_json->'job'->>'title' as extracted_title,
  extraction_json->'job'->>'site_address' as extracted_location,
  extraction_json->'job'->>'timeline_description' as extracted_timeline,
  status,
  created_quote_id
FROM voice_intakes
ORDER BY created_at DESC
LIMIT 1;

-- Check the quote was created correctly
SELECT
  q.id,
  q.title,
  q.site_address,
  q.timeline_description,
  c.name as customer_name,
  (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) as line_item_count
FROM quotes q
LEFT JOIN customers c ON c.id = q.customer_id
WHERE q.source = 'voice'
ORDER BY q.created_at DESC
LIMIT 1;
```

### Test 3: Check Edge Function Logs

1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Click on `extract-quote-data`
4. Click Logs tab
5. Look for recent execution
6. Verify no errors
7. Check for log line: `[trace_id] Extract complete, saved to voice_intake`

## Verification Checklist

- [x] extract-quote-data function is complete (202 lines)
- [x] Function deployed successfully to Supabase
- [x] Function only extracts data, does not create quotes
- [x] Prompt includes customer extraction rules
- [x] Prompt includes site_address extraction rules
- [x] Prompt includes timeline_description extraction
- [x] Function saves to extraction_json
- [x] Function returns success with extracted_data
- [x] create-draft-quote reads extraction_json correctly
- [x] Project builds successfully
- [ ] New voice recording populates quote data (NEEDS USER TEST)
- [ ] Customer name appears in quote (NEEDS USER TEST)
- [ ] Location appears in quote (NEEDS USER TEST)
- [ ] Timeline appears in quote (NEEDS USER TEST)
- [ ] Line items created correctly (NEEDS USER TEST)

## Next Steps

1. User should test with a new voice recording
2. Verify all fields populate correctly
3. If still not working, check:
   - Edge function logs for errors
   - Database query results
   - Browser console for frontend errors

## Rollback Plan

If the fix doesn't work, you can check the git history:

```bash
# View recent changes
git log --oneline supabase/functions/extract-quote-data/index.ts

# See what changed
git diff HEAD~1 supabase/functions/extract-quote-data/index.ts

# Revert if needed
git checkout HEAD~1 -- supabase/functions/extract-quote-data/index.ts
```

Then redeploy the function through Supabase Dashboard.

## Summary for Claude Review

**What was broken:** The `extract-quote-data` edge function file was incomplete (only had prompt definition, no function logic).

**What I fixed:** Wrote complete function that extracts data from transcript and saves to `voice_intake.extraction_json` field.

**Key insight:** The function should NOT create quotes directly. It should only extract and save data. The `create-draft-quote` function reads that data and creates the actual quote.

**Architecture:** Two-step process:
1. `extract-quote-data` → Extract → Save to extraction_json
2. `create-draft-quote` → Read extraction_json → Create quote

**Deploy status:** Function deployed successfully, project builds without errors.

**Testing needed:** User needs to record new voice intake to verify data now populates correctly.
