# MVP Quote Flow Rules

**Version**: 1.0
**Status**: Production MVP
**Last Updated**: 2025-12-17

## Purpose

This document defines the **immutable rules** for the voice-to-quote flow. These rules ensure tradies can always progress from voice input to confirmed quote, even with incomplete or vague information.

---

## Core Principle

**"Fail loud and safe, never silent"**

The system must:
1. Accept incomplete data as normal
2. Always allow manual progression
3. Never create infinite loops
4. Fail visibly when broken

---

## Rule 1: What Data Can Be Missing

### ALLOWED TO BE MISSING (Common)
- Customer name, email, phone
- Exact quantities ("a few", "some")
- Material prices
- Exact durations ("couple hours", "maybe a day")
- Travel time
- Site address
- Job date

### NEVER ALLOWED TO BE MISSING (Rare)
- ANY description of work to be done
- ANY labour estimate (even if vague like "a day")

**Rationale**: Tradies often start with "I need to paint three rooms" and fill in customer details later. The system must support this.

---

## Rule 2: What Triggers Review

Review is triggered when:

1. **Overall confidence < 0.7** (uncertainty threshold)
2. **Any labour hours confidence < 0.6** (pricing critical)
3. **Required fields missing** (work description, labour)
4. **Critical fields flagged by AI** (ambiguous or conflicting data)

**CRITICAL INVARIANT**: `extraction_json.quality.overall_confidence` must be a number (0.0-1.0). NULL is not allowed and causes system failure.

**Visual Indicator**: Confidence bar in review screen shows:
- Green (85%+): High confidence
- Amber (70-84%): Moderate confidence - review recommended
- Red (<70%): Low confidence - review required

---

## Rule 3: What "Confirm" Guarantees

When user clicks "Confirm & Create Quote":

### Immediate Actions (MUST happen in this order)
1. Mark `extraction_json.quality.user_confirmed = true`
2. Set `extraction_json.quality.user_confirmed_at = [timestamp]`
3. Update `status = 'extracted'`
4. Save `user_corrections_json` with any edits
5. Call `create-draft-quote` function ONCE

### Guarantees
- ✓ Quote WILL be created (or explicit error shown)
- ✓ User edits are preserved and applied
- ✓ No re-extraction occurs
- ✓ No loop back to review screen
- ✓ Confidence is irrelevant after confirmation

### Blocks (Fail Safe)
- ✗ Cannot confirm if required fields still missing
- ✗ Cannot confirm if `overall_confidence` is NULL
- ✗ Cannot confirm if critical data is missing from extraction_json

**ANTI-PATTERN**: If `create-draft-quote` returns `requires_review: true` after user confirmation, this is a CRITICAL BUG and must be blocked with explicit error message.

---

## Rule 4: When Quote MUST Exist

A quote record must exist in the database when:

1. ✓ `voice_intakes.status = 'quote_created'`
2. ✓ `voice_intakes.created_quote_id` IS NOT NULL
3. ✓ `extraction_json.quality.user_confirmed = true` (if review was required)

A quote must NOT exist when:

1. ✗ `voice_intakes.status = 'needs_user_review'`
2. ✗ `voice_intakes.status = 'captured'`
3. ✗ `voice_intakes.status = 'transcribed'`

**Idempotency Rule**: If `created_quote_id` already exists, return existing quote immediately without creating duplicate.

---

## Rule 5: Review Screen Rendering Requirements

The review screen MUST NOT render unless ALL of the following are true:

1. ✓ `extraction_json` exists and is not null
2. ✓ `extraction_json.quality` exists
3. ✓ `extraction_json.quality.overall_confidence` is a NUMBER (not null, not undefined)
4. ✓ `status = 'needs_user_review'`
5. ✓ `user_confirmed != true`

**Fail Closed**: If any condition fails, show explicit error and return to dashboard. Never render partial UI.

**Confidence Source**: ONLY read from `extraction_json.quality.overall_confidence`. Never calculate, estimate, or default to 0.

---

## Rule 6: Status Transition Rules

Valid status transitions:

```
captured → transcribed → extracted → quote_created
captured → transcribed → needs_user_review → extracted → quote_created
```

**Blocked transitions**:
- needs_user_review → needs_user_review (infinite loop)
- extracted → needs_user_review (backward flow after confirmation)
- quote_created → needs_user_review (quote already exists)

**Status Meanings**:
- `captured`: Audio recorded, not yet transcribed
- `transcribed`: Audio converted to text, not yet extracted
- `extracted`: Data extracted, high confidence, ready for quote
- `needs_user_review`: Data extracted, low confidence, needs confirmation
- `quote_created`: Quote successfully created, terminal state

---

## Rule 7: User Corrections Behavior

User corrections are stored separately and merged deterministically:

### Storage
- Corrections saved in `user_corrections_json` field
- Original `extraction_json` is NEVER modified
- Corrections are applied during quote creation, not during extraction

### Correction Types
1. **Labour overrides**: `labour_0_hours`, `labour_0_days`, `labour_0_people`
2. **Material overrides**: `material_0_quantity`
3. **Travel overrides**: `travel_hours`
4. **Confirmed assumptions**: Array of assumption field names

### Application
- Corrections boost confidence to 1.0 for edited fields
- Create-draft-quote applies corrections before calculating prices
- Audit trail preserves both original and corrected values

---

## Rule 8: Missing Data Handling

The system uses a severity-based approach:

### Severity: "warning" (Most cases)
- Field is missing but quote can still be created
- Examples: customer contact, exact quantities, exact durations
- **Action**: Show in review, allow confirmation
- **Quote Behavior**: Use placeholders, defaults, or 0 values

### Severity: "required" (Rare, blocks quote creation)
- Field is absolutely necessary for a valid quote
- Examples: NO work description at all, NO labour estimate at all
- **Action**: Show in review, block confirmation until filled
- **Quote Behavior**: Cannot proceed

**Default Assumption**: When in doubt, use "warning" not "required".

---

## Rule 9: Confidence Interpretation

Confidence values are interpreted as:

| Range | Color | Meaning | Action |
|-------|-------|---------|--------|
| 0.85 - 1.0 | Green | Explicitly stated, high certainty | Auto-proceed |
| 0.70 - 0.84 | Amber | Implied from context, moderate certainty | Review recommended |
| 0.55 - 0.69 | Amber/Red | Estimated from vague speech | Review required |
| 0.40 - 0.54 | Red | Assumed or defaulted | Review required |
| < 0.40 | Red | High uncertainty | Review required |

**Field-Level Confidence**: Every numeric value in extraction has its own confidence score. Overall confidence is an average.

**Guard Rail**: If overall confidence < 0.7, review is ALWAYS required, regardless of user confirmation flag.

---

## Rule 10: Assumptions and Audit Trail

All assumptions must be logged:

### Assumption Structure
```json
{
  "field": "labour_0_hours",
  "assumption": "Rounded 'three or four hours' to 4 hours",
  "confidence": 0.65,
  "source": "Vague duration converted to max of range"
}
```

### Required for Review
- User must see all assumptions
- User can confirm individual assumptions (boosts confidence to 1.0)
- Unconfirmed assumptions remain at original confidence

### Audit Requirements
- Original transcript preserved in `transcript_text`
- Original extraction preserved in `extraction_json`
- User corrections stored separately in `user_corrections_json`
- All timestamps recorded (created_at, transcribed_at, extracted_at, user_confirmed_at)

---

## Rule 11: Error Handling

### Loud Failures (Show to user)
- Transcription returned empty text
- Extraction API failed
- Quote creation failed
- Database constraint violation
- Pricing profile missing

### Silent Handling (Log and continue)
- Missing optional fields
- Low confidence values
- Vague quantities
- Unspecified materials

### Never Hide
- NULL confidence values (system bug)
- Infinite review loops (system bug)
- Data integrity violations (system bug)

**User Feedback**: Every error must have:
1. Clear explanation in plain English
2. Specific action user can take (retry, go back, contact support)
3. No technical jargon

---

## Summary Table

| Scenario | Data State | User Action | System Behavior |
|----------|-----------|-------------|-----------------|
| High confidence extract | Complete + confident | None needed | Auto-create quote |
| Low confidence extract | Complete + uncertain | Review + confirm | Show review, create after confirm |
| Missing optional data | Incomplete + confident | None needed | Use defaults, create quote |
| Missing required data | Incomplete + critical | Fill + confirm | Block until filled |
| User confirms low confidence | Complete + confirmed | Click confirm | Create quote (ignore low confidence) |
| NULL confidence | Invalid state | Cannot proceed | Show error, block review screen |

---

## Validation Checklist

Use this checklist to verify flow stability:

- [ ] No intakes with NULL overall_confidence
- [ ] No needs_user_review with created_quote_id != null
- [ ] No quote_created without created_quote_id
- [ ] No infinite review loops (same intake reviewed multiple times)
- [ ] All user_confirmed intakes progressed to quote_created
- [ ] All quotes have > 0 line items

**Run verification SQL**: See `OPERATORS_DEBUG_GUIDE.md` for diagnostic queries.
