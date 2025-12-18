# Tax Policy for MVP

## Decision: Tax-Exclusive Pricing

All quotes and invoices in the MVP use **tax-exclusive pricing**.

### What This Means

- Line item prices DO NOT include GST/tax
- GST is calculated and displayed as a separate line item
- The total = subtotal + GST

### Example Quote Breakdown

```
Labour (10 hours @ $85/hr)    $850.00
Materials                      $200.00
                              --------
Subtotal                     $1,050.00
GST (10%)                      $105.00
                              --------
Total                        $1,155.00
```

### Implementation Details

**Backend:**
- `get_effective_pricing_profile()` returns `org_tax_inclusive: false`
- Quote calculations in edge functions assume tax-exclusive
- `default_tax_rate` is stored as percentage (e.g., 10 for 10%)

**Frontend:**
- All quote/invoice preview screens show GST as separate line
- Calculations in `src/lib/utils/calculations.ts` are tax-exclusive
- User inputs prices without tax

**Database:**
- `quotes.tax_inclusive` column exists but is unused in MVP (defaults to false)
- `organizations` table has NO `default_tax_inclusive` column
- `user_pricing_profiles` has NO `tax_inclusive` field

### Why Tax-Exclusive for MVP?

1. **Simplicity:** Easier for tradies to price - "$85/hour" is clear
2. **Australian standard:** Most B2B services quote GST separately
3. **Transparency:** Customers see exactly what GST they're paying
4. **Accounting:** Matches how QuickBooks/Xero handle GST

### Future: Tax-Inclusive Mode

If you need tax-inclusive pricing later:

1. Add `default_tax_inclusive` column to `organizations` table
2. Update `get_effective_pricing_profile()` to return the org setting
3. Add frontend toggle in Settings
4. Update calculation logic to extract tax from inclusive prices
5. Change invoice labels from "GST (10%)" to "Includes GST"

**DO NOT implement tax-inclusive mode without explicit user request.**

### Testing Tax Calculation

```sql
-- Verify all active profiles default to tax-exclusive
SELECT
  upp.id,
  upp.default_tax_rate,
  (SELECT get_effective_pricing_profile(upp.user_id)::json->>'org_tax_inclusive')::boolean as tax_inclusive
FROM user_pricing_profiles upp
WHERE upp.is_active = true;

-- Should return false for all rows
```
