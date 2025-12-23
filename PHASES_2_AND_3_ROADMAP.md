# Phases 2 & 3 Roadmap
## Path to "Instant" Extraction Experience

**Current State**: Phase 1.1 complete - 8-12s extraction time
**Target State**: Phase 3 complete - 3-5s extraction time (feels instant)

---

## Phase 2: Remove Catalog Matching from GPT
**Goal**: Reduce GPT cognitive load and improve consistency
**Expected Impact**: 6-8s → 4-6s (33% improvement)
**Risk Level**: LOW (deterministic matching is more reliable)

### Current Problem

GPT is being asked to:
1. Extract job data from transcript
2. Normalize vague quantities and durations
3. Match materials to catalog items
4. Assign catalog_match_confidence scores
5. Calculate pricing from catalog ranges
6. Track field-level confidence for everything

This is too much cognitive load for a single prompt, especially when catalog matching can be done deterministically.

### The Fix

**Simplify GPT's Job**:
- Extract raw data only
- No catalog matching
- No confidence rules for catalog matching
- No pricing calculations from catalog

**Post-Process in Code**:
- Run SQL-based catalog matching after GPT returns
- Use `pg_trgm` similarity for fuzzy matching
- Calculate pricing from catalog deterministically
- Add catalog_item_id and match confidence in code

### Implementation Steps

#### Step 1: Simplify COMBINED_EXTRACTION_PROMPT (Lines 95-142)

**Remove These Sections**:
```
FIELD-LEVEL CONFIDENCE RULES (too detailed)
MATERIALS CATALOG MATCHING (move to post-processing)
```

**Keep These Sections**:
```
EXTRACTION RULES (vague durations, quantities, ranges, units)
MISSING FIELDS (warning vs required)
SCOPE OF WORK (breakdown into tasks)
```

**New Simplified Schema for Materials**:
```json
{
  "materials": {
    "items": [
      {
        "description": "Timber decking boards",
        "quantity": 5,
        "unit": "linear_m",
        "notes": "Need to match site color"
      }
    ]
  }
}
```

Notice:
- No `catalog_item_id` (we'll add it)
- No `catalog_match_confidence` (we'll calculate it)
- No `unit_price_cents` (we'll look it up)
- No `estimated_cost_cents` (we'll calculate it)
- Simple flat values, not wrapped objects

#### Step 2: Create SQL Catalog Matching Function

**New Supabase Function**: `match_material_to_catalog`

```sql
create or replace function match_material_to_catalog(
  p_description text,
  p_unit text,
  p_org_id uuid,
  p_region_code text,
  p_threshold float default 0.3
)
returns table (
  item_id uuid,
  item_name text,
  similarity_score float,
  typical_low_price_cents int,
  typical_high_price_cents int
)
language plpgsql
as $$
begin
  return query
  select
    id,
    name,
    similarity(name, p_description) as sim_score,
    typical_low_price_cents,
    typical_high_price_cents
  from material_catalog_items
  where
    unit = p_unit
    and (org_id = p_org_id or (org_id is null and region_code = p_region_code))
    and is_active = true
    and similarity(name, p_description) > p_threshold
  order by sim_score desc
  limit 3;
end;
$$;
```

**Prerequisites**:
```sql
-- Enable pg_trgm extension if not already enabled
create extension if not exists pg_trgm;

-- Add GIN index for fast similarity matching
create index if not exists idx_material_catalog_name_trgm
  on material_catalog_items using gin (name gin_trgm_ops);
```

#### Step 3: Post-Process Materials in Edge Function

**After GPT Returns** (around line 440):

```typescript
// New helper function to add at top of file
async function enrichMaterialsWithCatalog(
  materials: any[],
  orgId: string,
  regionCode: string,
  supabase: any
): Promise<any[]> {
  if (!materials || materials.length === 0) return [];

  const enriched = await Promise.all(materials.map(async (item) => {
    if (!item.description || !item.unit) {
      return {
        ...item,
        needs_pricing: true,
        catalog_item_id: null,
        catalog_match_confidence: 0
      };
    }

    const { data: matches } = await supabase
      .rpc('match_material_to_catalog', {
        p_description: item.description,
        p_unit: item.unit,
        p_org_id: orgId,
        p_region_code: regionCode,
        p_threshold: 0.3
      });

    if (!matches || matches.length === 0) {
      return {
        ...item,
        needs_pricing: true,
        catalog_item_id: null,
        catalog_match_confidence: 0
      };
    }

    const bestMatch = matches[0];
    const matchConfidence = bestMatch.similarity_score;

    // Auto-apply catalog pricing if confidence > 0.75
    if (matchConfidence >= 0.75 && bestMatch.typical_low_price_cents && bestMatch.typical_high_price_cents) {
      const midpointPrice = Math.round(
        (bestMatch.typical_low_price_cents + bestMatch.typical_high_price_cents) / 2
      );

      return {
        ...item,
        catalog_item_id: bestMatch.item_id,
        catalog_match_confidence: matchConfidence,
        unit_price_cents: midpointPrice,
        estimated_cost_cents: midpointPrice * item.quantity,
        needs_pricing: false
      };
    }

    // Low confidence match - include ID but flag for review
    return {
      ...item,
      catalog_item_id: bestMatch.item_id,
      catalog_match_confidence: matchConfidence,
      needs_pricing: true
    };
  }));

  return enriched;
}
```

**Usage in Main Flow**:
```typescript
// After extractedData = JSON.parse(rawContent);
if (extractedData.materials?.items) {
  extractedData.materials.items = await enrichMaterialsWithCatalog(
    extractedData.materials.items,
    (profileData as any).org_id,
    regionCode,
    supabase
  );
}
```

#### Step 4: Update Quality Checks

Remove catalog matching from assumptions/missing fields logic since it's now deterministic.

#### Step 5: Update Tests

Test with materials that should match catalog:
- "5 meters of timber decking" → should match "Timber Decking Boards"
- "2 cans of white paint" → should match "Paint - Interior White"
- "Some concrete" → vague, may not match or low confidence

### Expected Results

**Performance**:
- GPT prompt ~500 tokens (down from ~800)
- GPT processing time: 4-6s (down from 6-8s)
- Catalog matching adds ~200-400ms (SQL is fast)
- Total: 5-7s (net improvement)

**Quality**:
- More consistent catalog matching (deterministic)
- Better similarity scores (pg_trgm is proven)
- Easier to tune matching threshold
- GPT focuses on extraction only (what it's best at)

### Acceptance Criteria

- [ ] GPT duration < 6s consistently
- [ ] Total duration < 10s consistently
- [ ] Catalog match accuracy ≥ current baseline
- [ ] No regression in extraction quality
- [ ] Pricing automatically applied for high-confidence matches
- [ ] Review flow triggers for low-confidence matches

---

## Phase 3: Switch to GPT-4o-mini
**Goal**: Final push to "instant" experience
**Expected Impact**: 6s → 3s (50% improvement)
**Risk Level**: MEDIUM (model quality must be validated)

### Why Wait for Phase 3?

GPT-4o-mini is:
- 15x cheaper than GPT-4o
- 2-3x faster than GPT-4o
- Less capable than GPT-4o (especially for complex reasoning)

By doing Phase 2 first:
- GPT's job is simpler (just extraction)
- Less room for mini to mess up
- Catalog matching already handled by SQL

### Prerequisites

**Before switching**:
1. Phase 2 must be stable for 1+ week
2. No accuracy regressions
3. Catalog matching working well
4. Review flow tuned properly

### Implementation Steps

#### Step 1: Create Parallel Testing System

Don't switch production immediately. Test both models side-by-side.

**New Edge Function**: `extract-quote-data-mini` (copy of main function)

Change only this line:
```typescript
body: {
  model: "gpt-4o-mini",  // changed from "gpt-4o"
  messages: [...],
  // ... rest same
}
```

#### Step 2: Run 20-50 Test Comparisons

For each transcript:
1. Extract with gpt-4o (current)
2. Extract with gpt-4o-mini (new)
3. Compare results:
   - Field-by-field accuracy
   - Missing fields
   - Quantity accuracy
   - Duration accuracy
   - Price differences

**Acceptable Differences**:
- Slightly different wording (OK)
- Same quantities/durations (REQUIRED)
- Same materials identified (REQUIRED)

**Unacceptable Differences**:
- Missing critical fields
- Wrong quantities (off by 2x or more)
- Hallucinated materials
- Consistent underpricing

#### Step 3: Gradual Rollout

**Week 1**: 5% of traffic → mini
**Week 2**: 20% of traffic → mini (if no issues)
**Week 3**: 50% of traffic → mini (if no issues)
**Week 4**: 100% of traffic → mini (if no issues)

Use user_id hash to determine routing:
```typescript
const useMini = (hashCode(user.id) % 100) < MINI_PERCENTAGE;
const model = useMini ? "gpt-4o-mini" : "gpt-4o";
```

#### Step 4: Monitor Quality Metrics

**Red Flags**:
- Review rate increases > 10%
- Extraction errors increase > 5%
- Customer complaints about inaccurate quotes
- Consistent underpricing patterns

**Rollback Plan**:
- Switch percentage back to 0%
- Investigate differences
- Tune prompt for mini specifically
- Retry gradual rollout

### Expected Results

**Performance**:
- GPT duration: 2-3s (down from 4-6s)
- Total duration: 4-6s (including catalog matching)
- "Instant" user experience

**Cost**:
- GPT cost: $0.002/quote (down from $0.024)
- 92% cost reduction
- Can afford higher volumes

**Quality**:
- Should match gpt-4o for simple extraction
- May need prompt tuning
- Phase 2 makes this safer (simpler task)

### Acceptance Criteria

- [ ] GPT duration < 3s consistently
- [ ] Total duration < 6s consistently
- [ ] Extraction accuracy ≥ 95% of gpt-4o baseline
- [ ] Review rate not increased > 10%
- [ ] No underpricing patterns
- [ ] User feedback positive

---

## Timeline

### Phase 1.1 (Complete)
✅ SQL-filtered catalog + minimal payloads
✅ 12s → 8s improvement
✅ Ready to deploy

### Phase 2 (Next - 3-5 days)
- [ ] Day 1: Create SQL matching function + index
- [ ] Day 2: Implement enrichMaterialsWithCatalog helper
- [ ] Day 3: Simplify GPT prompt, test extraction
- [ ] Day 4: Deploy, monitor for 24 hours
- [ ] Day 5: Validate quality, tune if needed

### Phase 3 (Later - 2 weeks after Phase 2)
- [ ] Week 1: Create mini parallel testing
- [ ] Week 2: Run 20-50 test comparisons
- [ ] Week 3: 5% → 20% gradual rollout
- [ ] Week 4: 50% → 100% if metrics good

---

## Risk Mitigation

### Phase 2 Risks

**Risk**: SQL matching worse than GPT matching
**Mitigation**: Test on 50 historical transcripts before deploy
**Rollback**: Revert prompt, keep GPT doing matching

**Risk**: Post-processing adds too much latency
**Mitigation**: Batch material matching, use proper indexes
**Rollback**: Move matching back to GPT

### Phase 3 Risks

**Risk**: Mini produces lower quality extractions
**Mitigation**: Parallel testing, gradual rollout, monitoring
**Rollback**: Instant switch back to gpt-4o (just change model string)

**Risk**: Mini has different prompt requirements
**Mitigation**: A/B test prompt variations
**Rollback**: Keep gpt-4o prompt as fallback

---

## Success Metrics

### Phase 2 Success
- Total latency < 10s median
- Catalog match accuracy ≥ current
- GPT token usage < 600
- No quality regressions

### Phase 3 Success
- Total latency < 6s median
- Feels "instant" to users
- Cost per quote < $0.002
- Quality within 95% of gpt-4o

### Combined Success (1.1 + 2 + 3)
- 20-30s → 4-6s (75% improvement)
- $0.039 → $0.002 (95% cost reduction)
- Better scalability (SQL-based)
- Same or better quality

---

## Summary

**Phase 1.1**: ✅ Complete - SQL catalog filtering + minimal payloads
**Phase 2**: Next - Move catalog matching from GPT to SQL
**Phase 3**: Later - Switch to gpt-4o-mini after validation

**The Path**:
1. Deploy Phase 1.1 immediately
2. Monitor for 2-3 days
3. Implement Phase 2 (3-5 days)
4. Let Phase 2 stabilize (1-2 weeks)
5. Parallel test Phase 3 (1 week)
6. Gradual rollout Phase 3 (3 weeks)
7. Achieve "instant" extraction experience

**Total Timeline**: 6-8 weeks to production-ready instant extraction
**Total Expected Improvement**: 75% latency reduction, 95% cost reduction
