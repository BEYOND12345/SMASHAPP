# Operators Debug Guide
**For: Support team, on-call engineers, database operators**

**Purpose**: Quickly diagnose and resolve common voice-to-quote issues reported by users.

**Version**: 1.0
**Last Updated**: 2025-12-17

---

## Quick Reference

| User Says | Most Likely Issue | Jump To |
|-----------|-------------------|---------|
| "Stuck on review screen" | NULL confidence or missing data | Section 1 |
| "Quote not created" | Review not confirmed or quote creation failed | Section 2 |
| "Wrong prices on quote" | Pricing profile issue or old rates used | Section 3 |
| "Can't see review screen" | Fail-closed guards blocking render | Section 4 |

---

## Section 1: "Stuck on Review Screen"

### Symptoms
- User says they're stuck looking at review screen
- Confirm button is greyed out or loading forever
- Screen shows error message about missing data
- Screen never loads, just shows error

### Diagnosis Steps

**Step 1: Get the intake ID**
Ask user: "What job or customer name did you record this for?"

Then run:
```sql
SELECT
  id as intake_id,
  status,
  created_at,
  (extraction_json->'job'->>'title') as job_title,
  (extraction_json->'customer'->>'name') as customer_name,
  (extraction_json->'quality'->>'overall_confidence') as confidence,
  (extraction_json->'quality'->>'requires_user_confirmation')::boolean as requires_review,
  (extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  created_quote_id
FROM voice_intakes
WHERE user_id = '[USER_ID]'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 10;
```

**Step 2: Check for NULL confidence (CRITICAL BUG)**
```sql
SELECT
  id,
  status,
  extraction_json->'quality'->>'overall_confidence' as confidence,
  extraction_json IS NOT NULL as has_extraction,
  extraction_json->'quality' IS NOT NULL as has_quality
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

**If confidence is NULL**: This is a critical bug. Proceed to Fix 1A.

**Step 3: Check for missing required fields**
```sql
SELECT
  id,
  jsonb_array_length(COALESCE(missing_fields, '[]'::jsonb)) as missing_count,
  missing_fields
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

Look for any fields with `severity: "required"`.

### Fixes

**Fix 1A: NULL Confidence (Critical)**
```sql
-- EMERGENCY FIX: Set confidence to 0.5 (uncertain) to unblock user
UPDATE voice_intakes
SET extraction_json = jsonb_set(
  extraction_json,
  '{quality,overall_confidence}',
  '0.5'::jsonb
)
WHERE id = '[INTAKE_ID]'
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL;
```

**IMPORTANT**: After this fix:
1. File incident report - this should never happen
2. Alert engineering team to fix root cause in extract-quote-data function
3. User must refresh browser to see review screen

**Fix 1B: Missing Required Fields**
```sql
-- View the exact fields missing
SELECT
  id,
  missing_fields,
  (extraction_json->'job'->>'title') as job_title,
  (extraction_json->'time'->'labour_entries') as labour
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

**Resolution**: User must provide missing information. Have them:
1. Go back to dashboard
2. Re-record or manually add data
3. System cannot proceed without required fields

**Fix 1C: Already Confirmed (Stuck in transition)**
```sql
-- Check if already confirmed but not progressed
SELECT
  id,
  status,
  (extraction_json->'quality'->>'user_confirmed')::boolean as confirmed,
  created_quote_id
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

If `confirmed = true` AND `status = 'extracted'` AND `created_quote_id IS NULL`:
- Quote creation failed silently
- Proceed to Section 2

---

## Section 2: "Quote Not Created"

### Symptoms
- User confirmed review but no quote appeared
- System seems to have accepted confirmation but nothing happened
- User ended up back at dashboard with no new quote

### Diagnosis Steps

**Step 1: Check intake status progression**
```sql
SELECT
  id,
  status,
  (extraction_json->'quality'->>'user_confirmed')::boolean as user_confirmed,
  (extraction_json->'quality'->>'user_confirmed_at') as confirmed_at,
  created_quote_id,
  created_at,
  updated_at
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

**Expected progression**:
- status starts as `needs_user_review`
- After confirm: status changes to `extracted`
- After quote creation: status changes to `quote_created` AND created_quote_id is set

**Step 2: Check if quote exists but reference is broken**
```sql
SELECT
  q.id as quote_id,
  q.quote_number,
  q.status as quote_status,
  q.created_at,
  vi.id as intake_id,
  vi.created_quote_id as intake_quote_ref
FROM quotes q
LEFT JOIN voice_intakes vi ON vi.created_quote_id = q.id
WHERE vi.id = '[INTAKE_ID]'
   OR q.created_at > (SELECT created_at FROM voice_intakes WHERE id = '[INTAKE_ID]')
ORDER BY q.created_at DESC
LIMIT 5;
```

**Step 3: Check edge function logs**
Search edge function logs for: `[REVIEW_FLOW] create-draft-quote called` with intake_id.

Look for errors immediately after.

### Fixes

**Fix 2A: Quote Created But Reference Missing**
```sql
-- Find quote created around same time
SELECT
  q.id,
  q.quote_number,
  q.created_at,
  vi.created_at as intake_created
FROM quotes q
CROSS JOIN voice_intakes vi
WHERE vi.id = '[INTAKE_ID]'
  AND q.created_at BETWEEN vi.updated_at - INTERVAL '5 minutes'
                       AND vi.updated_at + INTERVAL '5 minutes'
ORDER BY q.created_at DESC;
```

If quote exists:
```sql
-- Reconnect quote to intake
UPDATE voice_intakes
SET created_quote_id = '[QUOTE_ID]',
    status = 'quote_created'
WHERE id = '[INTAKE_ID]';
```

**Fix 2B: Quote Creation Failed**
Check logs for error. Common errors:

1. **"No pricing profile found"**
   - User needs to complete Settings → Pricing & Rates
   - Guide user to set hourly rate

2. **"Failed to create customer"**
   - Customer data validation failed
   - Check customer table constraints

3. **"Failed to create line items"**
   - Line items calculation error
   - Check extraction_json for invalid data

**Fix 2C: Retry Quote Creation Manually**
```sql
-- Verify intake is ready
SELECT
  id,
  status,
  extraction_json IS NOT NULL as has_data,
  (extraction_json->'quality'->>'user_confirmed')::boolean as confirmed,
  created_quote_id
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

If `has_data = true`, `confirmed = true`, `created_quote_id IS NULL`:
- Use API tool to call create-draft-quote with intake_id
- Or have user click confirm again (should be idempotent)

---

## Section 3: "Wrong Prices on Quote"

### Symptoms
- Quote shows $0.00 for labour
- Quote shows old hourly rate (e.g., user updated rate but quote uses old one)
- Materials have no pricing
- Totals don't match expectations

### Diagnosis Steps

**Step 1: Check pricing snapshot in intake**
```sql
SELECT
  id,
  (extraction_json->'pricing_used'->>'hourly_rate_cents')::int / 100.0 as hourly_rate_used,
  (extraction_json->'pricing_used'->>'materials_markup_percent')::numeric as markup_used,
  (extraction_json->'pricing_used'->>'timestamp') as pricing_snapshot_time
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

**Step 2: Check current user pricing profile**
```sql
SELECT
  pp.hourly_rate_cents / 100.0 as current_hourly_rate,
  pp.materials_markup_percent as current_markup,
  pp.is_active,
  pp.created_at,
  pp.updated_at
FROM user_pricing_profiles pp
JOIN voice_intakes vi ON vi.user_id = pp.user_id
WHERE vi.id = '[INTAKE_ID]'
  AND pp.is_active = true;
```

**Step 3: Check quote line items**
```sql
SELECT
  qli.description,
  qli.item_type,
  qli.quantity,
  qli.unit,
  qli.unit_price_cents / 100.0 as unit_price,
  qli.line_total_cents / 100.0 as line_total,
  qli.notes
FROM quote_line_items qli
JOIN voice_intakes vi ON vi.created_quote_id = qli.quote_id
WHERE vi.id = '[INTAKE_ID]'
ORDER BY qli.position;
```

### Fixes

**Fix 3A: Quote Uses Old Pricing (Expected Behavior)**

**IMPORTANT**: Quotes snapshot pricing at creation time. This is BY DESIGN for audit trail.

**If user wants updated pricing**:
1. Quote must be recreated (delete and regenerate)
2. Or manually edit quote line items to use new rates

```sql
-- Option 1: Delete quote and regenerate (DESTRUCTIVE)
-- Only if quote is still in draft and not sent
BEGIN;
DELETE FROM quote_line_items WHERE quote_id = '[QUOTE_ID]';
DELETE FROM quotes WHERE id = '[QUOTE_ID]';
UPDATE voice_intakes
SET created_quote_id = NULL,
    status = 'extracted'
WHERE id = '[INTAKE_ID]';
COMMIT;
-- User must then re-confirm to create new quote

-- Option 2: Update line item rates manually
UPDATE quote_line_items
SET unit_price_cents = [NEW_RATE_CENTS],
    line_total_cents = quantity * [NEW_RATE_CENTS]
WHERE quote_id = '[QUOTE_ID]'
  AND item_type = 'labour';
```

**Fix 3B: Missing Pricing Profile**
```sql
-- Check if user has active profile
SELECT
  pp.id,
  pp.hourly_rate_cents,
  pp.is_active
FROM user_pricing_profiles pp
JOIN voice_intakes vi ON vi.user_id = pp.user_id
WHERE vi.id = '[INTAKE_ID]';
```

If no results:
- User never completed onboarding/settings
- Guide user to Settings → Pricing & Rates
- Set hourly rate
- Retry quote creation

**Fix 3C: Materials Have No Pricing**
```sql
-- Find materials with unit_price_cents = 0
SELECT
  qli.id,
  qli.description,
  qli.unit_price_cents,
  qli.notes
FROM quote_line_items qli
JOIN voice_intakes vi ON vi.created_quote_id = qli.quote_id
WHERE vi.id = '[INTAKE_ID]'
  AND qli.item_type = 'materials'
  AND qli.unit_price_cents = 0;
```

**Explanation**: User didn't specify material costs in voice recording.

**Resolution**:
1. Have user manually edit quote to add prices
2. Or go to Settings → Materials Catalog to add standard prices
3. Or re-record with "using X paint at $Y per litre"

---

## Section 4: "Can't See Review Screen"

### Symptoms
- Screen shows "Cannot Load Review Data" error
- Screen shows "Critical data is missing"
- Screen immediately redirects back to dashboard
- Red error box with technical message

### Diagnosis Steps

**Step 1: Check fail-closed conditions**
```sql
SELECT
  id,
  status,
  extraction_json IS NOT NULL as has_extraction,
  extraction_json->'quality' IS NOT NULL as has_quality,
  extraction_json->'quality'->>'overall_confidence' as confidence,
  (extraction_json->'quality'->>'user_confirmed')::boolean as already_confirmed
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

Review screen will NOT render if:
- `has_extraction = false`
- `has_quality = false`
- `confidence IS NULL`
- `already_confirmed = true`
- `status != 'needs_user_review'`

**Step 2: Check browser console**
Ask user to:
1. Open browser dev tools (F12)
2. Go to Console tab
3. Look for `[REVIEW_FLOW]` errors
4. Screenshot and send

### Fixes

**Fix 4A: Missing Extraction Data (Critical Bug)**
```sql
SELECT
  id,
  status,
  transcript_text IS NOT NULL as has_transcript,
  extraction_json IS NOT NULL as has_extraction
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

If `has_transcript = true` AND `has_extraction = false`:
- Extraction never ran or failed
- Check edge function logs for extract-quote-data errors
- Manually trigger extraction:

```bash
# Call extract-quote-data edge function
curl -X POST \
  [SUPABASE_URL]/functions/v1/extract-quote-data \
  -H "Authorization: Bearer [USER_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"intake_id": "[INTAKE_ID]"}'
```

**Fix 4B: Already Confirmed (Redirect Expected)**
If `already_confirmed = true`:
- This is CORRECT behavior
- User already confirmed this intake
- System is preventing duplicate review
- Check if quote was created:

```sql
SELECT created_quote_id, status
FROM voice_intakes
WHERE id = '[INTAKE_ID]';
```

If quote exists → Guide user to find quote in dashboard
If no quote → Proceed to Section 2 (Quote Not Created)

**Fix 4C: Wrong Status**
```sql
SELECT id, status FROM voice_intakes WHERE id = '[INTAKE_ID]';
```

If status is NOT `needs_user_review`:
- System correctly skipping review
- If `status = 'extracted'` → Quote should auto-create
- If `status = 'quote_created'` → Quote already exists
- If `status = 'captured'` or `'transcribed'` → Still processing

**Resolution**: Wait for processing to complete or check for stuck state.

---

## Section 5: Common SQL Diagnostic Queries

### Query 1: Find All Intakes for User
```sql
SELECT
  id,
  status,
  created_at,
  (extraction_json->'job'->>'title') as job_title,
  (extraction_json->'customer'->>'name') as customer,
  created_quote_id,
  (extraction_json->'quality'->>'overall_confidence') as confidence
FROM voice_intakes
WHERE user_id = '[USER_ID]'
ORDER BY created_at DESC
LIMIT 20;
```

### Query 2: Check Intake Full Details
```sql
SELECT
  vi.id,
  vi.status,
  vi.created_at,
  vi.audio_duration_seconds,
  length(vi.transcript_text) as transcript_length,
  vi.extraction_json->'quality' as quality,
  vi.missing_fields,
  vi.assumptions,
  vi.created_quote_id,
  q.quote_number,
  q.status as quote_status
FROM voice_intakes vi
LEFT JOIN quotes q ON q.id = vi.created_quote_id
WHERE vi.id = '[INTAKE_ID]';
```

### Query 3: Check Quote Details
```sql
SELECT
  q.id,
  q.quote_number,
  q.status,
  q.created_at,
  c.name as customer_name,
  COUNT(qli.id) as line_item_count,
  SUM(qli.line_total_cents) / 100.0 as subtotal
FROM quotes q
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
WHERE q.id = '[QUOTE_ID]'
GROUP BY q.id, q.quote_number, q.status, q.created_at, c.name;
```

### Query 4: Find Stuck Intakes (Monitoring)
```sql
SELECT
  id,
  status,
  created_at,
  NOW() - created_at as stuck_duration,
  (extraction_json->'quality'->>'overall_confidence') as confidence,
  (extraction_json->'quality'->>'user_confirmed')::boolean as confirmed
FROM voice_intakes
WHERE status IN ('needs_user_review', 'extracted')
  AND created_at < NOW() - INTERVAL '1 hour'
  AND created_quote_id IS NULL
ORDER BY created_at ASC;
```

### Query 5: Find NULL Confidence Records (Critical Bug Detector)
```sql
SELECT
  id,
  status,
  created_at,
  user_id,
  (extraction_json->'quality'->>'overall_confidence') as confidence
FROM voice_intakes
WHERE status IN ('extracted', 'needs_user_review', 'quote_created')
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL
ORDER BY created_at DESC;
```

**If this returns ANY records**: URGENT - File P1 incident immediately.

### Query 6: Check User Pricing Profile
```sql
SELECT
  pp.id,
  pp.hourly_rate_cents / 100.0 as hourly_rate,
  pp.callout_fee_cents / 100.0 as callout_fee,
  pp.materials_markup_percent,
  pp.default_tax_rate,
  pp.default_currency,
  pp.is_active,
  pp.created_at,
  pp.updated_at,
  o.name as org_name
FROM user_pricing_profiles pp
JOIN organizations o ON o.id = pp.org_id
WHERE pp.user_id = '[USER_ID]'
  AND pp.is_active = true;
```

---

## Section 6: Emergency Procedures

### Emergency 1: Mass NULL Confidence Fix

If multiple users affected by NULL confidence bug:

```sql
-- PRODUCTION HOTFIX SCRIPT
-- Run ONLY after approval from engineering lead

BEGIN;

-- Backup affected records
CREATE TEMP TABLE affected_intakes AS
SELECT id, extraction_json
FROM voice_intakes
WHERE status IN ('extracted', 'needs_user_review')
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL;

-- Log count
SELECT COUNT(*) as affected_count FROM affected_intakes;

-- Apply fix: Set confidence to 0.5 (uncertain)
UPDATE voice_intakes
SET extraction_json = jsonb_set(
  extraction_json,
  '{quality,overall_confidence}',
  '0.5'::jsonb
)
WHERE id IN (SELECT id FROM affected_intakes);

-- Verify fix
SELECT COUNT(*) as fixed_count
FROM voice_intakes
WHERE id IN (SELECT id FROM affected_intakes)
  AND (extraction_json->'quality'->>'overall_confidence')::numeric = 0.5;

-- If verification passes, COMMIT. Otherwise ROLLBACK.
-- COMMIT;
ROLLBACK; -- Default to safe
```

### Emergency 2: Force Quote Creation

If create-draft-quote is failing but intake data looks valid:

```sql
-- 1. Verify data quality
SELECT
  id,
  status,
  extraction_json->'time'->'labour_entries' as labour,
  extraction_json->'materials'->'items' as materials,
  (extraction_json->'quality'->>'overall_confidence') as confidence
FROM voice_intakes
WHERE id = '[INTAKE_ID]';

-- 2. If data looks good, reset for retry
UPDATE voice_intakes
SET status = 'extracted',
    created_quote_id = NULL
WHERE id = '[INTAKE_ID]';

-- 3. Have user retry quote creation from UI
-- OR call edge function directly via API tool
```

### Emergency 3: Delete and Restart

**LAST RESORT ONLY** - If intake is completely corrupted:

```sql
-- Confirm with user first - this deletes their recording
BEGIN;

-- Backup
CREATE TEMP TABLE backup_intake AS
SELECT * FROM voice_intakes WHERE id = '[INTAKE_ID]';

-- Delete (will cascade to related records)
DELETE FROM voice_intakes WHERE id = '[INTAKE_ID]';

-- User must re-record job
COMMIT;
```

---

## Section 7: Escalation Guide

### When to Escalate to Engineering

Escalate immediately if:
1. NULL confidence bug detected (Query 5 returns results)
2. Multiple users stuck with same error message
3. Impossible state detected (needs_user_review + created_quote_id)
4. Edge function repeatedly failing (>10% error rate)
5. Database constraint violations appearing in logs
6. Any data loss or corruption suspected

### What to Include in Escalation

1. **User Impact**
   - How many users affected
   - How long they've been blocked
   - Business criticality (e.g., customer waiting for quote)

2. **Technical Details**
   - Intake ID(s) affected
   - SQL query results showing issue
   - Edge function log snippets with [REVIEW_FLOW] markers
   - Screenshots of error messages
   - Timestamps of when issue started

3. **Attempted Fixes**
   - What you've tried
   - Results of each attempt
   - Any temporary workarounds applied

4. **Data Integrity Check**
   - Run all 6 diagnostic queries from Section 5
   - Attach results to escalation ticket

### Escalation Template

```
TITLE: [Voice-to-Quote] [Issue Type] - [User Count] Users Affected

SEVERITY: [P0/P1/P2]

SUMMARY:
[Brief description of what users are experiencing]

AFFECTED USERS:
- User ID: [USER_ID]
- Intake ID: [INTAKE_ID]
- Count: [NUMBER]

DIAGNOSIS:
- Query 5 (NULL Confidence): [RESULT]
- Query 4 (Stuck Intakes): [RESULT]
- Status distribution: [DATA]

ATTEMPTED FIXES:
1. [Fix attempted]
2. [Result]

LOGS:
[Paste relevant edge function logs with timestamps]

BUSINESS IMPACT:
[Immediate impact and urgency]

REF: See OPERATORS_DEBUG_GUIDE.md Section 7
```

---

## Section 8: Monitoring Dashboard Queries

For real-time monitoring dashboard:

**Active Intakes by Status**
```sql
SELECT status, COUNT(*) as count
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY count DESC;
```

**Intakes Stuck >30min**
```sql
SELECT COUNT(*) as stuck_count
FROM voice_intakes
WHERE status IN ('needs_user_review', 'extracted')
  AND created_at < NOW() - INTERVAL '30 minutes'
  AND created_quote_id IS NULL;
```

**NULL Confidence Count (Should be 0)**
```sql
SELECT COUNT(*) as null_confidence_count
FROM voice_intakes
WHERE status IN ('extracted', 'needs_user_review')
  AND (extraction_json->'quality'->>'overall_confidence') IS NULL;
```

**Average Flow Duration**
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 as avg_minutes
FROM voice_intakes
WHERE status = 'quote_created'
  AND created_at > NOW() - INTERVAL '7 days';
```

**Success Rate (Last 24h)**
```sql
SELECT
  COUNT(CASE WHEN status = 'quote_created' THEN 1 END) * 100.0 / COUNT(*) as success_rate_percent
FROM voice_intakes
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND status IN ('quote_created', 'needs_user_review', 'extracted');
```

---

## Appendix: Common Error Messages

| Error Message | Meaning | Fix Section |
|---------------|---------|-------------|
| "Cannot Load Review Data" | Fail-closed guard triggered | Section 4 |
| "CRITICAL: overall_confidence is missing" | NULL confidence bug | Section 1, Fix 1A |
| "Cannot confirm - critical data is missing" | Required fields not filled | Section 1, Fix 1B |
| "No pricing profile found" | User hasn't set rates | Section 3, Fix 3B |
| "Failed to create quote" | Quote creation error | Section 2 |
| "Intake not found or access denied" | Invalid intake ID or permissions | Check user_id match |
| "Review loop detected" | System bug - infinite loop | Escalate to Engineering |
| "Quote already created from this voice intake" | Idempotent replay (expected) | Normal - quote exists |

---

## Contact & Support

- **On-Call Engineering**: [Contact method]
- **Database Admin**: [Contact method]
- **Product Team**: [Contact method]
- **Incident Channel**: [Slack/Teams channel]

**Documentation Updates**: If you discover a new issue type or fix, add it to this guide and submit a PR.
