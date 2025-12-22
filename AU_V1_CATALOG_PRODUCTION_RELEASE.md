# AU V1 Materials Catalog - Production Release Report

**Release Date**: 2025-12-22
**Status**: LOCKED FOR PRODUCTION
**Region**: Australia (AU)
**Version**: V1

---

## Executive Summary

The AU V1 Materials Catalog has been successfully imported and validated for production use. All 35 materials passed comprehensive validation checks and are now available for the quoting application.

**Key Metrics**:
- **Total Materials**: 35
- **Core Materials**: 27 (77%)
- **Trade Groups**: 6 (Painting, Carpentry, Handyman, Decking, Electrical, Plumbing)
- **Validation Status**: ALL CHECKS PASSED ✓

---

## Import Validation Results

### Critical Validation Checks

| Check | Status | Detail |
|-------|--------|--------|
| Row Count | ✓ PASS | 35 of 35 |
| No 'Other' Category | ✓ PASS | 0 rows with category=other |
| Valid Price Ranges | ✓ PASS | 0 rows with low > high |
| No Unit Price Set | ✓ PASS | 0 rows with unit_price_cents |
| All Active | ✓ PASS | 35 active, 0 inactive |
| All Global Catalog | ✓ PASS | 35 global, 0 org-specific |
| GST Mode Correct | ✓ PASS | 35 correct, 0 incorrect |
| No Duplicates | ✓ PASS | 0 duplicate names |
| Lowercase Aliases | ✓ PASS | 0 rows with uppercase aliases |
| Australian Terms | ✓ PASS | gyprock, 90x45, chippy screws, h3 all present |

---

## Catalog Coverage by Trade

| Trade Group | Category Group | Category | Materials | Core | Price Range |
|-------------|----------------|----------|-----------|------|-------------|
| Painting | Paint | paint | 6 | 3 | $4.00 - $28.00 |
| Painting | Prep | supplies | 11 | 7 | $0.60 - $32.00 |
| Painting | Hardware | supplies | 4 | 4 | $2.50 - $22.00 |
| Carpentry | Timber | timber | 4 | 3 | $5.70 - $45.00 |
| Carpentry | Sheet | building_materials | 2 | 2 | $12.65 - $30.00 |
| Carpentry | Lining | drywall | 1 | 1 | $7.80 - $14.00 |
| Handyman | Fixings | fasteners | 2 | 2 | $6.00 - $18.00 |
| Handyman | Adhesives | adhesives | 1 | 1 | $8.00 - $20.00 |
| Decking | Fixings | fasteners | 1 | 1 | $15.00 - $25.00 |
| Decking | Concrete | building_materials | 1 | 1 | $6.00 - $12.00 |
| Electrical | Electrical | electrical | 1 | 1 | $1.80 - $4.50 |
| Plumbing | Plumbing | plumbing | 1 | 1 | $6.88 - $12.00 |

---

## Pricing Behavior Confirmation

### Midpoint Pricing Examples

| Material | Unit | Low | High | Midpoint | Status |
|----------|------|-----|------|----------|--------|
| Pine framing timber 90x45 | linear_metre | $5.85 | $10.00 | **$7.93** | ✓ |
| Plasterboard gyprock 10mm | square_metre | $7.80 | $14.00 | **$10.90** | ✓ |
| Interior wall paint | litre | $5.00 | $26.00 | **$15.50** | ✓ |
| Chipboard screws 50mm | pack | $8.00 | $18.00 | **$13.00** | ✓ |
| PVC pipe 100mm DWV | linear_metre | $6.88 | $12.00 | **$9.44** | ✓ |

### Tier 2 Fallback Coverage

The catalog provides comprehensive category-unit combinations for fallback pricing:

- **13 category-unit pairs** available for median calculations
- All common combinations covered (timber/linear_metre, paint/litre, fasteners/pack, etc.)
- Zero dollar materials CANNOT OCCUR due to fallback protection

---

## Australian Search Aliases Verification

### Critical Australian Terms Confirmed

| Term | Present | Materials |
|------|---------|-----------|
| gyprock | ✓ | Plasterboard gyprock 10mm |
| 90x45 | ✓ | Pine framing timber 90x45, Treated pine H3 90x45 |
| chippy screws | ✓ | Chipboard screws 50mm |
| h3 | ✓ | Treated pine H3 90x45, Treated pine H3 70x45 |
| metho | ✓ | (in aliases for future materials) |
| dar | ✓ | (in aliases for future materials) |

### Sample Alias Coverage

- **Timber**: "90x45, ninety by forty five, framing timber, stud, two by four, 2x4"
- **Plasterboard**: "gyprock, plasterboard, drywall, rock"
- **Screws**: "chipboard screws, chippy screws, 50mm screws"
- **Paint**: "wall paint, interior paint, paint walls, acrylic paint, house paint, room paint"

---

## UI Behavior Confirmation

### Price Badge System

Every material line item will display one of these badges:

1. **Price guide** - When `catalog_item_id` is set and midpoint pricing is used
2. **Estimated** - When Tier 2 fallback pricing is applied (no confident match)
3. **Needs price** - Only if manually forced by user

### Material Swapping Flow

1. User opens "Change Material" in review screen
2. Catalog browser displays:
   - Material name
   - Category group
   - Unit
   - Midpoint price (calculated from low/high range)
3. User selects new material
4. System updates:
   - `catalog_item_id` → new material ID
   - `unit` → new material unit
   - `unit_price_cents` → new midpoint price
   - `quantity` → PRESERVED
   - Note added: "From catalog – user selected"

---

## Data Governance Rules

### Production Lock Status

**The AU V1 catalog is now LOCKED for production use.**

- **No in-place edits** without versioning
- **Future updates** must be delivered via:
  - New migration file (e.g., `update_au_v1_pricing_batch_2.sql`)
  - Version increment (e.g., AU V2)
- **Historical quotes** will NOT be recalculated when catalog changes
- **Pricing snapshots** are persisted to quote line items at creation time

### Field Immutability

| Field | Status | Notes |
|-------|--------|-------|
| org_id | NULL | All materials are global (region-wide) |
| region_code | AU | Locked for this version |
| unit_price_cents | NULL | MUST remain NULL in catalog |
| supplier_name | NULL | MUST remain NULL (no supplier references) |
| gst_mode | ex_gst | All prices exclude GST |
| is_active | true | All materials active |

---

## Sample Materials by Category

### Painting (21 materials)
- Interior wall paint ($5.00-$26.00/L)
- Exterior wall paint ($18.00-$27.00/L)
- Ceiling paint ($7.00-$23.00/L)
- Primer sealer undercoat ($12.00-$24.00/L)
- Paint brushes, rollers, masking tape

### Carpentry (7 materials)
- Pine framing timber 90x45 ($5.85-$10.00/LM)
- Treated pine H3 90x45 ($8.00-$12.00/LM)
- Plasterboard gyprock 10mm ($7.80-$14.00/SQM)
- MDF board 18mm ($15.00-$30.00/SQM)

### Fasteners & Hardware (3 materials)
- Chipboard screws 50mm ($8.00-$18.00/pack)
- Decking screws 50mm ($15.00-$25.00/pack)

### Specialty (4 materials)
- Electrical cable 2.5mm TPS ($1.80-$4.50/LM)
- PVC pipe 100mm DWV ($6.88-$12.00/LM)
- PVA wood glue ($8.00-$20.00/L)
- Concrete mix 20kg ($6.00-$12.00/bag)

---

## System Integration Points

### Quote Creation Flow

1. Voice intake transcribed
2. Extract-quote-data function identifies materials
3. System attempts catalog matching:
   - Match by name/alias → Set `catalog_item_id`
   - Calculate midpoint price → Set `unit_price_cents`
   - Apply organization markup
4. If no confident match:
   - Apply Tier 2 fallback (category-unit median)
   - Set `needs_pricing = false`
   - Add note: "Estimated pricing used"

### Review Screen

- User sees material with badge (Price guide/Estimated)
- Can open "Change Material" to browse catalog
- Can manually override price at any time
- Original pricing logic preserved for historical quotes

---

## Production Readiness Checklist

- [x] All 35 materials imported
- [x] Zero validation failures
- [x] Australian terminology verified
- [x] Midpoint pricing calculations confirmed
- [x] Tier 2 fallback coverage verified
- [x] Zero dollar protection in place
- [x] UI badge system functional
- [x] Material swapping tested
- [x] Historical quote protection confirmed
- [x] Catalog locked for production

---

## Next Steps

### Monitoring (Post-Launch)

1. Track catalog match rates in production
2. Monitor materials marked "Estimated" vs "Price guide"
3. Collect user feedback on pricing accuracy
4. Identify gaps in coverage from real quotes

### Future Enhancements (AU V2+)

1. Add more trade-specific materials based on usage patterns
2. Expand electrical and plumbing categories
3. Add regional pricing variations (metro vs rural)
4. Introduce seasonal pricing adjustments
5. Add labor rate guides per trade

---

## Technical Notes

### Database Schema
- Table: `material_catalog_items`
- No schema changes required
- All required indexes in place
- RLS policies active and tested

### Migration Reference
- Import executed: 2025-12-22
- Previous catalog count: 130 rows (cleared)
- New catalog count: 35 rows (production)
- Catalog version: AU V1

---

**Report Generated**: 2025-12-22
**Approved For Production**: YES
**Change Control Status**: LOCKED
