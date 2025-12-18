# Review Flow Acceptance Checklist

**Purpose**: Use this checklist before deploying any changes to the voice-to-quote flow. ALL items must pass.

**Version**: 1.0
**Last Updated**: 2025-12-17

---

## Pre-Deployment Checklist

### 1. Data Integrity

- [ ] **NULL Confidence Guard**: Run Query 6 (see below). Result must be 0 records.
  ```sql
  SELECT id FROM voice_intakes
  WHERE status IN ('extracted', 'needs_user_review', 'quote_created')
    AND (extraction_json->'quality'->>'overall_confidence' IS NULL)
  ```
  **Acceptance**: 0 records. Any records = FAIL.

- [ ] **Impossible State Check**: Run Query 2. Result must be 0 records.
  ```sql
  SELECT id FROM voice_intakes
  WHERE status = 'needs_user_review' AND created_quote_id IS NOT NULL
  ```
  **Acceptance**: 0 records. Any records = FAIL.

- [ ] **Quote Integrity**: All quotes from voice intakes have line items.
  ```sql
  SELECT q.id FROM quotes q
  LEFT JOIN voice_intakes vi ON vi.created_quote_id = q.id
  LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
  WHERE vi.id IS NOT NULL
  GROUP BY q.id
  HAVING COUNT(qli.id) = 0
  ```
  **Acceptance**: 0 records. Any records = FAIL.

---

### 2. Flow Progression

- [ ] **No Stuck Reviews**: Run Query 1. Investigate any intakes older than 30 minutes.
  ```sql
  SELECT id, created_at,
         NOW() - created_at as stuck_duration,
         (extraction_json->'quality'->>'overall_confidence') as confidence
  FROM voice_intakes
  WHERE status = 'needs_user_review'
    AND created_at < NOW() - INTERVAL '30 minutes'
  ORDER BY created_at ASC
  ```
  **Acceptance**: < 5 records. Investigate each manually.

- [ ] **User Confirmed Progression**: All user-confirmed intakes must reach quote_created.
  ```sql
  SELECT id, status FROM voice_intakes
  WHERE (extraction_json->'quality'->>'user_confirmed')::boolean = true
    AND status != 'quote_created'
  ```
  **Acceptance**: 0 records. Any records = FAIL.

---

### 3. UI Fail-Safe Checks

- [ ] **Review Screen Guards**: Verify reviewquote.tsx has these guards (lines 166-183):
  - extraction_json is not null
  - extraction_json.quality is not null
  - overall_confidence is not null
  - If any fail, render error screen (not review form)

- [ ] **Confirm Button Disabled When**: Verify reviewquote.tsx line 1048:
  - saving is true OR
  - requiredMissingCount > 0 OR
  - criticalDataMissing is true OR
  - overallConfidence === null

- [ ] **No Re-Extraction After Confirmation**: Verify reviewquote.tsx lines 460-488:
  - Does NOT call extract-quote-data
  - Only marks user_confirmed = true
  - Only calls create-draft-quote

---

### 4. Backend Logic Checks

- [ ] **Extraction Always Sets Confidence**: Verify extract-quote-data/index.ts:
  - Every extraction path sets `quality.overall_confidence` to a number
  - NULL or undefined is coerced to 0.5 or throws error
  - Value is clamped to [0.0, 1.0] range

- [ ] **Create-Draft-Quote Idempotency**: Verify create-draft-quote/index.ts lines 68-132:
  - Uses row-level locking (lock_voice_intake_for_quote_creation)
  - Early exits if created_quote_id already exists
  - Returns existing quote_id, not error

- [ ] **User Confirmation Bypass**: Verify create-draft-quote/index.ts lines 233-326:
  - If user_confirmed = true, skip ALL quality guards
  - Proceed directly to quote creation
  - Never return requires_review = true after confirmation

---

### 5. Edge Case Testing

Manually test these scenarios:

- [ ] **Vague Transcript Test**
  - Record: "Paint three rooms maybe a day"
  - Expected: Low confidence, enters review
  - Verify: Can view review screen, can confirm, quote created

- [ ] **Missing Customer Test**
  - Record: "Replace 20 meters of decking"
  - Expected: Warning for missing customer, auto-proceed or review
  - Verify: Quote created with placeholder customer

- [ ] **NULL Confidence Simulation**
  - Manually set overall_confidence to null in database
  - Expected: Review screen shows error, cannot proceed
  - Verify: User sees "Cannot Load Review Data" message

- [ ] **Idempotency Test**
  - Confirm a quote, get quote_id
  - Call create-draft-quote again with same intake_id
  - Expected: Returns same quote_id, no duplicate created

- [ ] **Infinite Loop Test**
  - Confirm low confidence quote
  - Expected: Quote created, proceeds to ReviewDraft
  - Verify: Does NOT return to ReviewQuote

---

### 6. Code Review Checklist

Before merging changes to these files, verify:

**extract-quote-data/index.ts**
- [ ] No new AI prompts that change extraction logic
- [ ] No new confidence calculation that could return null
- [ ] No new status logic that bypasses user_confirmed flag
- [ ] All error paths still save extraction_json

**create-draft-quote/index.ts**
- [ ] No changes to idempotency logic (lines 68-132)
- [ ] No changes to user_confirmed bypass (lines 233-326)
- [ ] No new quality guards that could block after confirmation
- [ ] Pricing profile lookup still fails loud (lines 341-371)

**reviewquote.tsx**
- [ ] No changes to fail-closed guards (lines 166-183)
- [ ] No new confidence calculations (removed lines 377-379)
- [ ] Confirm button still checks overallConfidence !== null
- [ ] Still marks user_confirmed before calling create-draft-quote

**processing.tsx**
- [ ] Still routes to onNeedsReview when status = needs_user_review
- [ ] Still routes to onComplete when status = extracted
- [ ] No new extraction calls added

---

### 7. Database Schema Stability

- [ ] **voice_intakes table** has NOT changed:
  - extraction_json JSONB column exists
  - user_corrections_json JSONB column exists
  - created_quote_id foreign key exists
  - status enum includes all required values

- [ ] **quotes table** has NOT changed:
  - Has valid relationship to voice_intakes
  - Has valid relationship to quote_line_items

- [ ] **RPC functions** still exist and work:
  - lock_voice_intake_for_quote_creation
  - get_effective_pricing_profile
  - generate_quote_number

---

### 8. Monitoring & Alerting

Before deploying, ensure these monitors are active:

- [ ] **Alert**: >10 intakes stuck in needs_user_review for >1 hour
- [ ] **Alert**: Any intake with NULL overall_confidence created
- [ ] **Alert**: Any needs_user_review with created_quote_id NOT NULL
- [ ] **Alert**: User confirmed intake stuck (not progressing to quote_created)
- [ ] **Dashboard**: Real-time count of intakes by status
- [ ] **Dashboard**: Average time from captured to quote_created

---

### 9. Rollback Plan

Before deploying, confirm rollback procedure:

- [ ] Previous version deployment command documented
- [ ] Database migration rollback scripts tested
- [ ] Edge function rollback tested (previous versions still deployed)
- [ ] Frontend rollback tested (previous build still available)
- [ ] RPC function versions can be restored

---

### 10. User Communication

If this is a fix for existing stuck intakes:

- [ ] Script prepared to fix stuck intakes (set confidence to 0.5)
- [ ] Users notified of fix timeline
- [ ] Support team briefed on what happened
- [ ] Incident postmortem scheduled

---

## Acceptance Criteria Summary

**MUST ALL BE TRUE**:
1. ✓ 0 intakes with NULL overall_confidence
2. ✓ 0 intakes with status=needs_user_review AND created_quote_id != null
3. ✓ 0 quotes with 0 line items
4. ✓ Review screen guards present and functional
5. ✓ Confirm button disabled when confidence is null
6. ✓ No re-extraction after user confirmation
7. ✓ Idempotency protection works
8. ✓ All user_confirmed intakes reach quote_created
9. ✓ Manual tests pass for all edge cases
10. ✓ Monitoring and rollback ready

**ANY FAILURE = DO NOT DEPLOY**

---

## Fix Verification After Deployment

After deploying a fix, run this sequence within 1 hour:

1. Check no new NULL confidence records created
2. Check stuck review count is decreasing
3. Manually test voice → review → confirm → quote flow
4. Monitor error rates for 24 hours
5. Review logs for [REVIEW_FLOW] markers

**Success Criteria**:
- New intakes flow through smoothly
- Stuck count trends to 0 over 48 hours
- No new impossible states detected
- Error rate < 2% of voice intakes

---

## When to Reject a Change

Reject any PR that:
1. Modifies confidence calculation without null guards
2. Adds new quality checks after user_confirmed = true
3. Removes or bypasses fail-closed guards in review screen
4. Changes idempotency logic without extensive testing
5. Introduces new status values without updating all screens
6. Modifies extraction prompt significantly without confidence validation
7. Removes or reduces logging in critical paths
8. Does not include database migration for schema changes
9. Does not update this checklist if flow logic changes

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-12-17 | Initial checklist based on Phase A2/A3 lockdown | System |

---

## Contact

If any checklist item fails or is unclear:
1. DO NOT deploy
2. Escalate to tech lead
3. Reference MVP_QUOTE_FLOW_RULES.md for clarification
4. Add notes to this document for future clarity
