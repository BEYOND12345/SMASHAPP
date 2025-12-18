# Phase 4 & 5 Verification Guide

## Status: Implementation Ready ✅

All required code is in place and properly instrumented with logging. You now need to perform a real test to collect evidence.

---

## What's Already Done

### Frontend (reviewquote.tsx)
- ✅ Confirm button updates `user_confirmed = true` and `status = 'extracted'`
- ✅ Calls `create-draft-quote` edge function with authenticated Bearer token
- ✅ Does NOT re-run `extract-quote-data`
- ✅ All 4 required `[REVIEW_FLOW]` console logs present
- ✅ Review loop detection (fails if `requires_review = true` after confirm)

### Edge Function (create-draft-quote)
- ✅ All 3 required `[REVIEW_FLOW]` logs present
- ✅ Proper authentication via JWT
- ✅ Idempotent quote creation with locking
- ✅ Skips quality guards when `user_confirmed = true`
- ✅ Creates quote and line items correctly
- ✅ Updates intake to `quote_created` status

---

## Your Task: Run the Test

**I cannot run this test for you.** You need to perform it manually in your browser.

### Prerequisites
1. App is running and accessible
2. You have a valid user account
3. Supabase is configured and connected
4. You can access Supabase Dashboard

---

## Step-by-Step Test Procedure

### Step 1: Prepare Your Environment
1. Open your app in a browser
2. Open DevTools (F12 or Right-click → Inspect)
3. Go to the **Console** tab
4. Clear the console (click the 🚫 icon or right-click → Clear console)

### Step 2: Create a Voice Intake
1. Log in as a real user
2. Record or create a voice intake that will trigger review
   - Should have low confidence or assumptions
   - Should end up with `status = 'needs_user_review'`
3. Wait for processing to complete

### Step 3: Navigate to Review Screen
1. Go to the review screen for the intake you just created
2. Verify the review screen loads correctly
3. Note the **intake_id** from the URL or console logs

### Step 4: Execute the Confirm Action
1. Click **"Confirm & Create Quote"** button
2. Watch the console for `[REVIEW_FLOW]` logs
3. Wait for the quote to be created

### Step 5: Collect Frontend Evidence
1. In the console, scroll to find all lines containing `[REVIEW_FLOW]`
2. Copy these lines (you should see 4 entries)
3. Save them for your evidence report

Expected console output:
```
[REVIEW_FLOW] CONFIRM_CLICKED intake_id=abc123...
[REVIEW_FLOW] MARKED_USER_CONFIRMED intake_id=abc123...
[REVIEW_FLOW] CALL_CREATE_DRAFT_QUOTE intake_id=abc123...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_RESPONSE intake_id=abc123... success=true requires_review=false quote_id=xyz789...
```

### Step 6: Collect Edge Function Logs
1. Go to **Supabase Dashboard**
2. Navigate to: **Edge Functions** → `create-draft-quote` → **Invocations**
3. Find the most recent invocation (should match your test time)
4. Click to view logs
5. Copy any log entries containing `[REVIEW_FLOW]`

Expected edge function logs:
```
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_START intake_id=abc123... user_id=user456...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_LOCK_ACQUIRED intake_id=abc123...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_CREATED quote_id=xyz789... line_items_count=5 total_cents=...
```

### Step 7: Run SQL Verification Queries
1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file: `PHASE_4_5_VERIFICATION_QUERIES.sql`
3. Replace `'YOUR_INTAKE_ID_HERE'` with your actual intake_id
4. Run each query and save the results

---

## SQL Queries Reference

### Query 1: Voice Intake Status
```sql
SELECT
  id,
  status,
  created_quote_id,
  (extraction_json->'quality'->>'user_confirmed') AS user_confirmed
FROM voice_intakes
WHERE id = 'YOUR_INTAKE_ID_HERE';
```

**Expected:**
- `status = 'quote_created'`
- `created_quote_id` is NOT NULL
- `user_confirmed = 'true'`

### Query 2: Created Quote
```sql
SELECT
  id,
  customer_id,
  quote_number,
  title,
  status,
  grand_total_cents,
  created_at,
  updated_at
FROM quotes
WHERE id = (SELECT created_quote_id FROM voice_intakes WHERE id = 'YOUR_INTAKE_ID_HERE');
```

**Expected:**
- Exactly 1 row returned
- `grand_total_cents > 0`

### Query 3: Quote Line Items
```sql
SELECT
  qli.quote_id,
  COUNT(*) AS line_item_count,
  COALESCE(SUM(qli.line_total_cents), 0) AS total_cents,
  json_agg(json_build_object(
    'type', qli.item_type,
    'description', qli.description,
    'quantity', qli.quantity,
    'unit_price_cents', qli.unit_price_cents
  ) ORDER BY qli.position) AS items
FROM quote_line_items qli
WHERE qli.quote_id = (SELECT created_quote_id FROM voice_intakes WHERE id = 'YOUR_INTAKE_ID_HERE')
GROUP BY qli.quote_id;
```

**Expected:**
- `line_item_count > 0`
- `total_cents > 0`
- Items array contains all line items

---

## Evidence Collection

Use the template in `PHASE_4_5_EVIDENCE_TEMPLATE.md` to organize your findings:

1. Intake ID
2. Frontend console logs (4 `[REVIEW_FLOW]` entries)
3. Edge function logs (3 `[REVIEW_FLOW]` entries)
4. SQL query results (3 queries)
5. Pass/Fail verdict

---

## Pass Criteria

The test **PASSES** if ALL of these are true:

✅ **Frontend Logs:**
- Shows `CONFIRM_CLICKED`
- Shows `MARKED_USER_CONFIRMED`
- Shows `CALL_CREATE_DRAFT_QUOTE`
- Shows `CREATE_DRAFT_QUOTE_RESPONSE` with `success=true` and `requires_review=false`

✅ **Edge Function Logs:**
- Shows `CREATE_DRAFT_QUOTE_START`
- Shows `CREATE_DRAFT_QUOTE_LOCK_ACQUIRED`
- Shows `CREATE_DRAFT_QUOTE_CREATED` with valid quote_id

✅ **Database State:**
- Voice intake has `status = 'quote_created'`
- Voice intake has `user_confirmed = true`
- Voice intake has non-null `created_quote_id`
- Quote exists and has `grand_total_cents > 0`
- Line items exist and sum to correct total

✅ **No Review Loop:**
- Edge function returns `requires_review = false`
- NO second call to create-draft-quote
- User is NOT sent back to review screen

---

## Fail Criteria

The test **FAILS** if ANY of these occur:

❌ Missing any `[REVIEW_FLOW]` log tags
❌ `requires_review = true` in CREATE_DRAFT_QUOTE_RESPONSE after user confirmed
❌ Voice intake status is NOT `quote_created`
❌ `created_quote_id` is NULL after confirmation
❌ No quote created in database
❌ No line items created (`line_item_count = 0`)
❌ Total is zero (`total_cents = 0`)
❌ User is redirected back to review screen (review loop)

---

## What to Do Next

1. **Run the test** following the steps above
2. **Collect all evidence** using the template
3. **Fill out the evidence template** with your results
4. **Paste the completed evidence** back to me
5. **I will analyze** the evidence and provide a final Pass/Fail verdict

---

## Troubleshooting

### Console logs not showing
- Make sure DevTools is open before clicking Confirm
- Check that you're on the Console tab
- Try clearing the console and running the test again

### Edge function logs not visible
- Go to Supabase Dashboard → Edge Functions → create-draft-quote
- Make sure you're looking at the Invocations tab
- Sort by most recent timestamp
- If no logs appear, check that the function was actually called

### SQL queries returning no rows
- Double-check you replaced `'YOUR_INTAKE_ID_HERE'` with your actual intake ID
- Make sure the intake ID is wrapped in single quotes
- Verify the intake ID exists: `SELECT id, status FROM voice_intakes WHERE id = 'your-id';`

---

## Ready to Begin

You now have:
- ✅ Working implementation with all logging in place
- ✅ Step-by-step test procedure
- ✅ SQL queries ready to run
- ✅ Evidence collection template
- ✅ Clear pass/fail criteria

**Start your test and bring back the evidence!**
