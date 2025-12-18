# Step 2: Profile-Aware Voice-to-Quote Implementation

**Status:** COMPLETE
**Date:** 2025-12-16
**Critical Rule:** Every voice draft MUST call `get_effective_pricing_profile` at runtime. No client-supplied pricing. No cached pricing.

---

## Executive Summary

Step 2 enforces profile-aware quote drafting from voice intakes. The system now:
- Always fetches pricing from `get_effective_pricing_profile` RPC at runtime in Edge Functions
- Fails hard if pricing profile is missing or invalid
- Applies materials markup correctly
- Stores pricing snapshot for audit trail
- Returns pricing details in response for UI visibility

**Key Fix:** Materials markup was NOT being applied in the original implementation. Now fixed with proper calculation and audit trail in notes.

---

## Implementation Details

### 1. Enhanced `get_effective_pricing_profile` Function

**File:** `supabase/migrations/enforce_single_active_pricing_profile.sql`

**Guard Rails Added:**
- Checks for multiple active profiles per user (data integrity violation)
- Fails if zero active profiles found
- Validates `hourly_rate_cents` is not null and > 0
- Validates organization exists

**Failure Behavior:**
```sql
-- Multiple active profiles
RAISE EXCEPTION 'Data integrity violation: User % has % active pricing profiles. Expected exactly 1.'

-- Invalid hourly rate
RAISE EXCEPTION 'Invalid pricing profile: hourly_rate_cents is % for user %'
```

### 2. Updated `create-draft-quote` Edge Function

**File:** `supabase/functions/create-draft-quote/index.ts`

**Critical Changes:**

#### A. Runtime Profile Fetching (Lines 82-98)
```typescript
// CRITICAL: Get pricing profile at runtime - NEVER use cached pricing
const { data: profileData, error: profileError } = await supabase
  .rpc("get_effective_pricing_profile", { p_user_id: user.id });

// GUARD RAIL: Fail hard if hourly_rate_cents is missing
if (!profile.hourly_rate_cents || profile.hourly_rate_cents <= 0) {
  throw new Error(`Invalid hourly rate: ${profile.hourly_rate_cents}. Cannot create quote.`);
}
```

#### B. Pricing Snapshot Storage (Lines 101-115)
```typescript
const pricingSnapshot = {
  profile_id: profile.profile_id,
  timestamp: new Date().toISOString(),
  hourly_rate_cents: profile.hourly_rate_cents,
  callout_fee_cents: profile.callout_fee_cents,
  travel_rate_cents: profile.travel_rate_cents,
  travel_is_time: profile.travel_is_time,
  materials_markup_percent: profile.materials_markup_percent,
  default_tax_rate: profile.default_tax_rate,
  currency: profile.default_currency,
  bunnings_run_enabled: profile.bunnings_run_enabled,
  bunnings_run_minutes_default: profile.bunnings_run_minutes_default,
  workday_hours_default: profile.workday_hours_default,
  org_tax_inclusive: profile.org_tax_inclusive,
};
```

#### C. Labor Items (Lines 215-245)
- Uses `profile.hourly_rate_cents` for all labor calculations
- Converts days to hours using `profile.workday_hours_default`
- Calculates `line_total_cents = ROUND(hours × hourly_rate_cents)`
- Adds warning when days are converted

#### D. Materials Markup - THE BIG FIX (Lines 247-300)
**Before:** Used `material.unit_price_cents` directly without markup
**After:** Applies `profile.materials_markup_percent` correctly

```typescript
if (material.unit_price_cents && material.unit_price_cents > 0) {
  const basePrice = material.unit_price_cents;
  const markupMultiplier = 1 + (profile.materials_markup_percent / 100);
  unitPriceCents = Math.round(basePrice * markupMultiplier);

  const markupText = `Base: $${(basePrice / 100).toFixed(2)}, Markup: ${profile.materials_markup_percent}%`;
  notes = notes ? `${markupText} - ${notes}` : markupText;
}
```

Audit trail in notes shows:
- Base price
- Markup percentage applied
- Calculation is transparent and verifiable

#### E. Travel Charging (Lines 302-356)
Respects `profile.travel_is_time` flag:
- If `true`: Charges as labour hours × (travel_rate_cents OR hourly_rate_cents)
- If `false`: Charges as fixed fee using travel_rate_cents
- Defaults to 0.5 hours if time not specified (with warning)

#### F. Bunnings Run (Lines 358-381)
- Only adds if `profile.bunnings_run_enabled` is true
- Uses `profile.bunnings_run_minutes_default` unless explicitly provided
- Charges at `profile.hourly_rate_cents`

#### G. Snapshot Storage in Voice Intakes (Lines 413-431)
```typescript
const updatedExtractionJson = {
  ...extracted,
  pricing_used: pricingSnapshot,
};

await supabase
  .from("voice_intakes")
  .update({
    extraction_json: updatedExtractionJson,
  })
  .eq("id", intake_id);
```

#### H. Response with Pricing Visibility (Lines 433-455)
```typescript
pricing_used: {
  hourly_rate: `$${(profile.hourly_rate_cents / 100).toFixed(2)}`,
  materials_markup: `${profile.materials_markup_percent}%`,
  tax_rate: `${profile.default_tax_rate}%`,
  currency: profile.default_currency,
  travel_rate: profile.travel_rate_cents
    ? `$${(profile.travel_rate_cents / 100).toFixed(2)}`
    : 'Same as hourly',
  travel_is_time: profile.travel_is_time,
}
```

UI can display: "Using hourly rate $120.00, Materials markup 15%, Tax 10%"

---

## Validation & Evidence

### SQL Evidence Queries

**File:** `STEP_2_EVIDENCE_QUERIES.sql`

Nine comprehensive queries to validate:

1. **Voice Draft Uses Profile Pricing** - Shows intake → profile → quote → line items chain
2. **Labour Line Total Math** - Proves hours × hourly_rate_cents = line_total_cents
3. **Materials Markup Applied** - Shows markup calculation in notes
4. **Pricing Snapshot Stored** - Verifies extraction_json.pricing_used exists
5. **Profile Change Timeline** - Shows profile updates and subsequent quotes
6. **Multiple Active Profiles** - Identifies violations (should return 0 rows)
7. **Missing Hourly Rate** - Identifies invalid profiles (should return 0 rows)
8. **End-to-End Audit Trail** - Complete trace for single intake
9. **Materials Markup Calculation Proof** - Extracts and verifies markup math from notes

### Test Scenarios

#### Scenario 1: Standard Quote with Labor
```
Voice: "Quote for painting bedroom, 2 days work"
Profile: hourly_rate_cents = 12000, workday_hours_default = 8
Expected: Labor item with 16 hours × $120.00 = $1,920.00
Evidence: Query #2
```

#### Scenario 2: Materials with Markup
```
Voice: "Need paint for $200"
Profile: materials_markup_percent = 15
Expected: Materials item at $230.00 with notes "Base: $200.00, Markup: 15%"
Evidence: Queries #3 and #9
```

#### Scenario 3: Bunnings Run
```
Voice: "Need to pick up supplies"
Profile: bunnings_run_enabled = true, bunnings_run_minutes_default = 60, hourly_rate_cents = 12000
Expected: Labor item "Materials Run" with 1 hour × $120.00 = $120.00
Evidence: Query #1
```

#### Scenario 4: Travel as Time
```
Voice: "30 minutes travel each way"
Profile: travel_is_time = true, travel_rate_cents = null, hourly_rate_cents = 12000
Expected: Labor item "Travel Time" with 1 hour × $120.00 = $120.00
Evidence: Query #2
```

#### Scenario 5: Profile Change
```
Action: Update user profile hourly_rate_cents from 12000 to 15000
Next Voice: "Quote for fence repair, 3 hours"
Expected: New quote uses $150.00/hour, old quotes remain at $120.00
Evidence: Query #5
```

#### Scenario 6: Missing Pricing (Fail Hard)
```
Action: Set hourly_rate_cents to NULL or 0
Next Voice: Any quote attempt
Expected: Error "Invalid hourly rate: null. Cannot create quote."
Evidence: Function logs, Query #7
```

#### Scenario 7: Multiple Active Profiles (Fail Hard)
```
Action: Somehow create second active profile for user
Next Voice: Any quote attempt
Expected: Error "Data integrity violation: User has 2 active pricing profiles."
Evidence: Query #6 (unique index prevents this)
```

---

## Critical Invariants - NEVER BREAK

1. **No Client Pricing** - Edge Function MUST call `get_effective_pricing_profile`, never accept pricing from client
2. **Fail Safe** - If pricing invalid, STOP. Never create quote with wrong/missing pricing
3. **Audit Trail** - Every quote MUST have `extraction_json.pricing_used` snapshot
4. **Markup Applied** - Materials MUST have markup applied and documented in notes
5. **Math Correct** - `line_total_cents = ROUND(quantity × unit_price_cents)` for every line item
6. **One Active Profile** - User can have only one `is_active = true` profile (enforced by unique index)
7. **Profile Immutability** - Once quote created, its pricing snapshot is frozen (historical record)

---

## Validation Questions for Testing

Ask these questions after deployment to verify implementation:

### Question 1: Runtime Profile Fetching
**Q:** "Show me evidence that voice draft calls `get_effective_pricing_profile` inside the Edge Function at runtime, and that the drafted labour line item total equals hours times hourly_rate_cents, with the pricing_used snapshot stored in voice_intakes."

**Answer with:**
```sql
-- Run Evidence Query #2 and show:
-- 1. Edge function code lines 82-98 (RPC call)
-- 2. Edge function code lines 229 (math calculation)
-- 3. Edge function code lines 413-431 (snapshot storage)
-- 4. Query results showing math_correct = true and matches_snapshot = true
```

### Question 2: Materials Markup
**Q:** "Prove that materials markup is applied. Show me a material line item where the unit_price_cents includes the markup percentage from the profile, and the calculation is documented in notes."

**Answer with:**
```sql
-- Run Evidence Query #9
-- Show line item with notes like "Base: $50.00, Markup: 15%" and unit_price_cents = 5750
```

### Question 3: Profile Change Impact
**Q:** "If I update my hourly rate today, will my old quotes change? Will new quotes use the new rate?"

**Answer with:**
```sql
-- Run Evidence Query #5 before and after profile update
-- Demonstrate:
-- 1. Old quotes retain original pricing (frozen in extraction_json.pricing_used)
-- 2. New quotes use updated profile pricing
-- 3. Timeline shows profile update followed by quote creation with new rate
```

### Question 4: Fail-Safe Behavior
**Q:** "What happens if my pricing profile is corrupted or missing?"

**Answer:**
```
The system fails immediately with a clear error message:
- "No pricing profile found - cannot create quote"
- "Invalid hourly rate: 0. Cannot create quote."
- "Data integrity violation: User has 2 active pricing profiles."

No quote is created. The voice intake status remains at previous step.
User must fix their profile before proceeding.
```

### Question 5: Audit Trail
**Q:** "Can I see exactly what pricing was used when a quote was drafted 6 months ago?"

**Answer with:**
```sql
-- Run Evidence Query #8 with specific intake_id
-- Shows complete snapshot including all pricing fields at time of draft
```

---

## Files Modified

1. `supabase/migrations/enforce_single_active_pricing_profile.sql` - NEW
2. `supabase/functions/create-draft-quote/index.ts` - UPDATED (470 lines, complete rewrite)
3. `STEP_2_EVIDENCE_QUERIES.sql` - NEW (9 validation queries)
4. `STEP_2_IMPLEMENTATION_REPORT.md` - NEW (this file)

---

## Next Steps

### For Development
1. Deploy Edge Function: `create-draft-quote` (already updated in codebase)
2. Apply migration: `enforce_single_active_pricing_profile.sql`
3. Test with Evidence Queries 1-9
4. Verify all test scenarios pass

### For UI Integration
Update voice recording flow to display pricing visibility:
```javascript
// After draft quote response
const response = await createDraftQuote(intakeId);
if (response.success) {
  showToast(`Quote drafted using ${response.pricing_used.hourly_rate}/hour,
             ${response.pricing_used.materials_markup} markup`);
}
```

### For Production Monitoring
Add logging/monitoring for:
- Profile fetching failures
- Invalid hourly rate errors
- Multiple active profile violations
- Materials markup calculations

---

## Build Verification

```
npm run build
✓ built in 5.80s
```

All TypeScript compilation successful. No errors.

---

## Conclusion

Step 2 is complete. The voice-to-quote pipeline now:
- Guarantees profile-aware pricing at runtime
- Applies materials markup correctly (the bug is fixed)
- Stores complete audit trail
- Fails safely when data is invalid
- Provides transparency to users

**Critical Achievement:** Materials markup bug identified and fixed. System now applies markup percent consistently and documents calculation in line item notes for full transparency.
