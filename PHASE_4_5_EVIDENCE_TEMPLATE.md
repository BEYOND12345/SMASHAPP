# Phase 4 & 5 Evidence Collection Template

## Test Metadata
- **Test Date:** [YYYY-MM-DD HH:MM]
- **Tester:** [Your Name]
- **Environment:** [Production/Staging/Local]

---

## 1. INTAKE_ID
```
[Paste your intake ID here]
Example: 01234567-89ab-cdef-0123-456789abcdef
```

---

## 2. Frontend Console Logs
**Instructions:** Copy all lines containing `[REVIEW_FLOW]` from your browser console

```
[Paste console logs here]

Expected format:
[REVIEW_FLOW] CONFIRM_CLICKED intake_id=...
[REVIEW_FLOW] MARKED_USER_CONFIRMED intake_id=...
[REVIEW_FLOW] CALL_CREATE_DRAFT_QUOTE intake_id=...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_RESPONSE intake_id=... success=... requires_review=... quote_id=...
```

---

## 3. Edge Function Logs
**Instructions:**
1. Go to Supabase Dashboard → Edge Functions → `create-draft-quote` → Invocations
2. Find the invocation for your test
3. Copy all log entries containing `[REVIEW_FLOW]`

```
[Paste edge function logs here]

Expected format:
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_START intake_id=... user_id=...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_LOCK_ACQUIRED intake_id=...
[REVIEW_FLOW] CREATE_DRAFT_QUOTE_CREATED quote_id=... line_items_count=... total_cents=...
```

---

## 4. SQL Verification Results

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

**Result:**
```
[Paste query 1 result here]

Expected:
- status = 'quote_created'
- created_quote_id IS NOT NULL
- user_confirmed = 'true'
```

---

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

**Result:**
```
[Paste query 2 result here]

Expected:
- Exactly 1 row returned
- grand_total_cents > 0
```

---

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

**Result:**
```
[Paste query 3 result here]

Expected:
- line_item_count > 0
- total_cents > 0
```

---

## 5. Pass/Fail Verdict

### Checklist:
- [ ] Frontend logs show all 4 `[REVIEW_FLOW]` tags
- [ ] Edge function logs show all 3 `[REVIEW_FLOW]` tags
- [ ] Query 1: `status = 'quote_created'` and `user_confirmed = true`
- [ ] Query 2: Quote exists with `grand_total_cents > 0`
- [ ] Query 3: Line items exist with `total_cents > 0`
- [ ] NO review loop: `requires_review = false` in edge function response

### Final Verdict:
**[PASS / FAIL]**

### Notes:
```
[Any additional observations, issues, or comments]
```

---

## Fail Conditions

If any of these occur, mark as **FAIL**:

1. ❌ `requires_review = true` in CREATE_DRAFT_QUOTE_RESPONSE after user confirmed
2. ❌ `status != 'quote_created'` in voice_intakes table
3. ❌ `created_quote_id IS NULL` after confirmation
4. ❌ No line items created (`line_item_count = 0`)
5. ❌ Total is zero (`total_cents = 0`)
6. ❌ Missing any `[REVIEW_FLOW]` log tags
